/* P1 item 8: follow-up charted in under 2 minutes (2026-10-16, v1).
 * "Repeat last visit" carries forward this patient's last visit so only what changed is entered; a keyboard path and a dictation path;
 * sign-off with a hash, timer from opening the patient to the signed note, and addenda after signing (HPCSA Booklet 9 s5).
 * Rules and sources: docs/P1_ITEM8_RULES.md.
 */
(function () {
  'use strict';
  var TARGET_SEC = 120; // roadmap item 8 acceptance: under 2 minutes from opening the patient to a signed note
  // Not carried forward (re-measured or date-specific each visit). Clinic default (unsourced), except outcomes (item 3 re-measures each visit).
  var NOT_CARRIED = ['outcomes', 'p7Billing', 'p6Reports', 'p8', 'soap', 'report', 'certificate', 'imaging', 'photos', 'status', 'visitId', 'id', 'savedAt', 'updatedAt', 'syncedAt', 'complaintSummary', 'freeNotes', 'attachmentRefs', 'source'];
  var EXAM_NOT_CARRIED = ['dxConfirmed', 'p7EccLog'];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function today() { return localISODate(); } // local date (SAST), not UTC
  function prof() { try { return loadProfile() || {}; } catch (e) { return {}; } }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function P() { APP.p8 = APP.p8 || {}; return APP.p8; }
  var REGION_LABEL = { cs: 'Cervical', ts: 'Thoracic', ls: 'Lumbar', pelvis: 'Pelvis/SI', hip: 'Hip', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist/Hand', knee: 'Knee', ankle: 'Ankle/Foot' };

  // ---------- timer + interaction count (from opening the patient) ----------
  var T = { t0: null, keys: 0, clicks: 0 };
  function startTimer(src) { T.t0 = Date.now(); T.keys = 0; T.clicks = 0; var p = P(); p.openedAt = new Date(T.t0).toISOString(); p.openedVia = src; render(); }
  function elapsed() { return T.t0 ? Math.round((Date.now() - T.t0) / 100) / 10 : null; }
  document.addEventListener('keydown', function () { if (T.t0) T.keys++; }, true);
  document.addEventListener('mousedown', function () { if (T.t0) T.clicks++; }, true);

  // ---------- last visit for this patient ----------
  function priorVisits() { var pid = window.EHR && EHR.currentPatientId; if (!pid) return []; var cur = EHR.currentVisitId, t = ($('visitDate') || {}).value || today();
    var list = []; try { list = EHR_visitsForPatient(pid); } catch (e) {}
    return list.filter(function (v) { return v && (v.visitId || v.id) !== cur && (v.status || 'open') !== 'void' && v.visit && v.visit.date && v.visit.date < t; }); }
  function lastVisit() { return priorVisits()[0] || null; }

  // ---------- repeat last visit ----------
  function flat(o, pre, out) { out = out || {}; Object.keys(o || {}).forEach(function (k) { var v = o[k], key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = JSON.stringify(v == null ? '' : v); }); return out; }
  function snapshotForDiff() { var d = {}; try { d = gatherAllData(); } catch (e) {} return { complaint: d.complaint || {}, history: d.history || {}, examData: clone(APP.examData || {}), activeRegions: (APP.activeRegions || []).slice() }; }
  function repeatLast() {
    var p = P(); if (p.signed) { toast('This note is signed. Use an addendum.'); return { ok: false, reason: 'signed' }; }
    var prev = lastVisit(); if (!prev) { toast('No earlier visit for this patient to repeat.'); return { ok: false, reason: 'noPrior' }; }
    var cur = { visitId: EHR.currentVisitId, patient: null }; try { cur.patient = gatherAllData().patient; } catch (e) {}
    var d = clone(prev); NOT_CARRIED.forEach(function (k) { delete d[k]; });
    d.patient = cur.patient || d.patient; d.visit = { type: 'followup', date: ($('visitDate') || {}).value || today(), caseNo: (prev.visit || {}).caseNo || '' };
    var carriedDx = [];
    Object.keys(d.examData || {}).forEach(function (r) { var D = d.examData[r]; if (!D) return; EXAM_NOT_CARRIED.forEach(function (k) { delete D[k]; });
      if (D.icd10 || D.primaryDx || D.formulatedCondition) carriedDx.push(r); D.p8Carried = { fromVisit: prev.visitId || prev.id, fromDate: prev.visit.date }; });
    try { restoreData(d); } catch (e) {}
    if (cur.visitId) EHR.currentVisitId = cur.visitId;
    if ($('visitDate')) $('visitDate').value = d.visit.date;
    APP.visitType = 'followup'; try { var chip = document.querySelectorAll('#sec-patient .chip-group .chip')[1]; if (chip) { chip.parentElement.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('active'); }); chip.classList.add('active'); } } catch (e) {}
    try { P1Outcomes.state.vas = null; P1Outcomes.state.q = {}; } catch (e) {}
    p.carriedFrom = { visitId: prev.visitId || prev.id, date: prev.visit.date, at: new Date().toISOString(), prevVas: (prev.outcomes || {}).vas == null ? null : prev.outcomes.vas, prevScores: clone((prev.outcomes || {}).scores || {}) };
    p.baseline = snapshotForDiff(); p.dxToConfirm = carriedDx; p.rfChecked = null;
    toast('Carried forward from ' + prev.visit.date + ' — enter only what changed'); render(); return { ok: true, from: prev.visit.date, regions: carriedDx };
  }
  function changes() { var p = P(); if (!p.baseline) return []; var now = snapshotForDiff(), out = [];
    ['complaint', 'history'].forEach(function (sec) { var a = flat(p.baseline[sec]), b = flat(now[sec]); Object.keys(Object.assign({}, a, b)).forEach(function (k) { if (a[k] !== b[k]) out.push({ where: sec, key: k, from: a[k] && JSON.parse(a[k]), to: b[k] && JSON.parse(b[k]) }); }); });
    var ra = p.baseline.examData || {}, rb = now.examData || {};
    Object.keys(Object.assign({}, ra, rb)).forEach(function (r) { var a = flat(ra[r]), b = flat(rb[r]); Object.keys(Object.assign({}, a, b)).forEach(function (k) { if (/^(p8|p7|dxConfirmed|dxIcdLocked|ddxList|formulated)/.test(k)) return; if (a[k] !== b[k]) out.push({ where: r, key: k, from: a[k] && JSON.parse(a[k]), to: b[k] && JSON.parse(b[k]) }); }); });
    return out; }
  function confirmDxUnchanged(region) { var regs = region ? [region] : (P().dxToConfirm || []).slice(); regs.forEach(function (r) { var D = getExamData(r); D.dxConfirmed = true; D.p8DxConfirmedUnchanged = new Date().toISOString(); }); P().dxToConfirm = (P().dxToConfirm || []).filter(function (r) { return regs.indexOf(r) < 0; }); render(); return regs; }
  function setRedFlagsRechecked(v) { var pos = []; try { pos = P1RedFlags.positives() || []; } catch (e) {} P().rfChecked = { value: v, at: new Date().toISOString(), positives: pos }; render(); }

  // ---------- note ----------
  function activeRegions() { return (APP.activeRegions || []).filter(function (r) { return REGION_LABEL[r]; }); }
  function vasNow() { try { return P1Outcomes.state.vas; } catch (e) { return null; } }
  function fmt(v) { return Array.isArray(v) ? v.join(', ') : (v === '' || v == null ? '(blank)' : String(v)); }
  function noteText() { var p = P(), pf = prof(), d = ($('visitDate') || {}).value || today(), L = [];
    L.push('FOLLOW-UP NOTE — ' + d);
    if (p.carriedFrom) L.push('Findings carried forward from the visit of ' + p.carriedFrom.date + ' and reviewed; unchanged unless listed below.');
    L.push('S: ' + (($('p8Subj') || {}).value || '').trim());
    var vas = vasNow(); L.push('Pain (VAS 0–10): ' + (vas == null ? 'not recorded' : vas + '/10') + (p.carriedFrom && p.carriedFrom.prevVas != null ? ' (previous ' + p.carriedFrom.prevVas + '/10)' : ''));
    var ch = changes().filter(function (c) { return c.key !== 'redFlags'; }); L.push('O: ' + (ch.length ? 'Changes since last visit: ' + ch.map(function (c) { return (REGION_LABEL[c.where] || c.where) + ' ' + (typeof ROMDATA !== 'undefined' ? ROMDATA.keyLabel(c.where, c.key) : c.key) + ': ' + fmt(c.from) + ' → ' + fmt(c.to); }).join('; ') : (p.carriedFrom ? 'No change in recorded findings.' : 'See examination record.')));
    activeRegions().forEach(function (r) { var D = APP.examData[r] || {}; L.push('A (' + REGION_LABEL[r] + '): ' + (D.formulatedCondition || D.primaryDx || '(no diagnosis)') + (D.icd10 ? ' — ICD-10 ' + D.icd10 : '') + (D.p8DxConfirmedUnchanged ? ' — confirmed unchanged' : D.dxConfirmed ? ' — confirmed' : ' — NOT confirmed'));
      L.push('P (' + REGION_LABEL[r] + '): ' + ((D.txMods || []).join(', ') || 'no treatment recorded') + (D.planMod ? '; plan ' + D.planMod : '')); });
    var rf = p.rfChecked; L.push('Red flags re-checked today: ' + (!rf ? 'NOT DONE' : rf.value === 'none-new' ? 'no new red flags' : 'new red flag(s): ' + (rf.positives || []).join(', ')));
    try { var R = APP.redFlags || {}; (R.acks || []).forEach(function (k) { if (k.tier) L.push('Red-flag decision (' + k.tier + '): ' + k.decision + (k.reason ? ' — ' + k.reason : '') + ' [' + (k.flagText || []).join('; ') + '] by ' + k.by); }); (APP.techAudit || []).forEach(function (t) { if (t.decision === 'proceed') L.push('Technique caution — proceeded: ' + t.technique + (t.region ? ' (' + t.region + ')' : '') + ' despite ' + t.flags.join(' / ') + ' — reason: ' + t.reason + ' (' + t.by + ')'); }); var ue = P1RedFlags.undocumentedEmergency(); if (ue.length) L.push('EMERGENCY red flag(s) — decision NOT documented: ' + ue.join(', ')); } catch (e) {}
    L.push('Practitioner: ' + (pf.name || '') + (pf.quals ? ', ' + pf.quals : '') + (pf.prNo ? ', Pr nr ' + pf.prNo : ''));
    return L.join('\n'); }
  function blockers() { var p = P(), pf = prof(), b = [];
    if (!activeRegions().length) b.push('no examined region on this visit');
    activeRegions().forEach(function (r) { var D = APP.examData[r] || {}; if (!D.dxConfirmed) b.push(REGION_LABEL[r] + ' diagnosis not confirmed (confirm unchanged, or confirm the new one)'); });
    if (vasNow() == null) b.push('pain score (VAS) not recorded today');
    if (!(($('p8Subj') || {}).value || '').trim()) b.push("subjective update (what the patient reports since last visit) is empty");
    if (!p.rfChecked) b.push('red flags not re-checked today');
    // v2 (user decision 2026-10-16): red-flag decisions never block signing. Undocumented EMERGENCY flags are written into the signed note instead.
    if (!pf.name || !pf.prNo) b.push('practitioner name and practice number missing in Profile (a signed record must be attributable)');
    return b; }
  async function sha256(t) { return window.ccSha256(String(t)); } // v7: works on the iPad over http:// too (p1-sha256.js; same hash as crypto.subtle)
  async function sign() { var p = P(); if (p.signed) return { ok: false, reason: 'already signed' }; var b = blockers(); if (b.length) { toast('Cannot sign: ' + b[0]); render(); return { ok: false, reason: 'blocked', blockers: b }; }
    var txt = noteText(), pf = prof(), sec = elapsed();
    p.signed = { at: new Date().toISOString(), by: pf.name, prNo: pf.prNo, quals: pf.quals || '', note: txt, sha256: await sha256(txt), durationSec: sec, underTarget: sec != null && sec < TARGET_SEC, targetSec: TARGET_SEC, keys: T.keys, clicks: T.clicks, carriedFrom: p.carriedFrom ? { visitId: p.carriedFrom.visitId, date: p.carriedFrom.date } : null, changes: changes().length };
    try { p.signed.frozen = freeze(gatherAllData()); p.signed.frozenSha256 = await sha256(JSON.stringify(p.signed.frozen)); } catch (e) {}
    var saved = null; try { var d = gatherAllData(); d.status = 'signed'; saved = EHR_upsertVisit(d); } catch (e) {}
    toast('Note signed' + (sec != null ? ' in ' + sec + ' s' : '')); render(); return { ok: true, signed: p.signed, visitId: saved && saved.visitId }; }
  async function verify() { var s = P().signed; return !!s && (await sha256(s.note)) === s.sha256; }
  async function addendum(text, reason) { var p = P(), pf = prof(); if (!p.signed) return { ok: false, reason: 'not signed' }; text = String(text || '').trim(); reason = String(reason || '').trim();
    if (!text || !reason) return { ok: false, reason: 'addendum text and reason are both required' }; if (!pf.name || !pf.prNo) return { ok: false, reason: 'practitioner not identified' };
    var a = { at: new Date().toISOString(), by: pf.name, prNo: pf.prNo, reason: reason, text: text }; a.sha256 = await sha256(a.at + '|' + a.by + '|' + a.reason + '|' + a.text);
    p.addenda = (p.addenda || []).concat([a]); try { var d = gatherAllData(); d.status = 'signed'; EHR_upsertVisit(d); } catch (e) {} render(); return { ok: true, addendum: a }; }


  // ---------- v2: whole-visit lock after signing ----------
  // Clinical sections become read-only; documents/exports (imaging, certificate, report incl. billing) stay usable.
  var LOCK_SECTIONS = ['sec-patient', 'sec-history', 'sec-freenotes', 'sec-bodymap', 'sec-exam', 'sec-photos', 'sec-exercises', 'sec-iceheat'];
  // v3 (user decision 2026-10-16): contact/admin fields stay editable after signing; every edit is logged and goes to the patient record.
  var CONTACT_FIELDS = { ptPhone: 'phone', ptEmail: 'email', ptMedAid: 'medAid', ptMedAidNo: 'medAidNo' };
  var LOCK_EXEMPT = '#patientSearchCard, #ehrTodayVisitCard, #ehrTimelineCard, #p8Card, #ccDocPracCtl, .region-tab, .soap-tab, .nav, .p10-view, ' + Object.keys(CONTACT_FIELDS).map(function (k) { return '#' + k; }).join(', ');
  function contactBase() { var p = P(), b = {}; var fp = (p.signed && p.signed.frozen && p.signed.frozen.patient) || {}; Object.keys(CONTACT_FIELDS).forEach(function (id) { var k = CONTACT_FIELDS[id]; b[k] = fp[k] || ''; });
    (p.contactLog || []).forEach(function (l) { b[l.field] = l.to; }); return b; }
  function contactEdit(id) { if (!isLocked() || !CONTACT_FIELDS[id]) return null; var el = $(id), k = CONTACT_FIELDS[id], to = el ? el.value : '', from = contactBase()[k]; if (to === from) return null;
    var pf = prof(), p = P(), e = { at: new Date().toISOString(), by: pf.name || '', prNo: pf.prNo || '', field: k, from: from, to: to };
    p.contactLog = (p.contactLog || []).concat([e]); var f = {}; f[k] = to; try { EHR_updatePatientContact(EHR.currentPatientId, f); } catch (x) {}
    try { var d = gatherAllData(); d.status = 'signed'; EHR_upsertVisit(d); try { EHR_updatePatientContact(EHR.currentPatientId, f); } catch (x) {} } catch (x) {} render(); return e; }
  document.addEventListener('change', function (ev) { var t = ev.target; if (t && t.id && CONTACT_FIELDS[t.id]) contactEdit(t.id); }, true);
  // Clinical keys of gatherAllData() frozen at signing (everything except these document/admin keys).
  var NON_CLINICAL = ['docPractice', 'p7Billing', 'p6Reports', 'imaging', 'certificate', 'report', 'p8', 'status', 'visitId', 'id', 'patientId', 'updatedAt', 'savedAt', 'syncedAt', 'source'];
  // v5: practice labels in the admin log are shown with the current practice name (the stored entry is not rewritten)
  function pl(l, v) { try { return /^practice for documents/.test(l.field) ? ccPracticeName(v) : v; } catch (e) { return v; } }
  function isLocked() { return !!(typeof APP !== 'undefined' && APP.p8 && APP.p8.signed); }
  function exempt(el) { return !!(el && el.closest && el.closest(LOCK_EXEMPT)); }
  function inLocked(el) { return !!(el && el.closest && LOCK_SECTIONS.some(function (id) { return el.closest('#' + id); })); }
  function disableAll() { LOCK_SECTIONS.forEach(function (id) { var sec = $(id); if (!sec) return; sec.classList.toggle('p8-locked', isLocked());
    [].forEach.call(sec.querySelectorAll('input, select, textarea, button'), function (el) { if (exempt(el)) return;
      if (isLocked()) { if (!el.disabled) { el.disabled = true; el.dataset.p8Lock = '1'; } } else if (el.dataset.p8Lock) { el.disabled = false; delete el.dataset.p8Lock; } }); });
    var ban = $('p8LockBanner'); if (isLocked() && !ban) { ban = document.createElement('div'); ban.id = 'p8LockBanner'; ban.style.cssText = 'position:sticky;top:0;z-index:50;background:#e8f5e9;color:#1b5e20;font-size:12px;padding:4px 8px;border-bottom:1px solid #a5d6a7';
      var host = document.querySelector('.nav'); (host && host.parentNode ? host.parentNode : document.body).insertBefore(ban, host ? host.nextSibling : document.body.firstChild); }
    if (ban) { if (isLocked()) ban.textContent = '🔒 Visit signed ' + localStamp(APP.p8.signed.at) + ' by ' + APP.p8.signed.by + ' — read-only. Changes only by addendum (Patient tab); phone, email, medical-aid details and the practice for documents stay editable and are logged. Reports, certificates, imaging and billing exports remain available.'; else ban.remove(); } }
  function guard(e) { if (!isLocked()) return; var t = e.target; if (!inLocked(t) || exempt(t)) return;
    var interactive = t.closest && t.closest('input, select, textarea, button, .chip, canvas, [data-cc-click], [contenteditable], label');
    if (!interactive) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'click' || e.type === 'pointerdown') toast('Visit is signed — add an addendum instead'); }
  ['click', 'pointerdown', 'mousedown', 'touchstart', 'input', 'change', 'keydown', 'paste', 'drop'].forEach(function (ev) { document.addEventListener(ev, function (e) { if (ev === 'keydown' && e.altKey && e.shiftKey) return; guard(e); }, true); });
  var mo = null; function watch() { if (mo || typeof MutationObserver === 'undefined') return; var pend = false; mo = new MutationObserver(function () { if (!isLocked() || pend) return; pend = true; setTimeout(function () { pend = false; disableAll(); }, 0); });
    LOCK_SECTIONS.forEach(function (id) { var s = $(id); if (s) mo.observe(s, { childList: true, subtree: true }); }); }
  function freeze(d) { var o = {}; Object.keys(d || {}).forEach(function (k) { if (NON_CLINICAL.indexOf(k) < 0) o[k] = clone(d[k]); }); return o; }

  // ---------- dictation (Web Speech API where the browser offers it) ----------
  var rec = null;
  function dictSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function dictResult(text) { var t = $('p8Subj'); if (!t) return; t.value = (t.value ? t.value.replace(/\s*$/, ' ') : '') + String(text).trim(); t.dispatchEvent(new Event('input')); P().dictated = (P().dictated || 0) + 1; }
  function dictToggle() { if (!dictSupported()) { toast('Dictation is not available in this browser — type, or use the device keyboard microphone'); return false; }
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; dictBtn(); return false; }
    var R = window.SpeechRecognition || window.webkitSpeechRecognition; rec = new R(); rec.lang = 'en-ZA'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = function (e) { for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) dictResult(e.results[i][0].transcript); };
    rec.onend = function () { rec = null; dictBtn(); }; rec.onerror = function () { rec = null; dictBtn(); };
    try { rec.start(); } catch (e) { rec = null; } dictBtn(); return !!rec; }
  function dictBtn() { var b = $('p8Dict'); if (b) b.textContent = rec ? '■ Stop' : '🎙 Dictate'; }

  // ---------- keyboard path ----------
  var KEYS = { R: ['Repeat last visit', function () { repeatLast(); }], F: ['Focus subjective update', function () { var t = $('p8Subj'); if (t) t.focus(); }],
    V: ['Focus pain score (VAS)', function () { var v = $('p8Vas'); if (v) v.focus(); }], C: ['Confirm carried diagnosis unchanged (all regions)', function () { confirmDxUnchanged(); }],
    K: ['Red flags re-checked: no new red flags', function () { setRedFlagsRechecked('none-new'); }], D: ['Dictation on/off (into subjective update)', function () { dictToggle(); }], S: ['Sign note', function () { sign(); }] };
  document.addEventListener('keydown', function (e) { if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return; var k = (e.key || '').toUpperCase(); if (k.length !== 1) k = (e.code || '').replace('Key', ''); if (!KEYS[k]) return; e.preventDefault(); KEYS[k][1](); });

  // ---------- UI ----------
  function render() { try { disableAll(); watch(); } catch (e) {} var box = $('p8Body'); if (!box || typeof APP === 'undefined') return; var p = P(), prev = (window.EHR && EHR.currentPatientId) ? lastVisit() : null, b = blockers(), vas = vasNow(), sec = elapsed();
    var html = '';
    if (p.signed) {
      html += '<div class="p7-iss p7-ok">✔ Signed ' + esc(localStamp(p.signed.at)) + ' by ' + esc(p.signed.by) + ' (Pr ' + esc(p.signed.prNo) + ') · ' + (p.signed.durationSec != null ? p.signed.durationSec + ' s from opening the patient (target under ' + TARGET_SEC + ' s: ' + (p.signed.underTarget ? 'met' : 'NOT met') + ')' : 'timer not started') + ' · SHA-256 ' + esc(p.signed.sha256.slice(0, 16)) + '…</div>' +
        '<pre id="p8SignedNote" style="white-space:pre-wrap;font-size:12px;background:var(--surface2,#f6f6f6);padding:6px;border-radius:6px">' + esc(p.signed.note) + '</pre>' +
        ((p.addenda || []).length ? '<h4 style="margin:6px 0 2px">Addenda</h4>' + p.addenda.map(function (a) { return '<div style="font-size:12px;border-left:3px solid var(--accent);padding-left:6px;margin:3px 0"><b>' + esc(localStamp(a.at)) + ' · ' + esc(a.by) + '</b> — reason: ' + esc(a.reason) + '<br>' + esc(a.text) + '</div>'; }).join('') : '') +
        ((p.contactLog || []).length ? '<h4 style="margin:6px 0 2px">Contact/admin changes after signing</h4><div id="p8ContactLog" style="font-size:11px">' + p.contactLog.map(function (l) { return esc(localStamp(l.at)) + ' · ' + esc(l.by) + ' · ' + esc(l.field) + ': ' + esc(pl(l, l.from) || '(blank)') + ' → ' + esc(pl(l, l.to) || '(blank)'); }).join('<br>') + '</div>' : '') +
        '<div class="grid2"><div><label>Addendum</label><textarea id="p8AddText" rows="2"></textarea></div><div><label>Reason for the addendum (required)</label><input id="p8AddReason"></div></div><button type="button" class="btn btn-secondary" id="p8AddBtn">Add dated, signed addendum</button> <span id="p8AddMsg" style="font-size:12px"></span>';
      box.innerHTML = html; $('p8AddBtn').onclick = async function () { var r = await addendum($('p8AddText').value, $('p8AddReason').value); $('p8AddMsg').textContent = r.ok ? 'Addendum added.' : r.reason; }; return; }
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-primary" id="p8Repeat"' + (prev ? '' : ' disabled') + ' title="Alt+Shift+R">↻ Repeat last visit' + (prev ? ' (' + esc(prev.visit.date) + ')' : '') + '</button>' +
      '<span class="p7-src" id="p8Timer">' + (sec != null ? '⏱ ' + Math.round(sec) + ' s since opening the patient (target under ' + TARGET_SEC + ' s)' : 'Timer starts when a patient is opened') + '</span></div>' +
      (p.carriedFrom ? '<div class="p7-src">Carried forward from ' + esc(p.carriedFrom.date) + '. Outcome scores, billing, reports and the red-flag re-check are not carried forward.</div>' : (prev ? '' : '<div class="p7-src">No earlier visit for this patient.</div>')) +
      '<label style="margin-top:6px">Subjective update since last visit (type or dictate) — Alt+Shift+F</label><div style="display:flex;gap:6px"><textarea id="p8Subj" rows="2" style="flex:1">' + esc(p.subj || '') + '</textarea><button type="button" class="btn btn-secondary" id="p8Dict" title="Alt+Shift+D"' + (dictSupported() ? '' : ' disabled') + '>' + (rec ? '■ Stop' : '🎙 Dictate') + '</button></div>' +
      (dictSupported() ? '' : '<div class="p7-src">Dictation is not available in this browser (Web Speech API missing).</div>') +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px"><label style="margin:0">Pain now (VAS 0–10) — Alt+Shift+V <input type="number" id="p8Vas" min="0" max="10" step="1" style="width:60px" value="' + (vas == null ? '' : vas) + '"></label>' +
      (p.carriedFrom && p.carriedFrom.prevVas != null ? '<span class="p7-src">previous ' + p.carriedFrom.prevVas + '/10</span>' : '') + '</div>' +
      ((p.dxToConfirm || []).length ? '<div style="margin-top:6px">' + p.dxToConfirm.map(function (r) { var D = APP.examData[r] || {}; return '<div style="font-size:12px">' + esc(REGION_LABEL[r]) + ': ' + esc(D.formulatedCondition || D.primaryDx || '') + (D.icd10 ? ' — ' + esc(D.icd10) : '') + ' <button type="button" class="btn btn-secondary p8-dxok" data-r="' + r + '" title="Alt+Shift+C">Confirm unchanged</button></div>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:6px;font-size:12px">Red flags re-checked today: <button type="button" class="btn btn-secondary" id="p8RfNone" title="Alt+Shift+K">No new red flags</button> <button type="button" class="btn btn-secondary" id="p8RfNew">New red flag — record it</button> ' + (p.rfChecked ? '<b>' + (p.rfChecked.value === 'none-new' ? '✔ no new red flags' : '⚠ new red flag recorded') + '</b>' : '') + '</div>' +
      '<details style="margin-top:6px"><summary style="font-size:12px">Changes since last visit (' + changes().length + ') · note preview</summary><pre id="p8Preview" style="white-space:pre-wrap;font-size:12px">' + esc(noteText()) + '</pre></details>' +
      '<div class="p7-iss p7-e" id="p8Blockers"' + (b.length ? '' : ' style="display:none"') + '>Before signing: ' + esc(b.join('; ')) + '</div>' +
      '<button type="button" class="btn btn-primary" id="p8Sign" style="margin-top:6px"' + (b.length ? ' disabled' : '') + ' title="Alt+Shift+S">✍ Sign note</button>' +
      '<div class="p7-src">Keyboard: ' + Object.keys(KEYS).map(function (k) { return 'Alt+Shift+' + k + ' ' + KEYS[k][0]; }).join(' · ') + '</div>';
    var subjVal = $('p8Subj') ? $('p8Subj').value : null; box.innerHTML = html; if (subjVal != null) $('p8Subj').value = subjVal;
    $('p8Repeat').onclick = function () { repeatLast(); };
    $('p8Subj').oninput = function () { P().subj = this.value; refresh(); };
    $('p8Vas').onchange = $('p8Vas').oninput = function () { var n = this.value === '' ? null : Math.max(0, Math.min(10, Math.round(+this.value))); try { P1Outcomes.state.vas = n; var r = document.getElementById('p1oVas'); if (r && n != null) { r.value = n; var l = document.getElementById('p1oVasVal'); if (l) l.textContent = n + '/10'; } } catch (e) {} refresh(); };
    $('p8Dict').onclick = function () { dictToggle(); };
    [].forEach.call(box.querySelectorAll('.p8-dxok'), function (x) { x.onclick = function () { confirmDxUnchanged(x.dataset.r); }; });
    $('p8RfNone').onclick = function () { setRedFlagsRechecked('none-new'); };
    $('p8RfNew').onclick = function () { setRedFlagsRechecked('new'); try { var s = document.querySelector('[data-cc-click*="sec-history"], [data-sec="history"]'); if (s) s.click(); var rf = $('redFlags'); if (rf) rf.scrollIntoView({ block: 'center' }); } catch (e) {} };
    $('p8Sign').onclick = function () { sign(); };
  }
  // partial update (no re-render) so typing/clicking is never interrupted by a rebuilt card
  function refresh() { var bl = blockers(), s = $('p8Sign'), e = $('p8Blockers'), pr = $('p8Preview'); if (s) s.disabled = !!bl.length; if (e) { e.style.display = bl.length ? '' : 'none'; e.textContent = 'Before signing: ' + bl.join('; '); } if (pr) pr.textContent = noteText(); }
  function inject() { var host = $('sec-patient'); if (!host || $('p8Card')) return; var c = document.createElement('div'); c.className = 'card'; c.id = 'p8Card';
    c.innerHTML = '<div class="card-title"><span class="icon">⚡</span> Follow-up fast path <span style="font-weight:400;color:var(--text3);font-size:11px">— repeat last visit, enter what changed, sign</span></div><div id="p8Body"></div>';
    var anchor = $('ehrTodayVisitCard'); if (anchor && anchor.parentNode === host) host.insertBefore(c, anchor.nextSibling); else host.insertBefore(c, host.firstChild); render(); }
  setInterval(function () { var t = $('p8Timer'); if (t && T.t0 && !P().signed) t.textContent = '⏱ ' + Math.round(elapsed()) + ' s since opening the patient (target under ' + TARGET_SEC + ' s)'; }, 1000);
  function hook() { inject();
    if (typeof window.EHR_openPatient === 'function' && !window.EHR_openPatient._p8) { var op = window.EHR_openPatient; window.EHR_openPatient = function () { APP.p8 = {}; var r = op.apply(this, arguments); startTimer('openPatient'); return r; }; window.EHR_openPatient._p8 = 1; }
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p8) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (d && APP.p8) { if (APP.p8.signed && APP.p8.signed.frozen) Object.keys(APP.p8.signed.frozen).forEach(function (k) { d[k] = clone(APP.p8.signed.frozen[k]); }); if (d.patient) Object.keys(CONTACT_FIELDS).forEach(function (id) { var el = document.getElementById(id); if (el) d.patient[CONTACT_FIELDS[id]] = el.value; }); d.p8 = clone(APP.p8); if (APP.p8.signed) d.status = 'signed'; } } catch (e) {} return d; }; window.gatherAllData._p8 = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p8) { var rd = window.restoreData; window.restoreData = function (data) { var keep = APP.p8; var r = rd.apply(this, arguments); try { APP.p8 = data && data.p8 ? clone(data.p8) : (keep || {}); } catch (e) {} setTimeout(render, 0); return r; }; window.restoreData._p8 = 1; } }
  window.P1FollowUp = { TARGET_SEC: TARGET_SEC, CONTACT_FIELDS: CONTACT_FIELDS, contactEdit: contactEdit, isLocked: isLocked, LOCK_SECTIONS: LOCK_SECTIONS, applyLock: disableAll, NOT_CARRIED: NOT_CARRIED, KEYS: KEYS, lastVisit: lastVisit, priorVisits: priorVisits, repeatLast: repeatLast, changes: changes, confirmDxUnchanged: confirmDxUnchanged, setRedFlagsRechecked: setRedFlagsRechecked, noteText: noteText, blockers: blockers, sign: sign, verify: verify, addendum: addendum, dictSupported: dictSupported, dictResult: dictResult, dictToggle: dictToggle, startTimer: startTimer, elapsed: elapsed, timer: T, render: render, today: today };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else setTimeout(hook, 0);
})();
