/* P1 v6 audit: full practice backup / restore for THIS device (all ChiroClinic data kept in the browser).
   - Export: every chiroclinic_* key (+ p10_romView) in one JSON file with a manifest: format, version, time, counts and a
     SHA-256 of the payload. The file holds patient records (PHI): keep it on the practice Mac / encrypted drive only (POPIA s19).
   - Not exported (device-only state): chiroclinic_kiosk (kiosk PIN hash + on/off), chiroclinic_fb_config (cloud keys; Firebase is off),
     chiroclinic_ehr_sync_meta_v1 (this device's server sync markers).
   - Import: checks the file (JSON, format, payload hash, counts, every signed note and addendum hash) BEFORE anything changes,
     shows what will be restored, downloads a safety copy of the current data, then replaces all at once and rolls back on any error.
     A damaged, partial, edited or wrong file is refused and nothing on the device changes.
   - The clinic server (Mac, data/ folder) is not changed by a device restore; back that folder up separately (docs/P1_AUDIT_v6.md). */
(function () {
  'use strict';
  var FORMAT = 'chiroclinic-practice-backup', FORMAT_VERSION = 1;
  var EXCLUDE = { chiroclinic_kiosk: 1, chiroclinic_fb_config: 1, chiroclinic_ehr_sync_meta_v1: 1,
    // v7: device-only storage bookkeeping (p1-store.js)
    chiroclinic_visits_journal: 1, chiroclinic_store_v7: 1, chiroclinic_storage_log: 1 };
  var CONFLICTS = 'chiroclinic_visit_conflicts'; // v7: older copies of visits kept when two versions differed (stored in IndexedDB)
  var EXTRA = { p10_romView: 1 };
  function included(k) { return !EXCLUDE[k] && (/^chiroclinic_/.test(k) || !!EXTRA[k]); }
  function appCache() { return 'chiroclinic-v505-p1-latest-v20-rebuild-2026-10-22'; }
  async function sha256(t) { return window.ccSha256(String(t)); } // v7: works on the iPad over http:// too (p1-sha256.js)
  function parse(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
  function store() { return window.CCStore && CCStore.active ? CCStore : null; }
  function readKeys() { var o = {}, ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (included(k)) ks.push(k); }
    // v7: the visits live in IndexedDB (p1-store.js), not in localStorage's key list
    if (store() && ks.indexOf('chiroclinic_visits') < 0 && CCStore.json() != null) ks.push('chiroclinic_visits');
    ks.sort().forEach(function (k) { o[k] = localStorage.getItem(k); }); return o; }
  async function readAll() { var o = readKeys(); if (store()) { await CCStore.flush(); o = readKeys(); var c = await CCStore.conflictCopies(); if (c.length) o[CONFLICTS] = JSON.stringify(c); }
    var s = {}; Object.keys(o).sort().forEach(function (k) { s[k] = o[k]; }); return s; }
  function canonPayload(keys) { var o = {}; Object.keys(keys).sort().forEach(function (k) { o[k] = keys[k]; }); return JSON.stringify({ keys: o }); }
  function visitsOf(keys) { var a = parse(keys.chiroclinic_visits || '[]', null); return Array.isArray(a) ? a : null; }
  function counts(keys) {
    var v = visitsOf(keys) || [], reg = parse(keys.chiroclinic_patients_v1 || '{}', {}) || {}, pats = reg.patients || (Array.isArray(reg) ? reg : reg);
    var inbox = parse(keys.chiroclinic_intake_inbox || '[]', []), diary = parse(keys.chiroclinic_diary_v454_pwa || '{}', {}) || {};
    var signed = 0, addenda = 0, contactLog = 0, docLog = 0, rom = 0;
    v.forEach(function (x) { var p8 = (x && x.p8) || {}; if (p8.signed) signed++; addenda += (p8.addenda || []).length; contactLog += (p8.contactLog || []).length; docLog += (((x && x.docPractice) || {}).log || []).length;
      Object.keys((x && x.examData) || {}).forEach(function (r) { var D = x.examData[r] || {}; if (Object.keys(D).some(function (k) { return /^rom|ROM|_rom/.test(k); })) rom++; }); });
    return { visits: v.length, patients: Object.keys(pats || {}).length, signedVisits: signed, addenda: addenda, contactLogEntries: contactLog, docPracticeLogEntries: docLog, regionsWithRom: rom,
      intakeRecords: Array.isArray(inbox) ? inbox.length : 0, diaryEntries: (diary.entries || []).length, keys: Object.keys(keys).length };
  }
  // every signed note / addendum in the visits must still match its SHA-256 (same rules as P1 item 8)
  async function signatureCheck(keys) {
    var v = visitsOf(keys) || [], n = 0, bad = [];
    for (var i = 0; i < v.length; i++) { var x = v[i] || {}, p8 = x.p8 || {}, id = x.visitId || x.id || ('#' + i);
      if (p8.signed) { n++; if ((await sha256(String(p8.signed.note || ''))) !== p8.signed.sha256) bad.push(id + ' (signed note)');
        if (p8.signed.frozen && p8.signed.frozenSha256 && (await sha256(JSON.stringify(p8.signed.frozen))) !== p8.signed.frozenSha256) bad.push(id + ' (frozen copy)'); }
      var ad = p8.addenda || []; for (var j = 0; j < ad.length; j++) { var a = ad[j] || {}; n++; if ((await sha256(a.at + '|' + a.by + '|' + a.reason + '|' + a.text)) !== a.sha256) bad.push(id + ' (addendum ' + (j + 1) + ')'); } }
    return { checked: n, bad: bad };
  }
  async function build() {
    var keys = await readAll(), payload = canonPayload(keys);
    return { format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString(), app: appCache(), device: (navigator.platform || '') + ' ' + (navigator.maxTouchPoints > 1 ? 'touch' : ''),
      note: 'ChiroClinic practice backup — contains patient health records (POPIA special personal information). Keep it on the practice Mac or an encrypted drive. Do not e-mail or upload it.',
      excludedKeys: Object.keys(EXCLUDE), counts: counts(keys), signatures: await signatureCheck(keys), payloadSha256: await sha256(payload), payload: JSON.parse(payload) };
  }
  function fileName(tag) { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return 'ChiroClinic_practice_backup_' + (tag ? tag + '_' : '') + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.json'; }
  function download(text, name) { var blob = new Blob([text], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); }
  async function exportNow(tag) { var b = await build(), text = JSON.stringify(b); download(text, fileName(tag)); log('export', b); return { ok: true, name: fileName(tag), bytes: text.length, counts: b.counts, sha256: b.payloadSha256 }; }
  // audit trail of backup / restore actions, stored with the data (and so carried into the next backup)
  function log(action, b, extra) { try { var L = parse(localStorage.getItem('chiroclinic_backup_log') || '[]', []); if (!Array.isArray(L)) L = []; var pf = {}; try { pf = loadProfile(); } catch (e) {}
    L.push(Object.assign({ at: new Date().toISOString(), action: action, by: pf.name || '', counts: b && b.counts, payloadSha256: b && b.payloadSha256, createdAt: b && b.createdAt }, extra || {})); localStorage.setItem('chiroclinic_backup_log', JSON.stringify(L.slice(-200))); } catch (e) {} }
  // check a backup file; never changes anything
  async function inspect(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'The file is empty.' };
    var b = parse(text, undefined); if (b === undefined) return { ok: false, reason: 'The file is not complete JSON (damaged or cut off). Nothing was changed.' };
    if (!b || b.format !== FORMAT) return { ok: false, reason: 'This is not a ChiroClinic practice backup (a single-visit file opens with “Load”, not here).' };
    if (b.formatVersion !== FORMAT_VERSION) return { ok: false, reason: 'Backup format version ' + b.formatVersion + ' is not supported by this app version.' };
    if (!b.payload || !b.payload.keys || typeof b.payload.keys !== 'object') return { ok: false, reason: 'The backup has no data section.' };
    var keys = b.payload.keys, bad = Object.keys(keys).filter(function (k) { return !included(k) || EXCLUDE[k] || typeof keys[k] !== 'string'; });
    if (bad.length) return { ok: false, reason: 'Unexpected entries in the backup: ' + bad.slice(0, 5).join(', ') };
    var h = await sha256(canonPayload(keys)); if (h !== b.payloadSha256) return { ok: false, reason: 'The backup check-sum does not match: the file was changed or damaged after it was made. Nothing was changed.' };
    if (!visitsOf(keys) && keys.chiroclinic_visits != null) return { ok: false, reason: 'The visits list in the backup is damaged.' };
    var c = counts(keys), mc = b.counts || {}, diff = ['visits', 'patients', 'signedVisits', 'addenda', 'intakeRecords', 'diaryEntries'].filter(function (k) { return mc[k] !== c[k]; });
    if (diff.length) return { ok: false, reason: 'The backup contents do not match its own summary (' + diff.join(', ') + ').' };
    var sig = await signatureCheck(keys);
    return { ok: true, backup: b, counts: c, signatures: sig, createdAt: b.createdAt, app: b.app, warning: sig.bad.length ? sig.bad.length + ' signed note(s)/addenda fail their SHA-256 check: ' + sig.bad.slice(0, 5).join(', ') : '' };
  }
  // replace this device's data with the backup (all keys at once; rolls back on any error)
  async function restore(text, opt) {
    opt = opt || {}; var r = await inspect(text); if (!r.ok) return r;
    if (r.signatures.bad.length && opt.allowSignatureMismatch !== true) return { ok: false, reason: 'Refused: ' + r.warning + '. A signed record must not be changed. Nothing was changed.', signatures: r.signatures };
    var safety = null; if (opt.safetyCopy !== false) { try { safety = await exportNow('before-restore'); } catch (e) { return { ok: false, reason: 'Could not make the safety copy of the current data, so nothing was changed.' }; } }
    var snap = await readAll(), keys = r.backup.payload.keys;
    async function writeKeys(src) { Object.keys(readKeys()).forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(src).forEach(function (k) { if (k !== CONFLICTS) localStorage.setItem(k, src[k]); });
      if (store()) { await CCStore.restoreConflictCopies(src[CONFLICTS] ? parse(src[CONFLICTS], []) : []); var f = await CCStore.flush(); if (f.error) throw new Error('device database: ' + f.error);
        var d = await CCStore.verifyDisk(); if (!d.ok) throw new Error('device database read-back: ' + d.reason); } }
    async function sameAs(src, h) { var now = await readAll(); if ((await sha256(canonPayload(now))) === h) return true;
      // the visits text may differ only in formatting (an older backup written with spaces): compare parsed content for that key
      var a = Object.assign({}, now), b = Object.assign({}, src); ['chiroclinic_visits', CONFLICTS].forEach(function (k) { if (a[k] != null) a[k] = JSON.stringify(parse(a[k], null)); if (b[k] != null) b[k] = JSON.stringify(parse(b[k], null)); });
      if (canonPayload(a) === canonPayload(b)) return true;
      sameAs.diff = Object.keys(Object.assign({}, a, b)).filter(function (k) { return a[k] !== b[k]; }); return false; }
    // v7: pause background sync with the Mac while writing and checking, so nothing changes the data in between
    var wasPaused = window.CC_SYNC_PAUSED; window.CC_SYNC_PAUSED = true;
    try { if (typeof window.EHR_syncIdle === 'function') await window.EHR_syncIdle();
      try { await writeKeys(keys); if (!(await sameAs(keys, r.backup.payloadSha256))) throw new Error('verify after write failed' + (sameAs.diff && sameAs.diff.length ? ': ' + sameAs.diff.slice(0, 4).join(', ') : '')); }
      catch (e) { try { await writeKeys(snap); } catch (e2) {}
        return { ok: false, reason: 'Restore failed (' + (e && (e.name === 'QuotaExceededError' ? 'device storage full' : e.message)) + '); the previous data was put back.' }; }
    } finally { window.CC_SYNC_PAUSED = wasPaused; }
    log('restore', r.backup, { safetyCopy: safety && safety.name });
    return { ok: true, counts: r.counts, signatures: r.signatures, safetyCopy: safety && safety.name };
  }
  // ---- UI (Profile → Practice backup) ----
  function $(id) { return document.getElementById(id); }
  function say(t, bad) { var m = $('bkMsg'); if (m) { m.textContent = t; m.style.color = bad ? '#a00' : 'var(--text2)'; } }
  function summary(c) { return c.visits + ' visits, ' + c.patients + ' patients, ' + c.signedVisits + ' signed, ' + c.intakeRecords + ' intake forms, ' + c.diaryEntries + ' diary entries'; }
  function inject() {
    var modal = $('profileModal'); if (!modal || $('bkCard')) return; var save = modal.querySelector("button[data-cc-click=\"saveProfile()\"]"); var host = save ? save.parentNode : null; if (!host) return;
    var d = document.createElement('div'); d.id = 'bkCard'; d.style.cssText = 'margin-top:16px;padding:12px;border:1px solid var(--border);border-radius:8px';
    d.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Practice backup (this device)</div>' +
      '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">One file with every visit, signature, intake form, diary entry and setting stored on this device. It contains patient records: keep it on the practice Mac or an encrypted drive. Restoring replaces this device\u2019s data after checking the file; a safety copy of the current data is downloaded first. The clinic server is not changed.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="bkExport" style="min-height:44px;background:var(--accent);color:#fff;padding:10px 14px;border-radius:6px;font-weight:600">⬇ Make backup file</button>' +
      '<button type="button" id="bkImport" style="min-height:44px;background:var(--surface3);color:var(--text);padding:10px 14px;border-radius:6px;border:1px solid var(--border)">⬆ Restore from backup…</button>' +
      '<input type="file" id="bkFile" accept=".json,application/json" aria-label="Choose a practice backup file" style="display:none"></div><div id="bkMsg" role="status" style="font-size:12px;margin-top:6px"></div><div id="bkStore" style="font-size:12px;margin-top:8px;color:var(--text2)"></div>';
    host.parentNode.insertBefore(d, host);
    storeStatus();
    $('bkExport').onclick = function () { exportNow().then(function (r) { say('Backup made: ' + r.name + ' — ' + summary(r.counts) + '.'); }).catch(function (e) { say('Backup failed: ' + e.message, true); }); };
    $('bkImport').onclick = function () { $('bkFile').value = ''; $('bkFile').click(); };
    $('bkFile').onchange = function () { var f = this.files && this.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = async function () { var text = String(rd.result || ''), r = await inspect(text); if (!r.ok) { say(r.reason, true); return; }
        if (r.signatures.bad.length) { say('Refused: ' + r.warning + '. Nothing was changed.', true); return; }
        if (!confirm('Restore this backup?\n\nMade: ' + (typeof localStamp === 'function' ? localStamp(r.createdAt) : r.createdAt) + '\nContains: ' + summary(r.counts) + '\nSigned records checked: ' + r.signatures.checked + ' (all match)\n\nAll ChiroClinic data on THIS device will be replaced. A safety copy of the current data is downloaded first.')) { say('Restore cancelled. Nothing was changed.'); return; }
        var out = await restore(text); if (!out.ok) { say(out.reason, true); return; } say('Restored ' + summary(out.counts) + '. Safety copy: ' + out.safetyCopy + '. Reloading…'); setTimeout(function () { location.reload(); }, 1200); };
      rd.onerror = function () { say('Could not read the file. Nothing was changed.', true); }; rd.readAsText(f); };
  }
  // v7: where this device keeps its visits, and the backup made before the move
  function storeStatus() { var el = $('bkStore'); if (!el || !window.CCStore) return; CCStore.ready.then(async function () {
    var S = CCStore, m = S.migration || parse(localStorage.getItem('chiroclinic_store_v7') || 'null', null), est = await S.estimate(), pre = await S.preUpgradeBackup(), cc = await S.conflictCopies();
    var where = S.active ? 'the device database (IndexedDB, room for many thousands of visits)' : 'browser storage (about 5 MB) \u2014 ' + S.reason;
    var html = '<b>Storage:</b> ' + S.count() + ' visits in ' + where + '.';
    if (est && est.quota) html += ' Used ' + (est.usage / 1048576).toFixed(1) + ' MB of about ' + Math.round(est.quota / 1048576) + ' MB.';
    html += ' Protected from automatic clean-up: ' + (S.persisted === true ? 'yes' : S.persisted === false ? 'not granted' : 'not available here (needs https or the Mac itself)') + '.';
    if (m && m.from === 'localStorage' && m.verified) html += '<br>Moved from the old storage on ' + (typeof localStamp === 'function' ? localStamp(m.finishedAt) : m.finishedAt) + ': ' + m.visits + ' visits, ' + (m.signaturesChecked || 0) + ' signatures checked, all copied exactly.';
    el.innerHTML = html; var css = 'min-height:44px;margin:6px 6px 0 0;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface3);color:var(--text)';
    if (pre) { var b1 = document.createElement('button'); b1.type = 'button'; b1.id = 'bkPreDl'; b1.textContent = '\u2B07 Download the backup made before the move'; b1.style.cssText = css;
      b1.onclick = function () { download(pre, 'ChiroClinic_practice_backup_before-v7-move.json'); }; el.appendChild(b1); }
    if (cc.length) { var b2 = document.createElement('button'); b2.type = 'button'; b2.id = 'bkConfDl'; b2.textContent = '\u2B07 ' + cc.length + ' older visit copies (kept when two versions differed)'; b2.style.cssText = css;
      b2.onclick = function () { download(JSON.stringify(cc, null, 1), 'ChiroClinic_older_visit_copies.json'); }; el.appendChild(b2); }
  }); }
  window.P1Backup = { FORMAT: FORMAT, FORMAT_VERSION: FORMAT_VERSION, EXCLUDE: EXCLUDE, included: included, build: build, exportNow: exportNow, inspect: inspect, restore: restore, counts: counts, signatureCheck: signatureCheck, inject: inject, readKeys: readKeys, readAll: readAll, storeStatus: storeStatus };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
