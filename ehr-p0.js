/* ChiroClinic Best EHR P0 — local patient registry, visit timeline, SOAP→HEP, Node chart sync.
   Firebase stays OFF. Melkbosstrand deploy HOLD. */
(function () {
  'use strict';

  var PATIENTS_KEY = 'chiroclinic_patients_v1';
  var VISITS_KEY = 'chiroclinic_visits';
  var FREE_NOTES_KEY = 'chiroclinic_free_notes_v454';
  var SYNC_META_KEY = 'chiroclinic_ehr_sync_meta_v1';
  var ANON_KEY = 'chiroclinic_anon_patient_seed';

  var EHR = {
    mode: 'detecting', // server | local | detecting
    lastSynced: null,
    serverUpdatedAt: null,
    currentPatientId: null,
    currentVisitId: null,
    hadServerThisSession: false,
    conflictNotice: null,
    visitSoapStep: 'S'
  };
  window.EHR = EHR;

  function todayISO() {
    return localISODate();
  }
  function nowISO() {
    return new Date().toISOString();
  }
  function safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // P1 v6 audit: a value used as a JS string argument inside an onclick attribute (JSON string, then HTML-escaped)
  function jsArg(s) { return esc(JSON.stringify(String(s == null ? '' : s))); }
  function localId() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ---------- Registry ----------
  function readRegistry() {
    var raw = safeParse(localStorage.getItem(PATIENTS_KEY) || '{}', {});
    if (Array.isArray(raw)) {
      var map = {};
      raw.forEach(function (p) { if (p && p.id) map[p.id] = p; });
      return map;
    }
    return raw.patients || raw || {};
  }
  function writeRegistry(map) {
    localStorage.setItem(PATIENTS_KEY, JSON.stringify({ patients: map, updatedAt: nowISO() }));
  }
  function readLocalVisits() {
    var arr = safeParse(window.CCData.json() || '[]', []); // P1 v9: through the data-access layer (same text as before)
    return Array.isArray(arr) ? arr : [];
  }
  // P1 v6 audit: no silent cap. Earlier builds kept only the newest 100 visits, so saving visit 101 on a stand-alone iPad deleted the
  // oldest visit without warning. Now every visit is kept. If the browser's storage is full, only visits that the clinic server already
  // holds (source 'server') may be dropped from this device's cache, oldest first; a visit that exists only on this device is never dropped.
  function isQuota(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }
  function writeLocalVisits(arr, keepId) {
    var json = JSON.stringify(arr);
    try { localStorage.setItem(VISITS_KEY, json); storageCheck(); return { ok: true, dropped: 0 }; } catch (e) { if (!isQuota(e)) throw e; }
    var serverHeld = arr.map(function (v, i) { return { v: v, i: i }; }).filter(function (x) { return x.v && x.v.source === 'server' && (x.v.visitId || x.v.id) !== keepId; })
      .sort(function (a, b) { return String((a.v.visit && a.v.visit.date) || a.v.savedAt || '').localeCompare(String((b.v.visit && b.v.visit.date) || b.v.savedAt || '')); });
    var drop = {}, dropped = 0, step = Math.max(1, Math.ceil(serverHeld.length / 20));
    // first cut: drop enough of the oldest server-held visits to reach ~85% of the usual quota in one go (sizes measured once)
    try { var other = storageUsed() - (localStorage.getItem(VISITS_KEY) || '').length, budget = LS_APPROX_CHARS * 0.85 - other, total = json.length;
      while (serverHeld.length && total > budget) { var x0 = serverHeld.shift(); drop[x0.i] = 1; dropped++; total -= JSON.stringify(x0.v).length + 1; } } catch (e) {}
    while (true) {
      var kept = arr.filter(function (v, i) { return !drop[i]; });
      try { localStorage.setItem(VISITS_KEY, JSON.stringify(kept)); EHR.cacheTrimmed = (EHR.cacheTrimmed || 0) + dropped;
        storageBanner('warn', 'This device\u2019s storage is full. ' + dropped + ' older visit(s) that are safe on the clinic server were removed from this device\u2019s copy only. Reports on this device now cover ' + kept.length + ' visits.');
        return { ok: true, dropped: dropped }; } catch (e2) { if (!isQuota(e2)) throw e2; }
      if (!serverHeld.length) break;
      serverHeld.splice(0, step).forEach(function (x) { drop[x.i] = 1; dropped++; });
    }
    var err = new Error('Device storage is full'); err.name = 'CCStorageFull'; throw err;
  }
  // Storage meter: about 5 million characters per site in Chrome (measured on the test box); iPad Safari is similar (not measured on the iPad).
  var LS_APPROX_CHARS = 5000000;
  function storageUsed() { var n = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) {} return n; }
  function storageCheck() { var u = storageUsed(), pct = Math.round(u / LS_APPROX_CHARS * 100); EHR.storagePct = pct;
    if (pct >= 80 && !EHR.warned80) { EHR.warned80 = true; storageBanner('warn', 'This device\u2019s browser storage is ' + pct + '% full (' + readLocalVisits().length + ' visits). Make a practice backup (Profile \u2192 Backup) and use the clinic server; a stand-alone iPad cannot hold many more visits.'); }
    return { usedChars: u, pct: pct }; }
  function storageBanner(kind, msg, action) {
    var el = document.getElementById('ccStorageBanner');
    if (!el) { el = document.createElement('div'); el.id = 'ccStorageBanner'; el.setAttribute('role', 'alert'); el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:10050;padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.35;box-shadow:0 4px 18px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;flex-wrap:wrap'; (document.body || document.documentElement).appendChild(el); }
    el.style.background = kind === 'error' ? '#7f1d1d' : kind === 'info' ? '#14532d' : '#78350f'; el.style.color = '#fff'; el.dataset.kind = kind;
    el.innerHTML = '<span style="flex:1;min-width:200px">' + esc(msg) + '</span>';
    if (action) { var b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.style.cssText = 'min-height:44px;padding:8px 14px;border-radius:8px;border:0;background:#fff;color:#111;font-weight:700'; b.onclick = action.fn; el.appendChild(b); }
    var x = document.createElement('button'); x.type = 'button'; x.textContent = 'Dismiss'; x.setAttribute('aria-label', 'Dismiss storage warning'); x.style.cssText = 'min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid #fff;background:transparent;color:#fff'; x.onclick = function () { el.remove(); }; el.appendChild(x);
  }
  function downloadVisitJSON(data) { try { var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (typeof makeEzmedFilename === 'function') ? makeEzmedFilename(data, 'json') : ('visit_' + (data.visitId || 'save') + '.json'); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); } catch (e) {} }
  // v7 helpers: device-only markers are not sent to / compared with the server copy
  var DEVICE_ONLY = ['source', 'pendingPush', 'serverSavedAt', 'syncedAt', 'updatedAt'];
  function forServer(v) { var o = Object.assign({}, v); delete o.pendingPush; delete o.source; delete o.serverSavedAt; return o; }
  function sameContent(a, b) { try { var x = Object.assign({}, a), y = Object.assign({}, b); DEVICE_ONLY.forEach(function (k) { delete x[k]; delete y[k]; }); return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; } }
  function unsentVisits() { return readLocalVisits().filter(function (v) { return v && (v.visitId || v.id) && (v.pendingPush || v.source === 'local'); }); }
  // v7: send visits saved while the server was not reachable (oldest first). Last write wins on the server, with the visible
  // conflict warning (roadmap PHI rule); nothing is deleted on this device.
  var outboxBusy = false;
  async function pushOutbox() {
    if (outboxBusy || EHR.mode !== 'server' || window.CC_SYNC_PAUSED) return { sent: 0 }; outboxBusy = true; var sent = 0, failed = 0;
    try { var list = unsentVisits().sort(function (a, b) { return String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')); });
      for (var i = 0; i < list.length; i++) { var out = await pushVisitToServer(list[i]); if (out && out.ok) sent++; else { failed++; break; } }
    } finally { outboxBusy = false; }
    EHR.outboxSent = (EHR.outboxSent || 0) + sent; EHR.outboxLeft = unsentVisits().length;
    if (sent && typeof showToast === 'function') showToast(sent + ' visit(s) saved earlier on this device were sent to the clinic server');
    return { sent: sent, failed: failed, left: EHR.outboxLeft };
  }
  async function outboxTick() { try { if (window.CC_SYNC_PAUSED || document.hidden || !unsentVisits().length) return; if (EHR.mode !== 'server') { await detectChartStorageMode(); if (EHR.mode === 'server') await pullServerChart(); } else await pushOutbox(); } catch (e) {} }
  window.EHR_pushOutbox = pushOutbox; window.EHR_unsentVisits = unsentVisits;
  window.EHR_outboxTick = outboxTick;
  // v7: a practice-backup restore pauses background sync (CC_SYNC_PAUSED) and waits here until a send in progress has finished,
  // so nothing changes the device data between the restore's write and its read-back check
  window.EHR_syncIdle = async function () { for (var i = 0; i < 300 && (outboxBusy || pullBusy); i++) await new Promise(function (r) { setTimeout(r, 50); }); return !(outboxBusy || pullBusy); }; // v7: also runs when the device comes back online or the app is shown again (below)
  window.EHR_storageBanner = function (k, m, a) { storageBanner(k, m, a); };
  window.EHR_storageCheck = storageCheck; window.EHR_storageUsed = storageUsed; window.EHR_LS_APPROX_CHARS = LS_APPROX_CHARS;

  function demogFromForm() {
    function v(id) { var el = document.getElementById(id); return el ? el.value : ''; }
    return {
      firstName: v('ptFirstName'),
      lastName: v('ptLastName'),
      dob: v('ptDOB'),
      id: v('ptID'),
      gender: v('ptGender'),
      phone: v('ptPhone'),
      email: v('ptEmail'),
      medAid: v('ptMedAid'),
      medAidNo: v('ptMedAidNo'),
      fileNo: v('ptFileNo')
    };
  }

  function makePatientKey(patient) {
    patient = patient || {};
    // P1 v9: the id / name part lives in the data-access layer (p1-store.js) so the patient index uses exactly the same rule
    var key = window.CCData.patientKeyPure(patient);
    if (key) return key;
    var seed = localStorage.getItem(ANON_KEY);
    if (!seed) { seed = 'p_' + localId(); localStorage.setItem(ANON_KEY, seed); }
    return seed;
  }

  function upsertPatientIntoRegistry(patient, extra) {
    if (!patient) return null;
    var id = (extra && extra.id) || patient.patientId || makePatientKey(patient);
    if (!id) return null;
    var map = readRegistry();
    var prev = map[id] || {};
    map[id] = Object.assign({}, prev, {
      id: id,
      firstName: patient.firstName || prev.firstName || '',
      lastName: patient.lastName || prev.lastName || '',
      dob: patient.dob || prev.dob || '',
      idNumber: patient.id || patient.idNumber || prev.idNumber || '',
      gender: patient.gender || prev.gender || '',
      phone: patient.phone || prev.phone || '',
      email: patient.email || prev.email || '',
      medAid: patient.medAid || prev.medAid || '',
      medAidNo: patient.medAidNo || prev.medAidNo || '',
      fileNo: patient.fileNo || prev.fileNo || '',
      updatedAt: nowISO()
    });
    writeRegistry(map);
    EHR.currentPatientId = id;
    return id;
  }

  function rebuildRegistryFromVisits() {
    var map = readRegistry();
    // P1 item 8 v3: oldest first, and a visit older than the registry record never overwrites it
    // (stops an earlier visit restoring an outdated phone/email after a logged contact edit).
    var ts = function (v) { return String((v && (v.updatedAt || v.savedAt)) || ''); };
    readLocalVisits().slice().sort(function (a, b) { return ts(a).localeCompare(ts(b)); }).forEach(function (visit) {
      if (!visit || !visit.patient) return;
      var pid = visit.patientId || makePatientKey(visit.patient);
      var prev = map[pid] || {};
      if (prev.updatedAt && ts(visit) && ts(visit) < String(prev.updatedAt)) return;
      var p = visit.patient;
      map[pid] = Object.assign({}, prev, {
        id: pid,
        firstName: p.firstName || prev.firstName || '',
        lastName: p.lastName || prev.lastName || '',
        dob: p.dob || prev.dob || '',
        idNumber: p.id || prev.idNumber || '',
        gender: p.gender || prev.gender || '',
        phone: p.phone || prev.phone || '',
        email: p.email || prev.email || '',
        medAid: p.medAid || prev.medAid || '',
        medAidNo: p.medAidNo || prev.medAidNo || '',
        fileNo: p.fileNo || prev.fileNo || '',
        updatedAt: visit.updatedAt || visit.savedAt || prev.updatedAt || nowISO()
      });
    });
    writeRegistry(map);
    return map;
  }

  // ---------- Visit summaries ----------
  function visitComplaintSummary(visit) {
    if (!visit) return '';
    if (visit.complaintSummary) return String(visit.complaintSummary);
    if (visit.soap && visit.soap.S) {
      var s = String(visit.soap.S).split('\n')[0].trim();
      if (s) return s.length > 80 ? s.slice(0, 78) + '…' : s;
    }
    var region = visit.complaint && visit.complaint.region;
    var side = visit.complaint && visit.complaint.side;
    var dx = '';
    if (visit.activeRegions && visit.activeRegions.length && visit.examData) {
      var r0 = visit.activeRegions[0];
      var ed = visit.examData[r0] || {};
      dx = ed.primaryDx || '';
    }
    var parts = [];
    if (region) parts.push(region + (side ? ' (' + side + ')' : ''));
    if (dx) parts.push(dx.length > 50 ? dx.slice(0, 48) + '…' : dx);
    if (visit.hep && visit.hep.exercises && visit.hep.exercises.length) {
      parts.push('HEP×' + visit.hep.exercises.length);
    }
    return parts.join(' — ') || 'Visit';
  }

  function buildSoapSnapshot() {
    var S = [], O = [], A = [], P = [];
    var complaint = demogFromForm && null;
    try {
      var region = (document.getElementById('pcRegion') || {}).value || '';
      var side = (document.getElementById('pcSide') || {}).value || '';
      var onset = (document.getElementById('pcOnset') || {}).value || '';
      if (region) S.push('Complaint: ' + region + (side ? ' ' + side : '') + (onset ? ', onset ' + onset : ''));
    } catch (e) {}
    try {
      Object.keys((typeof APP !== "undefined" && APP.examData) || {}).forEach(function (r) {
        var D = APP.examData[r] || {};
        if (D.vas != null) S.push(r + ' VAS ' + D.vas + '/10');
        if (D.quality && D.quality.length) S.push(r + ' quality: ' + D.quality.join(', '));
        if (D.primaryDx) A.push(r + ': ' + D.primaryDx + (D.icd10 ? ' (' + D.icd10 + ')' : ''));
        if (D.clinicalImpression) A.push(D.clinicalImpression);
        if (D.planMod) P.push(r + ' plan: ' + D.planMod);
        var orthoBits = [];
        if (typeof ROMDATA !== 'undefined') ROMDATA.entries(r, D, 'A').forEach(function (e) { if (ROMDATA.filled(e.deg)) orthoBits.push('ROM ' + ROMDATA.label(e) + ' ' + e.deg + '°'); });
        if (orthoBits.length) O.push(r + ': ' + orthoBits.slice(0, 4).join(', '));
      });
    } catch (e) {}
    if ((typeof APP !== 'undefined' ? APP : null) && APP.visitSoap) {
      if (APP.visitSoap.S) S.unshift(APP.visitSoap.S);
      if (APP.visitSoap.O) O.unshift(APP.visitSoap.O);
      if (APP.visitSoap.A) A.unshift(APP.visitSoap.A);
      if (APP.visitSoap.P) P.unshift(APP.visitSoap.P);
    }
    return {
      S: S.join('\n').trim(),
      O: O.join('\n').trim(),
      A: A.join('\n').trim(),
      P: P.join('\n').trim()
    };
  }

  function buildHepFromSelection() {
    var exercises = [];
    try {
      if (typeof getSelectedExercises === 'function') {
        exercises = getSelectedExercises().map(function (ex) {
          return {
            name: ex.name,
            exerciseId: ex.name,
            cues: ex.rx || '',
            setsReps: ex.rx || ''
          };
        });
      }
    } catch (e) {}
    var iceHeat = [];
    try {
      var mod = (document.getElementById('ihModality') || {}).value || '';
      var area = (document.getElementById('ihArea') || {}).value || '';
      var side = (document.getElementById('ihSide') || {}).value || '';
      var variant = (document.getElementById('ihVariant') || {}).value || '';
      var duration = (document.getElementById('ihDuration') || {}).value || '';
      var freq = (document.getElementById('ihFreq') || {}).value || '';
      var custom = (document.getElementById('ihCustom') || {}).value || '';
      if (mod || area || custom) {
        iceHeat.push({
          key: [area, side, variant, mod].filter(Boolean).join('_'),
          modality: mod,
          area: area,
          side: side,
          variant: variant,
          duration: duration,
          frequency: freq,
          instructions: custom
        });
      }
    } catch (e) {}
    var notes = '';
    try { notes = (document.getElementById('exCustomInstructions') || {}).value || ''; } catch (e) {}
    return { exercises: exercises, iceHeat: iceHeat, notes: notes };
  }

  function readFreeNotesPayload() {
    try {
      if ((typeof APP !== 'undefined' ? APP : null) && APP.freeNotes) return APP.freeNotes;
      return safeParse(localStorage.getItem(FREE_NOTES_KEY) || 'null', null);
    } catch (e) { return null; }
  }

  function ensureVisitIds(data) {
    data = data || {};
    data.patient = data.patient || demogFromForm();
    var pid = data.patientId || EHR.currentPatientId || makePatientKey(data.patient);
    data.patientId = pid;
    EHR.currentPatientId = pid;
    if (!data.visitId) {
      data.visitId = EHR.currentVisitId || ((data.visit && data.visit.date) || todayISO()) + '_' + pid + '_' + localId().slice(0, 8);
    }
    EHR.currentVisitId = data.visitId;
    data.id = data.visitId;
    data.status = data.status || 'open';
    data.updatedAt = nowISO();
    // v7: a saved visit is 'local' + pendingPush until the server confirms it (v6 marked it 'server' before the push had succeeded,
    // so a failed push looked server-held and could be overwritten by the next pull)
    data.source = 'local'; data.pendingPush = true; delete data.serverSavedAt;
    return data;
  }

  function enrichVisitPayload(data) {
    data = ensureVisitIds(data);
    data.soap = data.soap || buildSoapSnapshot();
    if (!data.hep || !data.hep.exercises) data.hep = buildHepFromSelection();
    var fn = readFreeNotesPayload();
    if (fn) {
      data.freeNotes = fn;
      data.attachmentRefs = data.attachmentRefs || [];
      if (!data.attachmentRefs.some(function (r) { return r && r.type === 'freeNotes'; })) {
        data.attachmentRefs.push({ type: 'other', localKey: FREE_NOTES_KEY, label: 'Free notes' });
      }
    }
    data.complaintSummary = visitComplaintSummary(data);
    if (data.syncedAt == null && EHR.lastSynced) data.syncedAt = EHR.lastSynced;
    return data;
  }

  function upsertLocalVisit(data) {
    data = enrichVisitPayload(data);
    upsertPatientIntoRegistry(data.patient, { id: data.patientId });
    // P1 v9: save just this visit when that gives exactly the same stored list as the full rewrite (see CCData.upsertOne)
    if (window.CCData.upsertOne(data)) { storageCheck(); EHR.lastLocalSaveFailed = false; return data; }
    window.CCData.noteFullSave();
    var visits = readLocalVisits();
    var idx = visits.findIndex(function (v) { return v && (v.visitId === data.visitId || v.id === data.visitId); });
    if (idx >= 0) visits[idx] = data;
    else visits.push(data);
    try { writeLocalVisits(visits, data.visitId); EHR.lastLocalSaveFailed = false; }
    catch (e) {
      if (!e || e.name !== 'CCStorageFull') throw e;
      EHR.lastLocalSaveFailed = true;
      storageBanner('error', 'Device storage is full: this visit was NOT saved on this device' + (EHR.mode === 'server' ? ' (it is being sent to the clinic server)' : '') + '. Download it now and make a practice backup.', { label: 'Download this visit', fn: function () { downloadVisitJSON(data); } });
    }
    return data;
  }
  // P1 v6 audit (performance): merge many server visits with one read and one write (was one full read+write per visit).
  function upsertManyLocalVisits(list) {
    var visits = readLocalVisits(), at = {};
    visits.forEach(function (v, i) { if (v) at[v.visitId || v.id] = i; });
    // v6 audit (data integrity): server visits are stored as they are. Earlier builds ran each one through enrichVisitPayload(), which
    // (a) attached THIS device's current free notes to every pulled visit (other patients' visits too) and (b) left the open-visit pointer
    // on the last pulled visit, so the next save of a different patient overwrote that visit (and pushed the overwrite to the server).
    var map = readRegistry(), regChanged = false, keptLocal = 0, conflictCopies = 0;
    list.forEach(function (d) { var k = d.visitId || d.id; d.visitId = k; d.id = k; delete d.pendingPush;
      // v7: a local copy that the server has not confirmed (saved offline, or the push failed) is never overwritten by the pull.
      var mine = at[k] != null ? visits[at[k]] : null;
      if (mine && mine !== d && sameContent(mine, d) === false) {
        var unsent = !!mine.pendingPush || mine.source === 'local', newer = String(mine.updatedAt || '') > String(d.updatedAt || '');
        if (unsent || newer) { if (!mine.pendingPush) { mine.pendingPush = true; mine.source = 'local'; } keptLocal++; return; }
      } else if (mine && mine.pendingPush && sameContent(mine, d)) { mine.source = 'server'; delete mine.pendingPush; return; } if (!d.patientId) { try { d.patientId = makePatientKey(d.patient || {}); } catch (e) {} }
      if (d.patientId && !map[d.patientId] && d.patient) { var p = d.patient; map[d.patientId] = { id: d.patientId, firstName: p.firstName || '', lastName: p.lastName || '', dob: p.dob || '', idNumber: p.id || '', gender: p.gender || '', phone: p.phone || '', email: p.email || '', medAid: p.medAid || '', medAidNo: p.medAidNo || '', fileNo: p.fileNo || '', updatedAt: d.updatedAt || nowISO() }; regChanged = true; }
      if (at[k] != null) visits[at[k]] = d; else { at[k] = visits.length; visits.push(d); } });
    if (regChanged) writeRegistry(map);
    EHR.pullKeptLocal = keptLocal;
    try { writeLocalVisits(visits); } catch (e) { if (!e || e.name !== 'CCStorageFull') throw e; storageBanner('error', 'Device storage is full: the server chart could not be copied to this device. Work continues from the server; make a practice backup.'); }
  }

  function visitsForPatient(patientId) {
    // P1 v9: only this patient's candidate visits are read (the filter below is unchanged)
    return (window.CCData.forPatient(patientId) || readLocalVisits())
      .filter(function (v) {
        if (!v) return false;
        if (v.patientId === patientId) return true;
        try { return makePatientKey(v.patient || {}) === patientId; } catch (e) { return false; }
      })
      .sort(function (a, b) {
        return String((b.visit && b.visit.date) || b.savedAt || '').localeCompare(String((a.visit && a.visit.date) || a.savedAt || ''));
      });
  }

  function findTodayVisit(patientId) {
    var t = todayISO();
    return visitsForPatient(patientId).find(function (v) {
      return v && v.visit && v.visit.date === t && (v.status || 'open') !== 'void';
    }) || null;
  }

  // ---------- Sync mode badge ----------
  function readSyncMeta() {
    return safeParse(localStorage.getItem(SYNC_META_KEY) || '{}', {});
  }
  function writeSyncMeta(meta) {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  }

  function updateChartModeBadge() {
    var badge = document.getElementById('chartModeBadge');
    var text = document.getElementById('chartModeBadgeText');
    var syncEl = document.getElementById('chartLastSynced');
    var warn = document.getElementById('chartConflictWarn');
    if (!badge || !text) return;
    badge.classList.remove('server', 'local', 'detecting');
    if (EHR.mode === 'server') {
      badge.classList.add('server');
      text.textContent = 'Server';
    } else if (EHR.mode === 'local') {
      badge.classList.add('local');
      text.textContent = 'This device only';
    } else {
      badge.classList.add('detecting');
      text.textContent = 'Checking…';
    }
    if (syncEl) {
      syncEl.textContent = EHR.lastSynced
        ? 'Last synced: ' + formatLocalTime(EHR.lastSynced)
        : 'Last synced: never';
      // v7: say plainly when visits saved on this device have not reached the Mac yet (only once this device has used the server)
      if (EHR.lastSynced) { var nUnsent = 0; try { nUnsent = unsentVisits().length; } catch (e) {}
        syncEl.textContent += nUnsent ? ' \u00b7 ' + nUnsent + ' visit' + (nUnsent === 1 ? '' : 's') + ' not yet sent to the Mac' : ''; syncEl.dataset.unsent = String(nUnsent); }
    }
    if (warn) {
      if (EHR.conflictNotice) {
        warn.style.display = 'block';
        warn.textContent = EHR.conflictNotice;
      } else {
        warn.style.display = 'none';
        warn.textContent = '';
      }
    }
  }

  function formatLocalTime(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString('en-ZA', { hour12: false });
    } catch (e) { return iso; }
  }

  async function detectChartStorageMode() {
    try {
      var res = await fetch('/api/health', { cache: 'no-store' });
      var type = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && type.indexOf('application/json') >= 0) {
        var data = await res.json();
        if (data && data.ok && (data.visits || data.chart || data.diary)) {
          EHR.mode = 'server';
          EHR.hadServerThisSession = true;
          updateChartModeBadge();
          return EHR.mode;
        }
      }
    } catch (e) {}
    EHR.mode = 'local';
    updateChartModeBadge();
    return EHR.mode;
  }

  var pullBusy = false;
  async function pullServerChart() {
    if (EHR.mode !== 'server' || window.CC_SYNC_PAUSED) return;
    pullBusy = true;
    try {
      var res = await fetch('/api/visits', { cache: 'no-store' });
      var data = await res.json();
      if (!data || !data.ok) return;
      EHR.serverUpdatedAt = data.updatedAt || null;
      var meta = readSyncMeta();
      meta.serverUpdatedAt = data.updatedAt;
      writeSyncMeta(meta);

      if (data.patients) {
        var map = readRegistry(), unsentP = {};
        try { unsentVisits().forEach(function (v) { var k = v.patientId || makePatientKey(v.patient || {}); if (k) unsentP[k] = 1; }); } catch (e) {}
        // v7: like visits, a patient record changed on this device and not yet sent (e.g. a logged contact edit made while the
        // Mac was unreachable) is not overwritten by the Mac's older copy; it goes to the Mac with the next send.
        Object.keys(data.patients).forEach(function (pid) {
          var mine = map[pid], srv = data.patients[pid] || {};
          if (mine && (unsentP[pid] || String(mine.updatedAt || '') > String(srv.updatedAt || ''))) { map[pid] = Object.assign({}, srv, mine, { id: pid }); EHR.pullKeptLocalPatients = (EHR.pullKeptLocalPatients || 0) + 1; return; }
          map[pid] = Object.assign({}, mine || {}, srv, { id: pid });
        });
        writeRegistry(map);
      }
      if (Array.isArray(data.visits)) {
        upsertManyLocalVisits(data.visits.filter(function (sv) { return sv && (sv.visitId || sv.id); }).map(function (sv) { return Object.assign({}, sv, { source: 'server' }); }));
      }
      EHR.lastSynced = nowISO();
      meta.lastSynced = EHR.lastSynced;
      writeSyncMeta(meta);
      updateChartModeBadge();
      renderPatientTimeline();
      await pushOutbox();
    } catch (e) {
      EHR.mode = 'local';
      updateChartModeBadge();
      if (typeof showToast === 'function') showToast('Server chart unavailable — This device only');
    } finally { pullBusy = false; }
  }

  async function pushVisitToServer(visit) {
    if (EHR.mode !== 'server') return null;
    try {
      var patient = null;
      var map = readRegistry();
      if (visit.patientId && map[visit.patientId]) patient = map[visit.patientId];
      var res = await fetch('/api/visits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit: forServer(visit),
          patient: patient,
          clientUpdatedAt: EHR.serverUpdatedAt
        })
      });
      var out = await res.json();
      if (out && out.ok) {
        if (out.conflict) {
          EHR.conflictNotice = out.warning || 'Conflict: last-write-wins applied. Another device may have edited this chart.';
          if (typeof showToast === 'function') showToast('⚠ Chart conflict — last write wins');
        } else {
          EHR.conflictNotice = null;
        }
        EHR.serverUpdatedAt = out.updatedAt || EHR.serverUpdatedAt;
        EHR.lastSynced = nowISO();
        // v6 audit: remember that the server holds this visit (only such visits may leave this device's cache when storage is full)
        try { var lv = readLocalVisits(), li = lv.findIndex(function (x) { return x && (x.visitId || x.id) === (visit.visitId || visit.id); });
          if (li >= 0 && !window.CC_SYNC_PAUSED && (lv[li].source !== 'server' || lv[li].pendingPush) && String(lv[li].updatedAt || '') === String(visit.updatedAt || '')) { lv[li].source = 'server'; delete lv[li].pendingPush; lv[li].serverSavedAt = EHR.lastSynced; writeLocalVisits(lv, visit.visitId); } } catch (e) {}
        var meta = readSyncMeta();
        meta.lastSynced = EHR.lastSynced;
        meta.serverUpdatedAt = EHR.serverUpdatedAt;
        writeSyncMeta(meta);
        updateChartModeBadge();
        return out;
      }
    } catch (e) {
      EHR.mode = 'local';
      updateChartModeBadge();
      if (typeof showToast === 'function') showToast('Server chart unavailable — saved on this device');
    }
    return null;
  }

  // ---------- Patient search (local first) ----------
  function searchLocalPatients(q) {
    q = (q || '').trim().toLowerCase();
    if (!q || q.length < 1) return [];
    var map = rebuildRegistryFromVisits();
    var matches = [];
    Object.keys(map).forEach(function (id) {
      var p = map[id] || {};
      var hay = [
        p.firstName, p.lastName, p.dob, p.idNumber, p.fileNo, p.phone, id
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) >= 0) matches.push(p);
      else if (p.dob && p.dob.indexOf(q) >= 0) matches.push(p);
    });
    matches.sort(function (a, b) {
      return String(a.lastName || '').localeCompare(String(b.lastName || ''));
    });
    return matches;
  }

  function patientSearchInputLocal() {
    var input = document.getElementById('patientSearch');
    var resultsEl = document.getElementById('patientSearchResults');
    if (!input || !resultsEl) return;
    var q = (input.value || '').trim().toLowerCase();
    if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }

    var localMatches = searchLocalPatients(q);
    var html = '';
    if (localMatches.length) {
      html += '<div style="padding:6px 10px;font-size:10px;font-weight:700;color:var(--accent);background:#F0F7F6">Local registry</div>';
      html += localMatches.slice(0, 20).map(function (p) {
        var name = (p.lastName || '?') + ', ' + (p.firstName || '?');
        var sub = (p.dob ? 'DOB ' + p.dob : '') + (p.idNumber ? ' · ID ' + p.idNumber : '') + (p.fileNo ? ' · File ' + p.fileNo : '');
        return '<div class="ehr-search-row" style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer" data-pid="' + esc(p.id) + "\" data-cc-click=\"EHR_openPatient(" + jsArg(p.id) + ')">'
          + '<div style="font-weight:600">' + esc(name) + '</div>'
          + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + esc(sub) + '</div></div>';
      }).join('');
    }

    // If Firebase is ready, also show cloud matches below (optional, non-blocking)
    if (window.firebaseReady && window.PATIENT_INDEX) {
      var cloud = [];
      Object.keys(PATIENT_INDEX).forEach(function (key) {
        var p = (PATIENT_INDEX[key] && PATIENT_INDEX[key].profile) || {};
        var hay = ((p.firstName || '') + ' ' + (p.lastName || '') + ' ' + (p.id || '') + ' ' + (p.fileNo || '')).toLowerCase();
        if (hay.indexOf(q) >= 0) cloud.push({ key: key, profile: p });
      });
      if (cloud.length) {
        html += '<div style="padding:6px 10px;font-size:10px;font-weight:700;color:#2563EB;background:#EFF6FF">Cloud (Firebase)</div>';
        html += cloud.slice(0, 10).map(function (m) {
          var p = m.profile;
          var name = (p.lastName || '?') + ', ' + (p.firstName || '?');
          return "<div style=\"padding:10px;border-bottom:1px solid var(--border);cursor:pointer\" data-cc-click=\"loadPatientByKey(" + jsArg(m.key) + ')">'
            + '<div style="font-weight:600">' + esc(name) + '</div></div>';
        }).join('');
      }
    }

    if (!html) {
      html = '<div style="padding:10px;font-size:12px;color:var(--text3)">No local match. Fill the form below for a new patient.</div>';
    }
    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
  }

  function fillDemographics(p) {
    if (!p) return;
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('ptFirstName', p.firstName);
    set('ptLastName', p.lastName);
    set('ptDOB', p.dob);
    set('ptID', p.idNumber || p.id || '');
    set('ptGender', p.gender);
    set('ptPhone', p.phone);
    set('ptEmail', p.email);
    set('ptMedAid', p.medAid);
    set('ptMedAidNo', p.medAidNo);
    set('ptFileNo', p.fileNo);
  }

  function openPatient(patientId) {
    var map = readRegistry();
    var p = map[patientId];
    if (!p) {
      // try rebuild
      rebuildRegistryFromVisits();
      map = readRegistry();
      p = map[patientId];
    }
    if (!p) {
      if (typeof showToast === 'function') showToast('Patient not found');
      return;
    }
    var results = document.getElementById('patientSearchResults');
    if (results) results.style.display = 'none';
    var search = document.getElementById('patientSearch');
    if (search) search.value = '';

    EHR.currentPatientId = patientId;
    fillDemographics(p);

    var today = findTodayVisit(patientId);
    if (!today) {
      // create empty open visit for today
      if (document.getElementById('visitDate')) document.getElementById('visitDate').value = todayISO();
      EHR.currentVisitId = null;
      today = upsertLocalVisit(typeof gatherAllData === 'function' ? gatherAllData() : { patient: demogFromForm(), visit: { type: 'new', date: todayISO(), caseNo: '' } });
      if (typeof showToast === 'function') showToast('Opened ' + (p.firstName || '') + ' — new visit for today');
    } else {
      EHR.currentVisitId = today.visitId || today.id;
      if (typeof restoreData === 'function') restoreData(today);
      if (typeof showToast === 'function') showToast('Opened ' + (p.firstName || '') + ' — today’s visit');
    }

    var priors = visitsForPatient(patientId).filter(function (v) {
      return v && (v.visitId || v.id) !== (today.visitId || today.id);
    });
    if (priors.length > 0) {
      var chip = document.querySelectorAll('#sec-patient .chip-group .chip')[1];
      if (chip && typeof setVisitType === 'function') setVisitType('followup', chip);
    }
    renderPatientTimeline();
    renderTodayVisitCard();
  }
  window.EHR_openPatient = openPatient;
  window.EHR_upsertVisit = function (d) { var r = upsertLocalVisit(d); try { renderPatientTimeline(); renderTodayVisitCard(); } catch (e) {} return r; }; // P1 item 8: save without download
  window.EHR_visitsForPatient = visitsForPatient;
  // P1 item 8 v3: set contact/admin fields exactly (blank allowed) on the patient registry record
  window.EHR_updatePatientContact = function (id, fields) { var map = readRegistry(); if (!id || !map[id]) return false; Object.keys(fields || {}).forEach(function (k) { map[id][k] = fields[k]; }); map[id].updatedAt = nowISO(); writeRegistry(map); return true; };

  function openVisitById(visitId) {
    var visits = window.CCData.byId(visitId) || readLocalVisits(); // P1 v9: candidates for this id only
    var v = visits.find(function (x) { return x && (x.visitId === visitId || x.id === visitId); });
    if (!v) { if (typeof showToast === 'function') showToast('Visit not found'); return; }
    EHR.currentVisitId = v.visitId || v.id;
    EHR.currentPatientId = v.patientId || makePatientKey(v.patient || {});
    if (typeof restoreData === 'function') restoreData(v);
    if (v.hep) {
      try { APP.hep = v.hep; } catch (e) {}
      updateHepPreview(v.hep);
    }
    if (v.soap && (typeof APP !== 'undefined' ? APP : null)) APP.visitSoap = v.soap;
    renderPatientTimeline();
    renderTodayVisitCard();
    if (typeof showToast === 'function') showToast('Loaded visit ' + ((v.visit && v.visit.date) || ''));
  }
  window.EHR_openVisit = openVisitById;

  function renderTodayVisitCard() {
    var el = document.getElementById('ehrTodayVisit');
    if (!el) return;
    var pid = EHR.currentPatientId;
    if (!pid) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Select or create a patient to open today’s visit.</div>';
      return;
    }
    var today = findTodayVisit(pid);
    if (!today) {
      el.innerHTML = "<div style=\"font-size:12px;color:var(--text3)\">No visit for today yet. <button type=\"button\" class=\"ehr-mini-btn\" data-cc-click=\"EHR_ensureTodayVisit()\">Create today’s visit</button></div>";
      return;
    }
    var sum = visitComplaintSummary(today);
    el.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">'
      + '<div><div style="font-weight:700;color:var(--accent)">Today · ' + esc((today.visit && today.visit.date) || todayISO()) + ' · ' + esc(today.status || 'open') + '</div>'
      + '<div style="font-size:12px;margin-top:4px;color:var(--text2)">' + esc(sum) + '</div></div>'
      + "<button type=\"button\" class=\"ehr-mini-btn\" data-cc-click=\"EHR_openVisit(" + jsArg(today.visitId || today.id) + ')">Open chart</button></div>';
  }
  window.EHR_ensureTodayVisit = function () {
    var pid = EHR.currentPatientId || upsertPatientIntoRegistry(demogFromForm());
    if (!pid) { if (typeof showToast === 'function') showToast('Enter patient name first'); return; }
    EHR.currentPatientId = pid;
    if (document.getElementById('visitDate')) document.getElementById('visitDate').value = todayISO();
    EHR.currentVisitId = null;
    upsertLocalVisit(typeof gatherAllData === 'function' ? gatherAllData() : { patient: demogFromForm(), visit: { date: todayISO(), type: 'new' } });
    renderTodayVisitCard();
    renderPatientTimeline();
  };

  function renderPatientTimeline() {
    var el = document.getElementById('ehrVisitTimeline');
    if (!el) return;
    var pid = EHR.currentPatientId;
    if (!pid) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Prior visits appear here after you open a patient.</div>';
      return;
    }
    var list = visitsForPatient(pid);
    var t = todayISO();
    var priors = list.filter(function (v) { return !(v.visit && v.visit.date === t && (v.visitId === EHR.currentVisitId || !EHR.currentVisitId)); });
    // Show all non-current as prior timeline
    priors = list.filter(function (v) {
      return (v.visitId || v.id) !== EHR.currentVisitId;
    });
    if (!priors.length) {
      el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No prior visits on this device for this patient.</div>';
      return;
    }
    el.innerHTML = priors.map(function (v) {
      var d = (v.visit && v.visit.date) || '—';
      var typ = (v.visit && v.visit.type) === 'followup' ? 'Follow-up' : 'New';
      var sum = visitComplaintSummary(v);
      var vid = v.visitId || v.id;
      var active = vid === EHR.currentVisitId ? ' background:#EFF6FF;' : '';
      return '<button type="button" class="ehr-timeline-item" style="' + active + "\" data-cc-click=\"EHR_openVisit(" + jsArg(vid) + ')">'
        + '<div class="ehr-tl-date">' + esc(d) + ' · ' + esc(typ) + '</div>'
        + '<div class="ehr-tl-sum">' + esc(sum) + '</div></button>';
    }).join('');
  }

  // ---------- SOAP wizard / HEP ----------
  function soapAdvance(step) {
    EHR.visitSoapStep = step;
    var map = { S: 'subj', O: 'obj', A: 'assess', P: 'plan' };
    var tab = map[step];
    if (tab && typeof activateSection === 'function') activateSection('exam');
    setTimeout(function () {
      var tabs = document.querySelectorAll('#sec-exam .soap-tab');
      var idx = { subj: 0, obj: 1, assess: 2, plan: 3 }[tab];
      if (tabs[idx] && typeof showSoapTab === 'function') showSoapTab(tab, tabs[idx]);
      highlightSoapWizard();
      // Capture simple note prompts into APP.visitSoap
      if (!(typeof APP !== 'undefined' ? APP : null)) return;
      APP.visitSoap = APP.visitSoap || { S: '', O: '', A: '', P: '' };
      if (step === 'S' && !APP.visitSoap.S) {
        var region = (document.getElementById('pcRegion') || {}).value || '';
        var side = (document.getElementById('pcSide') || {}).value || '';
        APP.visitSoap.S = (region ? region + (side ? ' ' + side : '') : '') || APP.visitSoap.S;
      }
      if (step === 'A') {
        try {
          var r = APP.currentRegion || (APP.activeRegions || [])[0];
          if (r && APP.examData[r] && APP.examData[r].primaryDx) APP.visitSoap.A = APP.examData[r].primaryDx;
        } catch (e) {}
      }
      if (step === 'P') {
        try {
          var r2 = APP.currentRegion || (APP.activeRegions || [])[0];
          if (r2 && APP.examData[r2] && APP.examData[r2].planMod) APP.visitSoap.P = APP.examData[r2].planMod;
        } catch (e) {}
      }
      updateSoapWizardHint();
    }, 50);
  }
  window.EHR_soapAdvance = soapAdvance;

  function highlightSoapWizard() {
    document.querySelectorAll('.ehr-soap-step').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-step') === EHR.visitSoapStep);
    });
  }

  function updateSoapWizardHint() {
    var hint = document.getElementById('ehrSoapHint');
    if (!hint) return;
    var labels = { S: 'Subjective — pain, quality, aggravating/relieving', O: 'Objective — ROM, ortho, neuro', A: 'Assessment — diagnosis / impression', P: 'Plan — treatment & next visit, then Add HEP' };
    hint.textContent = labels[EHR.visitSoapStep] || '';
  }

  function addHepFromWizard() {
    soapAdvance('P');
    var hep = buildHepFromSelection();
    if ((typeof APP !== 'undefined' ? APP : null)) APP.hep = hep;
    updateHepPreview(hep);
    if (typeof activateSection === 'function') activateSection('exercises');
    if (typeof showToast === 'function') showToast('Select exercises + ice/heat, then Pull into Plan/HEP');
    highlightSoapWizard();
    var hepBtn = document.querySelector('.ehr-soap-step[data-step="HEP"]');
    if (hepBtn) hepBtn.classList.add('active');
  }
  window.EHR_addHep = addHepFromWizard;

  function pullHepIntoPlan() {
    var hep = buildHepFromSelection();
    if ((typeof APP !== 'undefined' ? APP : null)) APP.hep = hep;
    updateHepPreview(hep);

    // Snapshot into planMod of current region + visitSoap.P
    var lines = [];
    if (hep.exercises && hep.exercises.length) {
      lines.push('HEP:');
      hep.exercises.forEach(function (ex) {
        lines.push('• ' + ex.name + (ex.setsReps ? ' — ' + ex.setsReps : ''));
      });
    }
    if (hep.iceHeat && hep.iceHeat.length) {
      hep.iceHeat.forEach(function (ih) {
        lines.push('• ' + (ih.modality || 'Ice/Heat') + ' ' + (ih.area || '') + (ih.side ? ' ' + ih.side : '') + (ih.duration ? ' · ' + ih.duration : '') + (ih.frequency ? ' · ' + ih.frequency : ''));
      });
    }
    if (hep.notes) lines.push(hep.notes);
    var summary = lines.join('\n');
    if ((typeof APP !== 'undefined' ? APP : null)) {
      APP.visitSoap = APP.visitSoap || { S: '', O: '', A: '', P: '' };
      APP.visitSoap.P = (APP.visitSoap.P ? APP.visitSoap.P + '\n' : '') + summary;
      try {
        var r = APP.currentRegion || (APP.activeRegions || [])[0];
        if (r) {
          var D = typeof getExamData === 'function' ? getExamData(r) : (APP.examData[r] = APP.examData[r] || {});
          D.planMod = (D.planMod ? D.planMod + '\n' : '') + summary;
          // refresh plan textarea if present
          var ta = document.querySelector('#soap-plan textarea');
          if (ta && ta.previousElementSibling && /Plan Modification/i.test((ta.previousElementSibling.textContent || ''))) {
            // last textarea in plan is planMod — find by label
          }
          var labels = document.querySelectorAll('#soap-plan label');
          labels.forEach(function (lab) {
            if (/Plan Modification/i.test(lab.textContent || '') && lab.nextElementSibling && lab.nextElementSibling.tagName === 'TEXTAREA') {
              lab.nextElementSibling.value = D.planMod;
            }
          });
        }
      } catch (e) {}
    }
    if (typeof showToast === 'function') showToast('HEP pulled into Plan (' + (hep.exercises.length || 0) + ' exercises)');
    renderHepPlanBlock();
  }
  window.EHR_pullHepIntoPlan = pullHepIntoPlan;

  function updateHepPreview(hep) {
    var el = document.getElementById('ehrHepPreview');
    if (!el) return;
    hep = hep || ((typeof APP !== 'undefined' ? APP : null) && APP.hep) || buildHepFromSelection();
    if (!hep.exercises.length && !(hep.iceHeat && hep.iceHeat.length)) {
      el.innerHTML = '<span style="color:var(--text3)">No exercises selected yet.</span>';
      return;
    }
    var html = '';
    if (hep.exercises.length) {
      html += '<ul style="margin:0;padding-left:18px">' + hep.exercises.map(function (ex) {
        return '<li>' + esc(ex.name) + (ex.setsReps ? ' <span style="color:var(--text3)">(' + esc(ex.setsReps) + ')</span>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (hep.iceHeat && hep.iceHeat.length) {
      html += '<div style="margin-top:6px;font-size:11px">' + hep.iceHeat.map(function (ih) {
        return esc((ih.modality || '') + ' · ' + (ih.area || '') + (ih.side ? ' ' + ih.side : ''));
      }).join('<br>') + '</div>';
    }
    el.innerHTML = html;
  }

  function renderHepPlanBlock() {
    var host = document.getElementById('soap-plan');
    if (!host) return;
    var block = document.getElementById('ehrHepPlanBlock');
    if (!block) {
      block = document.createElement('div');
      block.id = 'ehrHepPlanBlock';
      block.className = 'ehr-hep-plan-block';
      host.appendChild(block);
    }
    block.innerHTML = '<div class="section-label" style="margin-top:16px">HOME EXERCISE PLAN (HEP)</div>'
      + '<p style="font-size:12px;color:var(--text2);margin:0 0 8px">Snapshots selected Exercises + Ice/Heat into this visit.</p>'
      + '<div id="ehrHepPreview" style="font-size:12px;margin-bottom:8px"></div>'
      + "<button type=\"button\" class=\"ehr-mini-btn primary\" data-cc-click=\"EHR_pullHepIntoPlan()\">Pull selected exercises into Plan/HEP</button>";
    updateHepPreview();
  }

  // Patch renderExam to re-inject HEP block after SOAP render
  function patchRenderExam() {
    if (typeof window.renderExam !== 'function' || window.renderExam._ehrPatched) return;
    var orig = window.renderExam;
    window.renderExam = function (region) {
      orig(region);
      try { renderHepPlanBlock(); } catch (e) {}
    };
    window.renderExam._ehrPatched = true;
  }

  // ---------- gatherAllData / saveJSON hooks ----------
  function patchGatherAndSave() {
    if (typeof window.gatherAllData !== 'function') return;
    if (!window.gatherAllData._ehrPatched) {
      var origGather = window.gatherAllData;
      window.gatherAllData = function () {
        var data = origGather();
        try {
          data = enrichVisitPayload(data);
          if ((typeof APP !== 'undefined' ? APP : null) && APP.hep) data.hep = APP.hep;
          else data.hep = buildHepFromSelection();
          data.soap = buildSoapSnapshot();
          data.complaintSummary = visitComplaintSummary(data);
        } catch (e) { console.warn('EHR enrich failed', e); }
        return data;
      };
      window.gatherAllData._ehrPatched = true;
    }

    // Wrap the current saveJSON (may already be cloud-wrapped)
    if (typeof window.saveJSON === 'function' && !window.saveJSON._ehrP0Patched) {
      var origSave = window.saveJSON;
      window.saveJSON = function () {
        if (typeof ensureDxConfirmedForSave === 'function' && !ensureDxConfirmedForSave('saving')) return;
        var data = typeof gatherAllData === 'function' ? gatherAllData() : null;
        if (data) {
          // Upsert instead of blind push: temporarily neutralize LS push by patching
          data = upsertLocalVisit(data);
          renderPatientTimeline();
          renderTodayVisitCard();
          // Still download JSON via original path — but original also pushes.
          // Call download portion manually then sync.
          try {
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = (typeof makeEzmedFilename === 'function') ? makeEzmedFilename(data, 'json') : ('visit_' + (data.visitId || 'save') + '.json');
            a.click();
            URL.revokeObjectURL(a.href);
          } catch (e) {}
          if (typeof showToast === 'function') showToast('Patient data saved!');
          // Firebase cloud path if already wrapped before us — call savePatientToCloud
          if (window.firebaseReady && window.db && typeof savePatientToCloud === 'function') {
            savePatientToCloud(data).then(function (ok) { if (ok && typeof showToast === 'function') showToast('Also saved to cloud!'); });
          }
          pushVisitToServer(data);
          return;
        }
        origSave();
      };
      window.saveJSON._ehrP0Patched = true;
    }
  }

  function bindDemographicsBlurSave() {
    ['ptFirstName', 'ptLastName', 'ptDOB', 'ptID', 'ptFileNo', 'ptPhone', 'ptEmail', 'ptGender', 'ptMedAid', 'ptMedAidNo'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._ehrBound) return;
      el.addEventListener('blur', function () {
        var p = demogFromForm();
        if (!(p.firstName || p.lastName || p.id || p.fileNo)) return;
        upsertPatientIntoRegistry(p);
      });
      el._ehrBound = true;
    });
  }

  // ---------- UI injection ----------
  function injectStyles() {
    if (document.getElementById('ehr-p0-styles')) return;
    var css = document.createElement('style');
    css.id = 'ehr-p0-styles';
    css.textContent = [
      '.chart-mode-badge{display:inline-flex;align-items:center;gap:6px;margin-left:8px;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:700;border:1.5px solid rgba(255,255,255,.45);vertical-align:middle}',
      '.chart-mode-badge.server{background:#1B7A4A;border-color:#7DFFB2;color:#E8FFF2}',
      '.chart-mode-badge.local{background:#8A4B12;border-color:#FFD089;color:#FFF6E8}',
      '.chart-mode-badge.detecting{background:rgba(255,255,255,.12);color:#fff}',
      '.chart-mode-badge .dot{width:7px;height:7px;border-radius:50%;background:currentColor}',
      '.ehr-sync-meta{font-size:10px;opacity:.85;margin-top:3px}',
      '.ehr-conflict{display:none;margin-top:6px;padding:8px 10px;border-radius:8px;background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;font-size:11px;font-weight:600}',
      '.ehr-mini-btn{border:1px solid var(--accent);background:var(--surface);color:var(--accent);border-radius:8px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer}',
      '.ehr-mini-btn.primary{background:var(--accent);color:#fff}',
      '.ehr-mini-btn:active{opacity:.85}',
      '.ehr-timeline-item{display:block;width:100%;text-align:left;border:1px solid var(--border);background:#fff;border-radius:8px;padding:8px 10px;margin-bottom:6px;cursor:pointer}',
      '.ehr-timeline-item:hover{border-color:var(--accent);background:#F7FBFA}',
      '.ehr-tl-date{font-weight:700;font-size:12px;color:#1E3A8A}',
      '.ehr-tl-sum{font-size:11px;color:var(--text2);margin-top:2px}',
      '.ehr-soap-strip{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}',
      '.ehr-soap-step{border:1px solid var(--border);background:#fff;border-radius:999px;padding:7px 12px;font-size:11px;font-weight:700;cursor:pointer;color:var(--text2)}',
      '.ehr-soap-step.active{background:var(--accent);color:#fff;border-color:var(--accent)}',
      '.ehr-soap-step.hep{border-color:#1E7E46;color:#1E7E46}', /* v6 audit: contrast */
      '.ehr-soap-step.hep.active{background:#1E7E46;color:#fff}',
      '.ehr-hep-plan-block{margin-top:8px;padding-top:4px}'
    ].join('\n');
    document.head.appendChild(css);
  }

  function injectHeaderBadge() {
    var sub = document.querySelector('.header-sub');
    if (!sub || document.getElementById('chartModeBadge')) return;
    var badge = document.createElement('span');
    badge.id = 'chartModeBadge';
    badge.className = 'chart-mode-badge detecting';
    badge.setAttribute('role', 'status');
    badge.innerHTML = '<span class="dot" aria-hidden="true"></span><span id="chartModeBadgeText">Checking…</span>';
    sub.appendChild(badge);
    var meta = document.createElement('div');
    meta.className = 'ehr-sync-meta';
    meta.id = 'chartLastSynced';
    meta.textContent = 'Last synced: never';
    sub.appendChild(meta);
    var warn = document.createElement('div');
    warn.id = 'chartConflictWarn';
    warn.className = 'ehr-conflict';
    warn.setAttribute('role', 'status');
    // Place conflict under patient section later; also keep a header-adjacent copy inside main
    var main = document.querySelector('.main');
    if (main) main.insertBefore(warn, main.firstChild);
  }

  function injectPatientPanels() {
    var searchCard = document.getElementById('patientSearchCard');
    if (!searchCard) return;
    var hint = searchCard.querySelector('p');
    if (hint) hint.textContent = 'Searches local patient registry (name / DOB / ID / file #). Works without Firebase. Leave blank for a new patient.';

    if (!document.getElementById('ehrTodayVisitCard')) {
      var todayCard = document.createElement('div');
      todayCard.className = 'card';
      todayCard.id = 'ehrTodayVisitCard';
      todayCard.innerHTML = '<div class="card-title"><span class="icon">📅</span> Today\'s Visit</div><div id="ehrTodayVisit"></div>';
      var infoCard = searchCard.nextElementSibling;
      if (infoCard) infoCard.parentNode.insertBefore(todayCard, infoCard.nextElementSibling);
      else searchCard.parentNode.appendChild(todayCard);
    }
    if (!document.getElementById('ehrTimelineCard')) {
      var tl = document.createElement('div');
      tl.className = 'card';
      tl.id = 'ehrTimelineCard';
      tl.style.background = '#EFF6FF';
      tl.style.borderColor = '#BFDBFE';
      tl.innerHTML = '<div class="card-title"><span class="icon" style="background:#2563EB">🕒</span> Visit Timeline</div><div id="ehrVisitTimeline"></div>';
      var today = document.getElementById('ehrTodayVisitCard');
      if (today && today.nextSibling) today.parentNode.insertBefore(tl, today.nextSibling);
      else searchCard.parentNode.appendChild(tl);
    }
    // Replace Firebase-only search
    var input = document.getElementById('patientSearch');
    if (input) {
      input.setAttribute('placeholder', 'Search name or DOB (local registry)…');
      input.oninput = patientSearchInputLocal;
      input.onfocus = patientSearchInputLocal;
    }
    if (typeof window.patientSearchInput === 'function') {
      window.patientSearchInput = patientSearchInputLocal;
    }
  }

  function injectSoapStrip() {
    var exam = document.getElementById('sec-exam');
    if (!exam || document.getElementById('ehrSoapStrip')) return;
    var strip = document.createElement('div');
    strip.className = 'card';
    strip.id = 'ehrSoapStrip';
    strip.innerHTML = '<div class="card-title"><span class="icon">📝</span> Visit SOAP → HEP</div>'
      + '<div class="ehr-soap-strip">'
      + "<button type=\"button\" class=\"ehr-soap-step active\" data-step=\"S\" data-cc-click=\"EHR_soapAdvance('S')\">S</button>"
      + "<button type=\"button\" class=\"ehr-soap-step\" data-step=\"O\" data-cc-click=\"EHR_soapAdvance('O')\">O</button>"
      + "<button type=\"button\" class=\"ehr-soap-step\" data-step=\"A\" data-cc-click=\"EHR_soapAdvance('A')\">A</button>"
      + "<button type=\"button\" class=\"ehr-soap-step\" data-step=\"P\" data-cc-click=\"EHR_soapAdvance('P')\">P</button>"
      + "<button type=\"button\" class=\"ehr-soap-step hep\" data-step=\"HEP\" data-cc-click=\"EHR_addHep()\">Add HEP</button>"
      + '</div>'
      + '<div id="ehrSoapHint" style="font-size:11px;color:var(--text2)">Subjective — pain, quality, aggravating/relieving</div>';
    exam.insertBefore(strip, exam.firstChild);
  }

  function injectExercisesHepButton() {
    var sec = document.getElementById('sec-exercises');
    if (!sec || document.getElementById('ehrExHepBtn')) return;
    var card = sec.querySelector('.card');
    if (!card) return;
    var row = document.createElement('div');
    row.style.cssText = 'margin:10px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    row.innerHTML = "<button type=\"button\" id=\"ehrExHepBtn\" class=\"ehr-mini-btn primary\" data-cc-click=\"EHR_pullHepIntoPlan()\">Pull selected exercises into Plan/HEP</button>"
      + '<span style="font-size:11px;color:var(--text3)">Also available on Examination → Plan</span>';
    card.appendChild(row);
  }

  async function boot() {
    // v7: visits come from IndexedDB (p1-store.js); wait until they are loaded (and, on the first start, moved and verified)
    if (window.CCStore && CCStore.ready) { try { await CCStore.ready; } catch (e) {} }
    injectStyles();
    injectHeaderBadge();
    injectPatientPanels();
    injectSoapStrip();
    injectExercisesHepButton();
    patchRenderExam();
    patchGatherAndSave();
    bindDemographicsBlurSave();
    rebuildRegistryFromVisits();
    try { storageCheck(); } catch (e) {}

    var meta = readSyncMeta();
    EHR.lastSynced = meta.lastSynced || null;
    EHR.serverUpdatedAt = meta.serverUpdatedAt || null;
    updateChartModeBadge();

    await detectChartStorageMode();
    if (EHR.mode === 'server') await pullServerChart();
    setInterval(outboxTick, 60000);
    window.addEventListener('online', function () { setTimeout(outboxTick, 1500); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(outboxTick, 1500); });
    storeNotices();

    renderTodayVisitCard();
    renderPatientTimeline();

    // Re-patch after firebase cloud wrap (runs at end of index) — delay once
    setTimeout(function () {
      patchGatherAndSave();
      patchRenderExam();
      bindDemographicsBlurSave();
    }, 0);
    setTimeout(function () {
      patchGatherAndSave();
    }, 500);
  }

  // v7: tell the user once what happened to the device storage
  function storeNotices() {
    var S = window.CCStore; if (!S) return;
    if (S.pendingBanner) { storageBanner(S.pendingBanner.kind, S.pendingBanner.msg, S.pendingBanner.action); S.pendingBanner = null; return; }
    var m = S.migration; if (m && m.verified && m.from === 'localStorage' && !m.shown) { m.shown = true;
      storageBanner('info', 'Device storage upgraded: ' + m.visits + ' visit(s) moved to the larger device database and checked one by one' + (m.signaturesChecked ? ' (' + m.signaturesChecked + ' signatures verified)' : '') + '. A backup made before the move is kept on this device (Profile \u2192 Practice backup).'); }
    if (S.active && S.estimate) S.estimate().then(function (e) { if (e && e.quota && e.usage / e.quota >= 0.8) storageBanner('warn', 'This device\u2019s storage is ' + Math.round(e.usage / e.quota * 100) + '% full. Make a practice backup and free space on the device.'); }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
