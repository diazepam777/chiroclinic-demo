/* P1 v7: visits move from localStorage (about 5 MB, ≈600 visits) to IndexedDB (the browser's database; hundreds of MB).
 *
 * How it stays safe
 *  - Every visit is stored as its exact JSON text, one record per visit, plus the list order. Reading back gives the same bytes,
 *    so signature hashes keep verifying.
 *  - Every change is first written to a small journal in localStorage (synchronous), then to IndexedDB. The journal is cleared only
 *    after IndexedDB confirms. If the page closes in between, the journal is replayed at the next start.
 *  - First start on a device (migration): a full practice backup is made and kept inside the database, the visits are copied,
 *    then read back and checked (count, exact text of every visit, every signature hash). Only then is the old localStorage copy
 *    removed. If any check fails nothing is removed and the app keeps using localStorage.
 *  - The rest of the app still calls localStorage.getItem/setItem('chiroclinic_visits'). Those two calls (and removeItem/clear) are
 *    routed here for that one key only, so no module can bypass the database by accident.
 *  - A write made before the database is loaded never deletes anything (it is merged).
 *  - If IndexedDB is not available, the app stays exactly as v6 (localStorage).
 */
(function () {
  'use strict';
  var KEY = 'chiroclinic_visits', JKEY = 'chiroclinic_visits_journal', MKEY = 'chiroclinic_store_v7', LOGKEY = 'chiroclinic_storage_log';
  var DBN = 'chiroclinic_store', DBV = 1, BACKUP_ID = 'pre-v7-migration';
  var ls; try { ls = window.localStorage; } catch (e) { ls = null; }
  var P = window.Storage && Storage.prototype, oGet = P && P.getItem, oSet = P && P.setItem, oRem = P && P.removeItem, oClear = P && P.clear;
  var S = window.CCStore = { active: false, mode: 'localStorage', reason: 'starting', migration: null, persisted: null, lastError: null, conflicts: 0, writes: 0 };
  // memory: exact JSON text per storage key, in list order
  var order = [], jsonBy = Object.create(null), present = false, joined = null, db = null;
  var pending = null, seq = 0, doneSeq = 0, chain = Promise.resolve(), retryTimer = null;

  function nowISO() { return new Date().toISOString(); }
  function rawGet(k) { try { return oGet.call(ls, k); } catch (e) { return null; } }
  function rawSet(k, v) { oSet.call(ls, k, v); }
  function rawRem(k) { try { oRem.call(ls, k); } catch (e) {} }
  function log(ev, info) { try { var a = JSON.parse(rawGet(LOGKEY) || '[]'); if (!Array.isArray(a)) a = []; a.push(Object.assign({ at: nowISO(), ev: ev }, info || {})); while (a.length > 200) a.shift(); rawSet(LOGKEY, JSON.stringify(a)); } catch (e) {} }
  function idOf(v) { return v && typeof v === 'object' ? (v.visitId || v.id || '') : ''; }
  function djb2(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  // storage key per list item: its visit id; items without an id or with a repeated id get a stable derived key (never dropped)
  function keysFor(jsons, objs) { var seen = Object.create(null); return objs.map(function (v, i) { var id = String(idOf(v) || ''); var k = id ? 'v:' + id : 'n:' + djb2(jsons[i]);
    var base = k, n = 1; while (seen[k]) { k = base + '#' + (++n); } seen[k] = 1; return k; }); }
  function listJSON() { if (joined == null) joined = '[' + order.map(function (k) { return jsonBy[k]; }).join(',') + ']'; return joined; }

  // ---------- IndexedDB ----------
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function txDone(tx) { return new Promise(function (res, rej) { tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; tx.onabort = function () { rej(tx.error || new Error('aborted')); }; }); }
  function openDB() { return new Promise(function (res, rej) {
    if (!window.indexedDB) return rej(new Error('IndexedDB not available'));
    var r; try { r = indexedDB.open(DBN, DBV); } catch (e) { return rej(e); }
    r.onupgradeneeded = function () { var d = r.result; ['visits', 'meta', 'backups', 'conflicts'].forEach(function (n) { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
    r.onsuccess = function () { var d = r.result; d.onversionchange = function () { d.close(); }; res(d); }; r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error('IndexedDB blocked by another tab')); }; }); }
  function loadAll() {
    var tx = db.transaction(['visits', 'meta'], 'readonly'), vs = tx.objectStore('visits');
    return Promise.all([req(vs.getAllKeys()), req(vs.getAll()), req(tx.objectStore('meta').get('order'))]).then(function (r) {
      var map = Object.create(null); r[0].forEach(function (k, i) { map[k] = r[1][i]; });
      var ord = Array.isArray(r[2]) ? r[2].filter(function (k) { return k in map; }) : [], inOrd = Object.create(null); ord.forEach(function (k) { inOrd[k] = 1; });
      Object.keys(map).sort().forEach(function (k) { if (!inOrd[k]) ord.push(k); }); // a record missing from the order list is still kept
      return { order: ord, map: map };
    });
  }
  function persistOps(ops) { // ops: {clear, puts:{k:json}, dels:[k], order:[k]}
    var tx = db.transaction(['visits', 'meta'], 'readwrite'), vs = tx.objectStore('visits');
    if (ops.clear) vs.clear();
    (ops.dels || []).forEach(function (k) { vs.delete(k); });
    Object.keys(ops.puts || {}).forEach(function (k) { vs.put(ops.puts[k], k); });
    tx.objectStore('meta').put(ops.order || [], 'order');
    return txDone(tx);
  }
  function putOne(store, key, val) { var tx = db.transaction([store], 'readwrite'); tx.objectStore(store).put(val, key); return txDone(tx); }
  function getOne(store, key) { return req(db.transaction([store], 'readonly').objectStore(store).get(key)); }
  function allOf(store) { var tx = db.transaction([store], 'readonly'), s = tx.objectStore(store); return Promise.all([req(s.getAllKeys()), req(s.getAll())]).then(function (r) { return r[0].map(function (k, i) { return { key: k, value: r[1][i] }; }); }); }

  // ---------- writes ----------
  function mergePending(ops) {
    if (!pending) pending = { clear: false, puts: {}, dels: [], order: [] };
    if (ops.clear) { pending = { clear: true, puts: {}, dels: [], order: [] }; }
    (ops.dels || []).forEach(function (k) { delete pending.puts[k]; if (pending.dels.indexOf(k) < 0) pending.dels.push(k); });
    Object.keys(ops.puts || {}).forEach(function (k) { pending.puts[k] = ops.puts[k]; var i = pending.dels.indexOf(k); if (i >= 0) pending.dels.splice(i, 1); });
    pending.order = ops.order.slice();
  }
  function writeJournal() { try { rawSet(JKEY, JSON.stringify({ at: nowISO(), seq: seq, ops: pending })); S.unjournaled = false; return true; } catch (e) { S.unjournaled = true; return false; } }
  function schedule(ops) {
    var my = ++seq; S.writes++;
    mergePending(ops); writeJournal();
    var run = function () { return persistOps(ops).then(function () { doneSeq = my; if (doneSeq === seq) { pending = null; rawRem(JKEY); S.unjournaled = false; } S.lastError = null; },
      function (err) { S.lastError = (err && (err.name + ': ' + err.message)) || 'write failed'; log('write-error', { error: S.lastError });
        warn('error', 'A visit could not be written to this device\u2019s database (' + S.lastError + '). It is kept in memory and will be retried; make a practice backup now.');
        // retry the whole pending set once more a little later (the journal still holds it)
        if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; if (pending) schedule({ clear: pending.clear, puts: pending.puts, dels: pending.dels, order: order.slice() }); }, 4000); }); };
    chain = chain.then(run, run); return chain;
  }
  function replaceAll(arr, opts) {
    opts = opts || {}; arr = Array.isArray(arr) ? arr : [];
    var jsons = arr.map(function (v) { return JSON.stringify(v === undefined ? null : v); }), keys = keysFor(jsons, arr);
    var puts = {}, dels = [], newSet = Object.create(null), changed = false;
    keys.forEach(function (k, i) { newSet[k] = 1; if (jsonBy[k] !== jsons[i]) { puts[k] = jsons[i]; changed = true; } });
    if (opts.mergeOnly) { // never delete: keep every current key that the caller did not mention, in its place
      order.forEach(function (k) { if (!newSet[k]) { keys.push(k); jsons.push(jsonBy[k]); newSet[k] = 1; } }); }
    else order.forEach(function (k) { if (!newSet[k]) { dels.push(k); changed = true; } });
    if (!changed && keys.length === order.length && keys.every(function (k, i) { return order[i] === k; })) { present = present || opts.present !== false; return chain; }
    dels.forEach(function (k) { delete jsonBy[k]; });
    keys.forEach(function (k, i) { jsonBy[k] = jsons[i]; });
    order = keys; joined = null; present = opts.present !== false;
    return schedule({ clear: false, puts: puts, dels: dels, order: order.slice() });
  }
  function clearAll() { order = []; jsonBy = Object.create(null); joined = null; present = false; return schedule({ clear: true, puts: {}, dels: [], order: [] }); }

  // ---------- the localStorage bridge (this one key only) ----------
  function isLS(o) { return o === ls; }
  if (P) {
    P.getItem = function (k) { if (S.active && isLS(this) && String(k) === KEY) return (present || order.length) ? listJSON() : null; return oGet.apply(this, arguments); };
    P.setItem = function (k, v) {
      if (S.active && isLS(this) && String(k) === KEY) { var a; try { a = JSON.parse(String(v)); } catch (e) { a = null; }
        if (!Array.isArray(a)) { log('bad-visits-write', { length: String(v).length }); var err = new TypeError('chiroclinic_visits must be a JSON array'); throw err; }
        replaceAll(a); return; }
      return oSet.apply(this, arguments); };
    P.removeItem = function (k) { if (S.active && isLS(this) && String(k) === KEY) { clearAll(); return; } return oRem.apply(this, arguments); };
    P.clear = function () { var r = oClear.apply(this, arguments); if (S.active && isLS(this)) clearAll(); return r; };
  }

  // ---------- signature check (same rules as p1-backup.js) ----------
  function sigCheck(visits) {
    var n = 0, bad = [], jobs = [];
    visits.forEach(function (v) { var p8 = v && v.p8, id = idOf(v); if (!p8) return;
      if (p8.signed) { n++; jobs.push(window.ccSha256(String(p8.signed.note || '')).then(function (h) { if (h !== p8.signed.sha256) bad.push(id + ' (signed note)'); }));
        if (p8.signed.frozen && p8.signed.frozenSha256) jobs.push(window.ccSha256(JSON.stringify(p8.signed.frozen)).then(function (h) { if (h !== p8.signed.frozenSha256) bad.push(id + ' (frozen copy)'); })); }
      (p8.addenda || []).forEach(function (a) { a = a || {}; n++; jobs.push(window.ccSha256(a.at + '|' + a.by + '|' + a.reason + '|' + a.text).then(function (h) { if (h !== a.sha256) bad.push(id + ' (addendum)'); })); }); });
    return Promise.all(jobs).then(function () { bad.sort(); return { checked: n, bad: bad }; });
  }

  // ---------- start ----------
  function domReady() { return new Promise(function (r) { if (document.readyState !== 'loading') r(); else document.addEventListener('DOMContentLoaded', function () { r(); }); }); }
  function warn(kind, msg, action) { S.messages = S.messages || []; S.messages.push({ kind: kind, msg: msg }); if (typeof window.EHR_storageBanner === 'function') window.EHR_storageBanner(kind, msg, action); else S.pendingBanner = { kind: kind, msg: msg, action: action }; }
  function adopt(loaded) { order = loaded.order; jsonBy = Object.create(null); loaded.order.forEach(function (k) { jsonBy[k] = loaded.map[k]; }); joined = null; present = order.length > 0; }
  function replayJournal() {
    var j; try { j = JSON.parse(rawGet(JKEY) || 'null'); } catch (e) { j = null; }
    if (!j || !j.ops) return null; var o = j.ops;
    if (o.clear) { order = []; jsonBy = Object.create(null); }
    (o.dels || []).forEach(function (k) { delete jsonBy[k]; });
    Object.keys(o.puts || {}).forEach(function (k) { jsonBy[k] = o.puts[k]; });
    var ord = (o.order || []).filter(function (k) { return k in jsonBy; }), inO = Object.create(null); ord.forEach(function (k) { inO[k] = 1; });
    order.concat(Object.keys(jsonBy)).forEach(function (k) { if (!inO[k] && k in jsonBy) { ord.push(k); inO[k] = 1; } });
    order = ord; joined = null; present = order.length > 0 || !o.clear;
    return persistOps({ clear: true, puts: jsonBy, dels: [], order: order.slice() }).then(function () { rawRem(JKEY); log('journal-replayed', { at: j.at, visits: order.length }); return true; });
  }
  // merge a list found in the old localStorage key into the store (used after migration, e.g. an old v6 tab still open wrote it)
  function mergeLegacy(arr) {
    var cur = JSON.parse(listJSON()), at = Object.create(null), conflicts = [];
    cur.forEach(function (v, i) { var id = idOf(v); if (id) at[id] = i; });
    arr.forEach(function (v) { var id = idOf(v); if (!id || at[id] == null) { cur.push(v); return; }
      var mine = cur[at[id]]; if (sameContent(mine, v)) return;
      var newer = String((v && v.updatedAt) || '') > String((mine && mine.updatedAt) || '');
      conflicts.push(newer ? mine : v); if (newer) cur[at[id]] = v; });
    return Promise.all(conflicts.map(function (c) { return keepConflict(c, 'old-localStorage-copy'); })).then(function () { replaceAll(cur); return { merged: arr.length, conflicts: conflicts.length }; });
  }
  // device-only sync markers do not count as a difference
  function sameContent(a, b) { try { var x = Object.assign({}, a), y = Object.assign({}, b); ['source', 'pendingPush', 'serverSavedAt', 'syncedAt', 'updatedAt'].forEach(function (k) { delete x[k]; delete y[k]; }); return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; } }
  function keepConflict(v, why) { S.conflicts++; var rec = { at: nowISO(), why: why, visit: v }; return putOne('conflicts', idOf(v) + '@' + rec.at + '#' + Math.random().toString(36).slice(2, 7), JSON.stringify(rec)).catch(function () {}); }

  function migrate(raw) {
    var arr; try { arr = JSON.parse(raw); } catch (e) { arr = null; }
    if (!Array.isArray(arr)) { S.reason = 'old visits list is damaged: left as it is'; log('migration-skipped-damaged', {}); warn('error', 'The visits list on this device could not be read, so it was left exactly as it was (not moved). Make a practice backup and contact support.'); return Promise.resolve(false); }
    var info = { from: 'localStorage', visits: arr.length, startedAt: nowISO() };
    return domReady().then(function () {
      if (!window.P1Backup || !P1Backup.build) throw new Error('backup module missing');
      return P1Backup.build();
    }).then(function (b) {
      var text = JSON.stringify(b); info.backupBytes = text.length; info.backupVisits = b.manifest && b.manifest.counts ? b.manifest.counts.visits : null;
      return putOne('backups', BACKUP_ID, text).then(function () { return getOne('backups', BACKUP_ID); }).then(function (back) { if (back !== text) throw new Error('backup read-back differs'); return window.ccSha256(text); });
    }).then(function (h) { info.backupSha256 = h;
      var jsons = arr.map(function (v) { return JSON.stringify(v === undefined ? null : v); }), keys = keysFor(jsons, arr), puts = {}, inRaw = Object.create(null);
      keys.forEach(function (k, i) { puts[k] = jsons[i]; inRaw[k] = 1; });
      // the database should be empty here; if an earlier attempt left visits that are not in the old list, they are kept (appended)
      order.forEach(function (k) { if (!inRaw[k]) { keys.push(k); jsons.push(jsonBy[k]); puts[k] = jsonBy[k]; info.keptFromEarlierAttempt = (info.keptFromEarlierAttempt || 0) + 1; } });
      return persistOps({ clear: true, puts: puts, dels: [], order: keys }).then(function () { return loadAll(); }).then(function (back) {
        // verify: same count, same order, exact same text for every visit
        if (back.order.length !== keys.length) throw new Error('count differs after copy: ' + back.order.length + ' of ' + keys.length);
        for (var i = 0; i < keys.length; i++) { if (back.order[i] !== keys[i] || back.map[keys[i]] !== jsons[i]) throw new Error('visit ' + (i + 1) + ' differs after copy'); }
        return Promise.all([sigCheck(jsons.map(function (j) { return JSON.parse(j); })), sigCheck(back.order.map(function (k) { return JSON.parse(back.map[k]); }))]).then(function (sc) {
          if (sc[0].checked !== sc[1].checked || sc[0].bad.join('|') !== sc[1].bad.join('|')) throw new Error('signature check differs after copy');
          info.signaturesChecked = sc[1].checked; info.signaturesBad = sc[1].bad.length; info.signaturesBadList = sc[1].bad.slice(0, 20);
          return back; }); });
    }).then(function (back) {
      // a write that reached the old key while we were copying is merged, then the old key is removed
      var again = rawGet(KEY); adopt(back);
      var extra = (again != null && again !== raw) ? JSON.parse(again) : null;
      rawRem(KEY); info.finishedAt = nowISO(); info.verified = true;
      rawSet(MKEY, JSON.stringify(info)); log('migrated', info); S.migration = info;
      return extra && Array.isArray(extra) ? (S.active = true, mergeLegacy(extra)).then(function () { return true; }) : true;
    }).catch(function (e) {
      info.error = (e && e.message) || String(e); log('migration-failed', info); S.migration = info; S.reason = 'migration not finished: ' + info.error + ' (visits stay in localStorage)';
      warn('error', 'Moving this device\u2019s visits to the larger storage did not finish (' + info.error + '). Nothing was removed: the app keeps using the old storage. Make a practice backup and contact support.');
      return false;
    });
  }

  S.ready = (function () {
    if (!ls || !P) { S.reason = 'no localStorage'; return Promise.resolve(S); }
    return openDB().then(function (d) { db = d; return loadAll(); }).then(function (loaded) {
      adopt(loaded);
      return replayJournal();
    }).then(function () {
      var raw = rawGet(KEY), done = rawGet(MKEY);
      if (raw == null) { if (!done) { rawSet(MKEY, JSON.stringify({ from: 'none', visits: 0, verified: true, finishedAt: nowISO() })); log('new-device', {}); } return true; }
      if (!done) return migrate(raw);
      // already moved (or the database already has visits): merge, never delete
      var arr; try { arr = JSON.parse(raw); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) { log('legacy-key-damaged-kept', { length: raw.length }); return true; }
      S.active = true;
      return mergeLegacy(arr).then(function (r) { rawRem(KEY); if (!done) rawSet(MKEY, JSON.stringify({ from: 'merge', visits: order.length, verified: true, finishedAt: nowISO() })); log('legacy-merged', r); return true; });
    }).then(function (ok) {
      if (ok === false) { S.active = false; S.mode = 'localStorage'; return S; }
      S.active = true; S.mode = 'indexeddb'; S.reason = 'ok';
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (p) { S.persisted = p; }, function () { S.persisted = false; }); else S.persisted = null; } catch (e) {}
      try { var bc = new BroadcastChannel('chiroclinic_store'); S._bc = bc; bc.onmessage = function () { if (pending) return; var at = seq; loadAll().then(function (l) { if (!pending && seq === at) adopt(l); }).catch(function () {}); }; } catch (e) {}
      return S;
    }).catch(function (e) { S.active = false; S.mode = 'localStorage'; S.reason = 'IndexedDB unavailable: ' + ((e && e.message) || e); log('idb-unavailable', { error: S.reason }); return S; });
  })();
  var _schedule = schedule; schedule = function (ops) { var p = _schedule(ops); p.then(function () { try { if (S._bc) S._bc.postMessage({ seq: seq }); } catch (e) {} }); return p; };

  // ---------- public helpers ----------
  S.flush = function () { return chain.then(function () { return { pending: !!pending, error: S.lastError }; }); };
  S.count = function () { return S.active ? order.length : (function () { try { var a = JSON.parse(rawGet(KEY) || '[]'); return Array.isArray(a) ? a.length : 0; } catch (e) { return 0; } })(); };
  S.json = function () { return S.active ? listJSON() : rawGet(KEY); };
  S.replaceAll = function (arr) { if (!S.active) { rawSet(KEY, JSON.stringify(arr)); return Promise.resolve(); } replaceAll(arr); return S.flush(); };
  S.preUpgradeBackup = function () { return db ? getOne('backups', BACKUP_ID) : Promise.resolve(null); };
  S.conflictCopies = function () { return db ? allOf('conflicts').then(function (r) { return r.map(function (x) { try { return JSON.parse(x.value); } catch (e) { return null; } }).filter(Boolean); }) : Promise.resolve([]); };
  S.restoreConflictCopies = function (list) { if (!db) return Promise.resolve(); var tx = db.transaction(['conflicts'], 'readwrite'), st = tx.objectStore('conflicts'); st.clear(); (list || []).forEach(function (rec, i) { st.put(JSON.stringify(rec), idOf(rec.visit) + '@' + (rec.at || '') + '#r' + i); }); return txDone(tx); };
  S.keepConflict = keepConflict;
  // read the database back and compare with memory (used after a restore)
  S.verifyDisk = function () { if (!S.active || !db) return Promise.resolve({ ok: true, skipped: true });
    return S.flush().then(function () { return loadAll(); }).then(function (l) {
      if (l.order.length !== order.length) return { ok: false, reason: 'count ' + l.order.length + ' vs ' + order.length };
      for (var i = 0; i < order.length; i++) if (l.order[i] !== order[i] || l.map[order[i]] !== jsonBy[order[i]]) return { ok: false, reason: 'visit ' + (i + 1) + ' differs' };
      return { ok: true, count: order.length }; }); };
  S.estimate = function () { try { return navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };
  S.log = function () { try { return JSON.parse(rawGet(LOGKEY) || '[]'); } catch (e) { return []; } };
  S.sigCheck = sigCheck;
  S.KEYS = { visits: KEY, journal: JKEY, marker: MKEY, log: LOGKEY };

  // ---------- P1 v9: per-patient index and the single data-access layer (window.CCData) ----------
  // Every module reads visits through CCData. CCData.all() is exactly the old JSON.parse(localStorage.getItem('chiroclinic_visits') || '[]').
  // The per-patient / per-visit reads return a CANDIDATE SET in the original list order: every visit that could possibly match
  // (same String(patientId), or same derived patient key, or an anonymous visit, or a matching visit id). Each caller then runs its
  // original filter unchanged on that set, so the result is the same as filtering the whole list, but only that patient's visits are
  // parsed. Any doubt (store not active, unusual id, unreadable record) returns null and the caller uses the whole list as before.
  // The index is mirrored to IndexedDB in a separate database 'chiroclinic_vindex' (multiEntry index 'pid' and 'vid') so it does not
  // have to be rebuilt at every start. The visits database itself is untouched (still version 1, same records), so v8 can still open it.
  // Each index record carries a hash of the visit's exact JSON; at start any record whose hash does not match is rebuilt from the visit.
  var VDBN = 'chiroclinic_vindex', VDBV = 1, vdb = null, diskQ = { put: Object.create(null), del: Object.create(null) }, diskTimer = null;
  var mJson = Object.create(null), mMeta = Object.create(null), bP = Object.create(null), bI = Object.create(null), anon = Object.create(null);
  var idxOrder = null, pos = Object.create(null);
  var IX = S.index = { reconciles: 0, parsed: 0, fromDisk: 0, diskWrites: 0, diskError: null, lastReconcileMs: null, seeded: false, fastSaves: 0, fullSaves: 0 };
  // the deterministic part of ehr-p0 makePatientKey (id/file no, else last_first_dob); '' means "anonymous" (ehr-p0 then uses the device seed)
  function patientKeyPure(patient) {
    patient = patient || {};
    var raw = String(patient.id || patient.fileNo || '').replace(/[^a-zA-Z0-9_-]/g, '').trim();
    if (raw) return raw;
    var name = ((patient.lastName || '') + '_' + (patient.firstName || '') + '_' + (patient.dob || '')).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (name.replace(/_/g, '')) return 'n_' + name;
    return '';
  }
  function metaOf(v) { if (!v) return null; // a falsy entry never matches any reader's filter
    var ids = []; if (typeof v.visitId === 'string') ids.push(v.visitId); if (typeof v.id === 'string' && v.id !== v.visitId) ids.push(v.id);
    return { p: v.patientId ? String(v.patientId) : '?', k: patientKeyPure(v.patient || {}), i: ids }; }
  function bAdd(b, val, k) { (b[val] || (b[val] = Object.create(null)))[k] = 1; }
  function bDel(b, val, k) { var s = b[val]; if (s) { delete s[k]; for (var x in s) return; delete b[val]; } }
  function addMeta(k, m) { mMeta[k] = m; if (!m) return; bAdd(bP, m.p, k); if (m.k) bAdd(bP, m.k, k); else anon[k] = 1; m.i.forEach(function (id) { bAdd(bI, id, k); }); }
  function delMeta(k) { var m = mMeta[k]; delete mMeta[k]; if (!m) return; bDel(bP, m.p, k); if (m.k) bDel(bP, m.k, k); else delete anon[k]; m.i.forEach(function (id) { bDel(bI, id, k); }); }
  function hashOf(j) { return j.length + ':' + djb2(j); }
  function diskRec(k) { var m = mMeta[k]; return { h: hashOf(mJson[k]), pids: m ? (m.k ? [m.p, m.k] : [m.p, '@anon']) : [], ids: m ? m.i.slice() : [], n: m ? 1 : 0 }; }
  function queueDisk(puts, dels) { if (!vdb) return; puts.forEach(function (k) { diskQ.put[k] = 1; delete diskQ.del[k]; }); dels.forEach(function (k) { diskQ.del[k] = 1; delete diskQ.put[k]; });
    if (!diskTimer) diskTimer = setTimeout(flushDisk, 300); }
  function flushDisk() { diskTimer = null; if (!vdb) return; var q = diskQ; diskQ = { put: Object.create(null), del: Object.create(null) };
    try { var tx = vdb.transaction(['vmeta'], 'readwrite'), st = tx.objectStore('vmeta'), n = 0;
      Object.keys(q.del).forEach(function (k) { st.delete(k); n++; });
      Object.keys(q.put).forEach(function (k) { if (k in mJson) { st.put(diskRec(k), k); n++; } });
      txDone(tx).then(function () { IX.diskWrites += n; IX.diskError = null; }, function (e) { IX.diskError = String(e && e.message || e); });
    } catch (e) { IX.diskError = String(e && e.message || e); } }
  // bring the in-memory index up to date with the store (only visits whose text changed are parsed)
  function ensureIndex() {
    if (!S.active) return false;
    if (idxOrder === order) return true;
    var t0 = (window.performance && performance.now()) || Date.now(), live = Object.create(null), np = Object.create(null), changed = [], gone = [];
    for (var i = 0; i < order.length; i++) { var k = order[i], j = jsonBy[k]; live[k] = 1; np[k] = i;
      if (mJson[k] !== j) { var v; try { v = JSON.parse(j); } catch (e) { idxOrder = null; IX.lastError = 'record ' + k + ' unreadable'; return false; }
        delMeta(k); addMeta(k, metaOf(v)); mJson[k] = j; changed.push(k); IX.parsed++; } }
    Object.keys(mJson).forEach(function (k) { if (!live[k]) { delMeta(k); delete mJson[k]; gone.push(k); } });
    pos = np; idxOrder = order; IX.reconciles++; IX.lastReconcileMs = Math.round(((window.performance && performance.now()) || Date.now()) - t0);
    queueDisk(changed, gone); return true;
  }
  function pick(sets) { var seen = Object.create(null), ks = [];
    sets.forEach(function (s) { if (s) for (var k in s) if (!seen[k]) { seen[k] = 1; ks.push(k); } });
    return ks.sort(function (a, b) { return pos[a] - pos[b]; }); }
  function parseKeys(ks) { var out = new Array(ks.length); for (var i = 0; i < ks.length; i++) out[i] = JSON.parse(jsonBy[ks[i]]); return out; }
  function forPatientKeys(pid, pipe) { if (typeof pid !== 'string' || !pid || !ensureIndex()) return null; var sets = [bP[pid], anon];
    // item3 groups visits by (patientId || '?') + '|' + region; with pipe set, ids that could run into that key across a '|' are included too
    if (pipe) { var parts = pid.split('|'); for (var i = 1; i < parts.length; i++) sets.push(bP[parts.slice(0, i).join('|')]);
      for (var val in bP) if (val.indexOf(pid + '|') === 0) sets.push(bP[val]); }
    return pick(sets); }
  function guard(f) { try { return f(); } catch (e) { IX.lastError = String(e && e.message || e); return null; } }
  // seed the in-memory index from the IndexedDB copy (records whose hash still matches the visit text), then reconcile the rest
  function openVDB() { return new Promise(function (res, rej) { var r; try { r = indexedDB.open(VDBN, VDBV); } catch (e) { return rej(e); }
    r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains('vmeta')) { var st = d.createObjectStore('vmeta'); st.createIndex('pid', 'pids', { multiEntry: true }); st.createIndex('vid', 'ids', { multiEntry: true }); } };
    r.onsuccess = function () { var d = r.result; d.onversionchange = function () { d.close(); vdb = null; }; res(d); }; r.onerror = function () { rej(r.error); }; r.onblocked = function () { rej(new Error('index database blocked')); }; }); }
  function seedIndex() {
    return openVDB().then(function (d) { vdb = d; var tx = d.transaction(['vmeta'], 'readonly'), st = tx.objectStore('vmeta');
      return Promise.all([req(st.getAllKeys()), req(st.getAll())]); }).then(function (r) {
      var t0 = (window.performance && performance.now()) || Date.now(), disk = Object.create(null), n = 0, stale = [];
      r[0].forEach(function (k, i) { disk[k] = r[1][i]; });
      if (idxOrder !== order) order.forEach(function (k) { var d = disk[k], j = jsonBy[k]; if (!d || mJson[k] === j) return;
        if (d.h === hashOf(j)) { var m = d.n ? { p: d.pids[0], k: d.pids[1] === '@anon' ? '' : d.pids[1], i: d.ids || [] } : null; delMeta(k); addMeta(k, m); mJson[k] = j; n++; } });
      Object.keys(disk).forEach(function (k) { if (!(k in jsonBy)) stale.push(k); });
      IX.fromDisk = n; IX.seedMs = Math.round(((window.performance && performance.now()) || Date.now()) - t0);
      idxOrder = null; ensureIndex(); queueDisk([], stale); IX.seeded = true; return IX;
    }).catch(function (e) { IX.diskError = 'index database unavailable: ' + ((e && e.message) || e); vdb = null; ensureIndex(); IX.seeded = true; return IX; });
  }
  S.ready.then(function () { if (S.active) S.indexReady = seedIndex(); });
  // keep the index (and its IndexedDB copy) fresh shortly after any change, so the next read does not pay for it
  var idleTimer = null; function idleIndex() { if (!idleTimer) idleTimer = setTimeout(function () { idleTimer = null; if (IX.seeded) ensureIndex(); }, 250); }
  var _sched2 = schedule; schedule = function (ops) { var p = _sched2(ops); idleIndex(); return p; };

  var D = window.CCData = {
    KEY: KEY,
    patientKeyPure: patientKeyPure,
    // the whole list, exactly as before (all modules used this expression)
    all: function () { return JSON.parse(localStorage.getItem(KEY) || '[]'); },
    json: function () { return localStorage.getItem(KEY); },
    writeAll: function (arr) { localStorage.setItem(KEY, JSON.stringify(arr)); },
    // candidates for one patient (superset, original order) or null = use the whole list
    forPatient: function (pid) { return guard(function () { var ks = forPatientKeys(pid); return ks ? parseKeys(ks) : null; }); },
    forPatientEpisodes: function (pid) { return guard(function () { var ks = forPatientKeys(pid, true); return ks ? parseKeys(ks) : null; }); },
    // the same with each visit's position in the whole list: [[visit, index], ...]
    forPatientIndexed: function (pid) { return guard(function () { var ks = forPatientKeys(pid); return ks ? ks.map(function (k) { return [JSON.parse(jsonBy[k]), pos[k]]; }) : null; }); },
    // candidates for one visit id (visitId or id), original order, or null
    byId: function (id) { return guard(function () { if (typeof id !== 'string' || !id || !ensureIndex()) return null; return parseKeys(pick([bI[id]])); }); },
    // the visit at a list position, as visits[i] would give ({v: visit-or-undefined}), or null
    at: function (i) { return guard(function () { if (!/^(0|[1-9][0-9]*)$/.test(String(i)) || !S.active) return null; var k = order[Number(i)]; return { v: k == null ? undefined : JSON.parse(jsonBy[k]) }; }); },
    // P1 v9: save ONE visit without rewriting all of them. Used only when the result is provably the same as the old
    // read-all / replace-or-append / write-all (same position, same storage key, one changed record); otherwise returns false
    // and the caller does the old full write. The write itself goes through the same journal -> IndexedDB path.
    upsertOne: function (data) {
      if (!S.active || !data || typeof data.visitId !== 'string' || !data.visitId || !ensureIndex()) return false;
      var json = JSON.stringify(data); if (typeof json !== 'string') return false;
      var id = data.visitId, nk = 'v:' + id, hit = null, ks = pick([bI[id]]);
      for (var i = 0; i < ks.length; i++) { var v = JSON.parse(jsonBy[ks[i]]); if (v && (v.visitId === id || v.id === id)) { hit = ks[i]; break; } }
      if (hit != null && hit !== nk) return false;          // replaced item would get a different storage key: use the full path
      if (hit == null && (nk in jsonBy)) return false;      // append whose key is taken: use the full path
      var m; try { m = metaOf(JSON.parse(json)); } catch (e) { return false; }
      IX.fastSaves++;
      if (hit != null && jsonBy[nk] === json) { present = true; return true; } // nothing changed (the old path wrote nothing either)
      jsonBy[nk] = json; joined = null; present = true;
      order = hit != null ? order.slice() : order.concat([nk]);
      delMeta(nk); addMeta(nk, m); mJson[nk] = json; if (hit == null) pos[nk] = order.length - 1; idxOrder = order;
      schedule({ clear: false, puts: (function () { var o = {}; o[nk] = json; return o; })(), dels: [], order: order.slice() });
      queueDisk([nk], []); return true;
    },
    noteFullSave: function () { IX.fullSaves++; },
    // tests / diagnostics: what the IndexedDB index holds for a patient (storage keys, original order)
    diskKeysFor: function (pid) { if (!vdb) return Promise.resolve(null); return flushQ().then(function () { var st = vdb.transaction(['vmeta'], 'readonly').objectStore('vmeta').index('pid');
      return Promise.all([req(st.getAllKeys(IDBKeyRange.only(String(pid)))), req(st.getAllKeys(IDBKeyRange.only('@anon')))]); }).then(function (r) {
      var seen = Object.create(null), ks = []; r[0].concat(r[1]).forEach(function (k) { if (!seen[k]) { seen[k] = 1; ks.push(k); } }); ensureIndex(); return ks.sort(function (a, b) { return pos[a] - pos[b]; }); }); },
    memKeysFor: function (pid) { return forPatientKeys(pid); },
    stats: function () { return Object.assign({ active: S.active, visits: order.length, patients: Object.keys(bP).length, anonymous: Object.keys(anon).length, diskOpen: !!vdb }, IX); }
  };
  function flushQ() { if (diskTimer) { clearTimeout(diskTimer); diskTimer = null; } ensureIndex(); if (diskTimer) { clearTimeout(diskTimer); diskTimer = null; } flushDisk(); return new Promise(function (r) { setTimeout(r, 30); }); }
  window.addEventListener('pagehide', function () { if (pending) writeJournal(); });
})();
