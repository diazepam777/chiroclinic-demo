/* P1 item 6 — One-tap reports (2026-10-15, v2: sick note per AHPCSA BN 102/2019 + HPCSA Booklet 2 rule 16)
 * Referral letter (GP/specialist), urgent/ER referral, insurer progress report, sick note.
 * Every field is read from the current visit / saved visits; nothing clinical is invented.
 * Rules and their sources: docs/P1_ITEM6_REPORTS_RULES.md. Unsourced choices are marked 'clinic default (unsourced)'.
 * Output: editable A4 preview -> Print / Save as PDF (print CSS, offline), Copy text, Email (opens mail app, never auto-sends).
 */
(function () {
  'use strict';
  var ER_SENTENCE = function (x) { return 'Examination revealed ' + x + '. Immediate referral was deemed necessary and no treatment was provided.'; };
  var REGION_LABEL = { cs: 'Cervical spine', ts: 'Thoracic spine', ls: 'Lumbar spine', pelvis: 'Pelvis/SI', hip: 'Hip', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist/Fingers', knee: 'Knee', ankle: 'Ankle/Foot' };
  var KINDS = { referral: 'Referral letter', er: 'Urgent / ER referral', insurer: 'Insurer progress report', sicknote: 'Sick note (certificate of indisposition)' };
  // Functional areas: ODI v2.1a / NDI section titles (published item text in p1-item3.js). Index = section number.
  var ODI_AREAS = { 3: 'Lifting', 4: 'Walking', 5: 'Sitting', 6: 'Standing', 7: 'Sleeping', 9: 'Social life', 10: 'Travelling' };
  var NDI_AREAS = { 3: 'Lifting', 4: 'Reading', 6: 'Concentration', 7: 'Work', 8: 'Driving', 9: 'Sleeping', 10: 'Recreation' };

  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function prof() { try { return loadProfile(); } catch (e) { return {}; } }
  function visits() { try { var a = window.CCData.all(); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function fmtDate(d) { if (!d) return ''; var t = new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')); return isNaN(t) ? String(d) : t.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function visitDate() { return val('visitDate') || localISODate(); }
  function practiceFor(d) { if (window.CCPractice) return CCPractice.forDate(d).name; var t = new Date(d + 'T00:00:00'); if (isNaN(t)) return ''; var w = t.getDay(); return (w === 3 || w === 5) ? 'Melkbosstrand Chiropractic' : (w === 1 || w === 2 || w === 4) ? 'Vredenburg Practice' : ''; }
  function patient() {
    return { name: (val('ptFirstName') + ' ' + val('ptLastName')).trim(), first: val('ptFirstName'), dob: val('ptDOB'), id: val('ptID'), medAid: val('ptMedAid'), medAidNo: val('ptMedAidNo'), fileNo: val('ptFileNo'), occupation: val('shOccupation'),
      pid: (window.EHR && EHR.currentPatientId) || '' };
  }
  function regions() { var ex = ((typeof APP !== 'undefined' ? APP : null) && APP.examData) || {}; var act = (APP.activeRegions || []).slice(); Object.keys(ex).forEach(function (r) { if (act.indexOf(r) < 0 && ex[r] && ex[r].dxConfirmed && (ex[r].primaryDx || ex[r].formulatedCondition || ex[r].icd10)) act.push(r); /* v2: only a confirmed diagnosis from a region no longer in the exam list; unconfirmed auto-suggestions stay out */ }); return act.filter(function (r) { return REGION_LABEL[r]; }); }
  function dxFor(r) { var D = (APP.examData || {})[r] || {}; return { region: r, label: REGION_LABEL[r], condition: D.formulatedCondition || D.primaryDx || '', icd10: D.icd10 || D.formulatedIcd10 || '', codeNote: (function () { try { return P1Billing.altNote(r, 'icd10'); } catch (e) { return ''; } })(), codePending: (function () { try { return D.icd10 && P1Billing.altGroup(D.icd10, r) && !P1Billing.altNote(r, 'icd10') ? true : false; } catch (e) { return false; } })(), confirmed: !!D.dxConfirmed, phase: D.phase || '', prognosis: D.prognosis && D.prognosis !== 'Select' ? D.prognosis : '', planMod: D.planMod || '', txMods: (D.txMods || []).slice(),
    ddx: (D.ddxList || []).filter(function (x) { return x && !x.dismissed && x.label; }).map(function (x) { return x.label + (x.code ? ' (' + x.code + ')' : ''); }) }; }
  function allDx() { return regions().map(dxFor).filter(function (d) { return d.condition || d.icd10; }); }
  function positiveTests(r) { var D = (APP.examData || {})[r] || {}, out = []; Object.keys(D).forEach(function (k) { var m = /^ort_([RL])_(.+)$/.exec(k); if (m && (D[k] === '+' || /^pos/i.test(D[k]))) out.push(m[2] + ' ' + m[1] + ' positive'); }); return out; }
  function redFlags() { try { var p = P1RedFlags.positives() || []; return { keys: p, text: p.length ? P1RedFlags.flagList(p) : '' }; } catch (e) { return { keys: [], text: '' }; } }
  function outcomesNow() { try { return P1Outcomes.snapshot(); } catch (e) { return {}; } }
  function hepLinesSafe() { try { if (APP.p4Hep && (APP.p4Hep.lines || []).length) return APP.p4Hep.lines.filter(function (l) { return l.decision.action !== 'stop' && l.decision.name; }).map(function (l) { return l.decision.name + (l.decision.rx ? ' — ' + l.decision.rx : ''); }); } catch (e) {}
    try { return getSelectedExercises().map(function (x) { return String(x.name || '').replace(/Recommended/gi, '').replace(/\s*🖼\s*Image/g, '').replace(/\s+/g, ' ').trim() + (x.rx ? ' — ' + x.rx : ''); }); } catch (e) { return []; } }
  function thresholds() { try { return P1Hep.HEP_THRESHOLDS; } catch (e) { return null; } }

  // Episode for insurer report: saved visits of this patient, same region, sorted by date, plus today.
  function episode(region) {
    var p = patient(), list = ((p.pid && window.CCData.forPatient(p.pid)) || visits()).filter(function (v) { return v && p.pid && v.patientId === p.pid && ((v.outcomes && v.outcomes.region) || v.currentRegion || (v.activeRegions || [])[0]) === region; })
      .sort(function (a, b) { return String((a.visit || {}).date).localeCompare(String((b.visit || {}).date)); });
    var today = visitDate(); var dates = list.map(function (v) { return (v.visit || {}).date; }).filter(Boolean);
    if (dates.indexOf(today) < 0) dates.push(today);
    return { visits: list, dates: dates.sort(), first: list[0] || null };
  }
  function scoreRow(name, first, now, lowerBetter, mic, micSrc) {
    if (first == null && now == null) return null;
    var ch = (first != null && now != null) ? Math.round((now - first) * 10) / 10 : null, verdict = '';
    if (ch != null && mic != null) { var imp = lowerBetter ? -ch : ch; verdict = imp >= mic ? 'improved by at least the minimal important change (' + mic + ', ' + micSrc + ')' : imp <= -mic ? 'worse by at least ' + mic + ' (' + micSrc + ')' : 'change smaller than ' + mic + ' (' + micSrc + ')'; }
    return { name: name, first: first, now: now, change: ch, verdict: verdict };
  }
  function outcomeRows(region) {
    var ep = episode(region), o = outcomesNow(), base = ep.first && ep.first.outcomes || null, T = thresholds() || {}, rows = [];
    var vb = base ? base.vas : null, vn = o.vas != null && o.vas !== '' ? +o.vas : null; if (vb != null && vb !== '') vb = +vb; else vb = null;
    rows.push(scoreRow('Pain VAS (0–10)', vb, vn, true, T.vasImprovedBy, 'Ostelo 2008'));
    [['ndi', 'NDI (%)', T.ndiImprovedBy, 'MacDermid 2009'], ['odi', 'Oswestry ODI (%)', T.odiImprovedBy, 'Ostelo 2008']].forEach(function (q) {
      var b = base && base.scores ? base.scores[q[0]] : null, n = o.scores ? o.scores[q[0]] : null;
      rows.push(scoreRow(q[1], b == null ? null : +b, n == null ? null : +n, true, q[2], q[3])); });
    return { rows: rows.filter(Boolean), ep: ep };
  }
  // Functional limitations reported by the patient: questionnaire sections answered above 0 (the first option is 'no limitation').
  function functionalLimits() {
    var o = outcomesNow(), out = []; var Q = (window.P1Outcomes && P1Outcomes.Q) || {};
    [['odi', ODI_AREAS], ['ndi', NDI_AREAS]].forEach(function (x) { var a = (o.answers || {})[x[0]], t = Q[x[0]] && Q[x[0]].text; if (!a || !t) return;
      Object.keys(x[1]).forEach(function (n) { var i = +n - 1, v = a[i]; if (v === null || v === '' || v === undefined || isNaN(+v) || +v < 1) return;
        var sec = t[i]; out.push({ q: x[0], area: x[1][n], score: +v, statement: sec && sec[1] && sec[1][+v] ? sec[1][+v] : '' }); }); });
    return out;
  }

  // ---------- Builders: return {title, html, text, blocked?} ----------
  // P1 latest v2: practitioner letterhead (index.html lhEffective). In image mode (TJG letterhead) the header band replaces
  // the plain name/practice header and the footer image repeats at the foot of every printed page. Default mode keeps the old layout.
  function lhImg() { try { if (typeof lhEffective !== 'function') return null; var L = lhEffective(); return L.mode === 'image' ? L : null; } catch (e) { return null; } }
  function lhFootMm(L) { try { return lhGeometryMm(L, 210 - 28).footH; } catch (e) { return 0; } }
  function lhWrap(H) { var L = lhImg(), head = H[0], body = H.slice(1).join(''); if (!L || !L.footerImg) return H.join('');
    return head + '<table class="lh-wrap p6-lhwrap" style="width:100%;border-collapse:collapse;border:0"><tfoot><tr><td style="padding:0;border:0"><div class="p6-lhspace" style="height:' + (lhFootMm(L) + 3).toFixed(1) + 'mm"></div></td></tr></tfoot><tbody><tr><td style="padding:0;border:0">' + body + '</td></tr></tbody></table>' +
      '<div class="lh-foot p6-lhfoot"><img src="' + L.footerImg + '" alt="Practice addresses" style="display:block;width:100%;height:auto"></div>'; }
  function head(kind, d, prac) {
    // v487: under the image letterhead, a text line names the practice where the patient was seen (the sick note has its own "Practice address" row)
    var L = lhImg(); if (L) return '<div class="lh-band p6-lhband"><img src="' + L.headerImg + '" alt="Letterhead" style="display:block;width:100%;height:auto"></div>' + (kind !== 'sicknote' && window.CCPractice ? CCPractice.lineHtml(prac || practiceFor(d)) : '') + '<h2 class="p6-t">' + esc(KINDS[kind]) + '</h2>';
    var lh = { practitionerHTML: '', practiceHTML: '' }; try { lh = profileLetterheadHTML(prac || practiceFor(d)); } catch (e) {}
    return '<div class="p6-lh"><div>' + lh.practitionerHTML + '</div><div class="p6-pr">' + lh.practiceHTML + '</div></div><h2 class="p6-t">' + esc(KINDS[kind]) + '</h2>';
  }
  function sig() { try { return '<div class="p6-sig">' + profileSignatureBlockHTML() + '</div>'; } catch (e) { var p = prof(); return '<div class="p6-sig">' + esc(p.name || '') + '</div>'; } }
  function ptBlock(p, extra) { return '<table class="p6-kv"><tr><td>Patient</td><td>' + esc(p.name) + '</td></tr>' + (p.dob ? '<tr><td>Date of birth</td><td>' + esc(fmtDate(p.dob)) + '</td></tr>' : '') + (p.id ? '<tr><td>ID number</td><td>' + esc(p.id) + '</td></tr>' : '') + (extra || '') + '</table>'; }
  function dxHtml(list, showStatus) { return list.length ? '<ul>' + list.map(function (d) { return '<li>' + esc(d.label) + ': ' + esc(d.condition || '(no diagnosis)') + (d.icd10 ? ' — ICD-10 ' + esc(d.icd10) + (d.codeNote ? ' <span style="font-size:smaller">(' + esc(d.codeNote) + ')</span>' : '') + (d.codePending ? ' <b>(ICD-10 code choice pending — resolve in the billing check)</b>' : '') : ' — <b>ICD-10 missing</b>') + (showStatus && !d.confirmed ? ' <i>(working assessment, not confirmed)</i>' : '') + '</li>'; }).join('') + '</ul>' : '<p><i>No diagnosis recorded.</i></p>'; }
  function blockName(n) { var w = String(n || '').replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '').trim().split(/\s+/); if (!w[0]) return ''; var sur = w.pop(); return w.map(function (x) { return x.charAt(0).toUpperCase() + '.'; }).join(' ') + ' ' + sur.toUpperCase(); }
  function missing(p) { var m = []; if (!p.name) m.push('patient name'); return m; }

  function build(kind, opt) {
    opt = opt || {}; var p = patient(), d = visitDate(), dx = allDx(), rf = redFlags(), pr = prof(), miss = missing(p), H = [], T = [];
    var to = opt.to || '';
    if (kind === 'er' && !rf.keys.length) return { blocked: 'No positive red flag recorded — urgent/ER referral needs at least one.' };
    if (kind === 'insurer') { if (!dx.length) miss.push('diagnosis'); if (dx.some(function (x) { return !x.confirmed; })) miss.push('confirmed diagnosis (confirm on the Exam tab)'); if (dx.some(function (x) { return x.codePending; })) miss.push('ICD-10 code choice (billing check)'); if (dx.some(function (x) { return !x.icd10; })) miss.push('ICD-10 code'); }
    if (kind === 'sicknote') { var pr0 = prof(), prac = opt.practice || practiceFor(d), pb = {}; try { pb = profilePracticeBlock(prac); } catch (e) {}
      if (!opt.examined) miss.push('confirmation that you examined the patient (AHPCSA BN 102/2019)');
      if (!opt.examTime) miss.push('time of examination');
      if (!opt.basis) miss.push('basis of the certificate (own observations / information from patient after examination)');
      if (prac && !pb.addr) miss.push('practice address (add the ' + prac + ' address in Profile)'); // v486: no practice on a non-practice day -> the practice prompt below, not a missing-field line
      if (!pr0.quals) miss.push('qualification'); if (!pr0.prNo) miss.push('practice number'); if (!(opt.regNo || pr0.ahpcsaNo)) miss.push('AHPCSA registration number');
      if (!opt.consent) miss.push('patient consent choice for the diagnosis description'); if (opt.consent === 'yes' && !opt.layDx) miss.push('description of the condition in lay terms');
      if (!opt.from) miss.push('from date'); if (!opt.to2) miss.push('to date'); if (opt.from && opt.to2 && opt.to2 < opt.from) miss.push('to date on/after from date'); if (!opt.type) miss.push('fitness category'); }
    // P1 latest v3 (user decision 2026-10-17, no weekend patients): no practice is assumed on a non-practice day, and no document
    // prints an empty practice address or other empty letterhead field (CCPractice, p1-docpractice.js — same wording as billing).
    var PRk = window.CCPractice ? CCPractice.forDate(d) : null, PRn = (window.CCPractice && opt.practice ? CCPractice.canon(opt.practice) : opt.practice) || (PRk ? PRk.name : '');
    if (PRk && PRn) CCPractice.missing(PRn).forEach(function (m) { if (kind === 'sicknote' && (/ address$/.test(m) || m === 'qualifications' || m === 'practice number')) return; miss.push('Profile: ' + m); });
    if (miss.length) return { blocked: 'Missing: ' + miss.join(', ') + '. Nothing is filled in by default — enter it and tap again.' };
    if (PRk && !PRn) return { blocked: CCPractice.prompt(PRk.day), needsPractice: true, date: d, title: KINDS[kind] };
    H.push(head(kind, d, PRn)); T.push(KINDS[kind].toUpperCase(), 'Date: ' + fmtDate(d));
    if (kind === 'er' || kind === 'referral') {
      H.push('<p>Date: ' + esc(fmtDate(d)) + '</p>' + (to ? '<p>To: ' + esc(to) + '</p>' : '<p>To: Attending doctor</p>'));
      H.push(ptBlock(p)); T.push('To: ' + (to || 'Attending doctor'), 'Patient: ' + p.name + (p.dob ? ' (DOB ' + p.dob + ')' : '') + (p.id ? ', ID ' + p.id : ''));
      if (kind === 'er') {
        var s = ER_SENTENCE(rf.text); H.push('<p class="p6-urgent"><b>URGENT — same-day assessment requested.</b></p><p>' + esc(s) + '</p>'); T.push('URGENT — same-day assessment requested.', s);
      } else {
        H.push('<p>Dear Colleague,</p><p>Thank you for seeing this patient, whom I assessed on ' + esc(fmtDate(d)) + '.</p>'); T.push('Dear Colleague,', 'Thank you for seeing this patient, whom I assessed on ' + fmtDate(d) + '.');
        if (rf.keys.length) { var s2 = ER_SENTENCE(rf.text); H.push('<p><b>Red flags:</b> ' + esc(s2) + '</p>'); T.push('Red flags: ' + s2); }
      }
      H.push('<h3>Assessment</h3>' + dxHtml(dx, true)); T.push('Assessment:'); dx.forEach(function (x) { T.push('- ' + x.label + ': ' + (x.condition || '(no diagnosis)') + (x.icd10 ? ' — ICD-10 ' + x.icd10 + (x.codeNote ? ' (' + x.codeNote + ')' : '') + (x.codePending ? ' (ICD-10 code choice pending)' : '') : '') + (x.confirmed ? '' : ' (working assessment, not confirmed)')); });
      dx.forEach(function (x) { var pt = positiveTests(x.region); if (pt.length) { H.push('<p><b>' + esc(x.label) + ' positive findings:</b> ' + esc(pt.join('; ')) + '</p>'); T.push(x.label + ' positive findings: ' + pt.join('; ')); }
        if (x.ddx.length) { H.push('<p><b>Differentials considered:</b> ' + esc(x.ddx.slice(0, 5).join('; ')) + '</p>'); T.push('Differentials considered: ' + x.ddx.slice(0, 5).join('; ')); } });
      if (kind === 'referral') { if (opt.reason) { H.push('<p><b>Reason for referral:</b> ' + esc(opt.reason) + '</p>'); T.push('Reason for referral: ' + opt.reason); }
        H.push('<p>I would be grateful for your assessment and management. Kind regards,</p>'); T.push('I would be grateful for your assessment and management. Kind regards,'); }
    } else if (kind === 'insurer') {
      var extra = (p.medAid ? '<tr><td>Medical aid</td><td>' + esc(p.medAid) + '</td></tr>' : '') + (p.medAidNo ? '<tr><td>Membership no.</td><td>' + esc(p.medAidNo) + '</td></tr>' : '') + (p.fileNo ? '<tr><td>File no.</td><td>' + esc(p.fileNo) + '</td></tr>' : '');
      H.push(ptBlock(p, extra)); T.push('Patient: ' + p.name + (p.medAid ? ' | Medical aid: ' + p.medAid : '') + (p.medAidNo ? ' ' + p.medAidNo : ''));
      H.push('<h3>Diagnosis</h3>' + dxHtml(dx, false)); dx.forEach(function (x) { T.push('Diagnosis ' + x.label + ': ' + x.condition + ' — ICD-10 ' + x.icd10); });
      dx.forEach(function (x) {
        var R = outcomeRows(x.region), ep = R.ep;
        H.push('<h3>' + esc(x.label) + ' — course of care</h3><p>Consultations in this episode: ' + ep.dates.length + ' (first ' + esc(fmtDate(ep.dates[0])) + ', latest ' + esc(fmtDate(ep.dates[ep.dates.length - 1])) + ')' + (x.phase ? '. Phase: ' + esc(x.phase.replace(/_/g, ' ')) : '') + '.</p>');
        T.push(x.label + ': ' + ep.dates.length + ' consultations, first ' + ep.dates[0] + ', latest ' + ep.dates[ep.dates.length - 1] + (x.phase ? ', phase ' + x.phase : ''));
        if (R.rows.length) { H.push('<table class="p6-tb"><tr><th>Outcome</th><th>First visit</th><th>This visit</th><th>Change</th><th>Interpretation</th></tr>' + R.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + (r.first == null ? '—' : r.first) + '</td><td>' + (r.now == null ? '—' : r.now) + '</td><td>' + (r.change == null ? '—' : (r.change > 0 ? '+' : '') + r.change) + '</td><td>' + esc(r.verdict || 'needs both values') + '</td></tr>'; }).join('') + '</table>');
          R.rows.forEach(function (r) { T.push('- ' + r.name + ': ' + (r.first == null ? '—' : r.first) + ' -> ' + (r.now == null ? '—' : r.now) + (r.verdict ? ' (' + r.verdict + ')' : '')); }); }
        else { H.push('<p><i>No outcome scores recorded.</i></p>'); T.push('No outcome scores recorded.'); }
        var plan = []; if (x.txMods.length) plan.push('Treatment: ' + x.txMods.join(', ')); if (x.planMod) plan.push('Plan: ' + x.planMod); if (x.prognosis) plan.push('Prognosis: ' + x.prognosis);
        if (plan.length) { H.push('<p>' + plan.map(esc).join('<br>') + '</p>'); T.push.apply(T, plan); }
      });
      var hl = hepLinesSafe(); if (hl.length) { H.push('<h3>Home exercise programme</h3><ul>' + hl.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'); T.push('Home exercise programme:'); hl.forEach(function (l) { T.push('- ' + l); }); }
      if (rf.keys.length) { H.push('<p><b>Red flags recorded:</b> ' + esc(rf.text) + '</p>'); T.push('Red flags recorded: ' + rf.text); }
    } else if (kind === 'sicknote') {
      var P = prof(), prac2 = (opt.practice && window.CCPractice ? CCPractice.canon(opt.practice) : opt.practice) || practiceFor(d), PB = {}; try { PB = profilePracticeBlock(prac2); } catch (e) {}
      var reg = opt.regNo || P.ahpcsaNo, desig = P.designation || 'Chiropractor', issued = opt.issueDate || localISODate();
      var pt = '<table class="p6-kv">' + [['Practitioner', P.name], ['Professional designation', desig], ['Qualification', P.quals], ['AHPCSA registration no.', reg], ['Practice no.', P.prNo], ['Practice address', PB.name + ', ' + String(PB.addr).replace(/\n/g, ', ')]].map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>';
      H.push(pt); T.push('Practitioner: ' + P.name + ', ' + desig + ', ' + P.quals + ', AHPCSA reg ' + reg + ', Pr nr ' + P.prNo, 'Practice: ' + PB.name + ', ' + String(PB.addr).replace(/\n/g, ', '));
      H.push(ptBlock(p, (opt.empNo ? '<tr><td>Employment no.</td><td>' + esc(opt.empNo) + '</td></tr>' : '') + (p.occupation ? '<tr><td>Occupation</td><td>' + esc(p.occupation) + '</td></tr>' : '')));
      T.push('Patient: ' + p.name + (p.id ? ', ID ' + p.id : '') + (opt.empNo ? ', employment no. ' + opt.empNo : ''));
      var days = Math.round((new Date(opt.to2) - new Date(opt.from)) / 86400000) + 1;
      var basis = opt.basis === 'observation' ? 'This certificate is issued as a result of my personal observations during an examination.' : 'This certificate is issued as a result of information received from the patient after an examination, which is based on acceptable medical grounds.';
      var exS = 'I examined the patient on ' + fmtDate(d) + ' at ' + opt.examTime + '.';
      var dxS = opt.consent === 'yes' ? 'With the patient\'s informed consent: the patient is suffering from ' + opt.layDx + '.' : 'In my opinion, based on an examination of the patient, the patient is unfit to work.';
      var gS = /^Unfit for all/i.test(opt.type) ? 'The patient is totally indisposed for duty' : /school/i.test(opt.type) ? 'The patient is unfit for school / sport' : 'The patient is able to perform less strenuous duties in the work situation (' + opt.type.replace(/^Fit for /i, '') + ')';
      var pS = gS + ' from ' + fmtDate(opt.from) + ' to ' + fmtDate(opt.to2) + ' inclusive: ' + days + ' day' + (days === 1 ? '' : 's') + ' of recommended sick leave.';
      [exS, basis, dxS, pS].forEach(function (x) { H.push('<p>' + esc(x) + '</p>'); T.push(x); });
      var lim = opt.restrictions || [];
      if (lim.length) { H.push('<h3>Functional restrictions</h3><ul>' + lim.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'); T.push('Functional restrictions:'); lim.forEach(function (l) { T.push('- ' + l); }); }
      if (opt.notes) { H.push('<p>' + esc(opt.notes) + '</p>'); T.push(opt.notes); }
      var blk = blockName(P.name), sigImg = P.signature ? '<img src="' + P.signature + '" alt="Signature" style="max-height:60px;max-width:220px">' : '';
      H.push('<p>Date of issue: ' + esc(fmtDate(issued)) + '</p><table class="p6-sigt"><tr><td style="width:55%;border-bottom:1px solid #333;height:56px;vertical-align:bottom">' + sigImg + '</td><td style="vertical-align:bottom;padding-left:12px"><b>' + esc(blk) + '</b><br>AHPCSA reg. no. ' + esc(reg) + '</td></tr><tr><td style="font-size:9pt">Signature</td><td style="font-size:9pt;padding-left:12px">Initials and surname (block letters)</td></tr></table>');
      T.push('Date of issue: ' + fmtDate(issued), '', 'Signature: ____________________   ' + blk + ', AHPCSA reg. no. ' + reg);
      return { title: KINDS[kind], kind: kind, html: lhWrap(H), letterhead: !!lhImg(), text: T.join('\n'), redFlags: rf.keys.slice(), dx: dx, hpcsa: { issueDate: issued, examTime: opt.examTime, basis: opt.basis, consent: opt.consent, regNo: reg, practice: prac2 } };
    }
    H.push(sig()); T.push('', (pr.name || '') + (pr.quals ? ', ' + pr.quals : '') + (pr.prNo ? ', Pr nr ' + pr.prNo : ''));
    return { title: KINDS[kind], kind: kind, html: lhWrap(H), letterhead: !!lhImg(), text: T.join('\n'), redFlags: rf.keys.slice(), dx: dx };
  }

  // ---------- UI ----------
  var CSS = '#p6Card .p6-row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}#p6Modal{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.5);overflow:auto;padding:16px 6px}' +
    '#p6Modal .p6-bar{max-width:820px;margin:0 auto 8px;display:flex;gap:6px;flex-wrap:wrap;background:#fff;padding:8px;border-radius:8px}' +
    '#p6Doc{max-width:794px;min-height:1000px;margin:0 auto;background:#fff;color:#222;padding:48px 56px;box-sizing:border-box;font:11pt/1.45 Georgia,serif}' +
    '#p6Doc .p6-lh{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #1a5276;padding-bottom:8px}#p6Doc .p6-lh h1{font-size:15pt;margin:0}#p6Doc .p6-pr{text-align:right;font-size:9.5pt;color:#555}' +
    '#p6Doc .p6-t{font-size:13pt;margin:14px 0}#p6Doc h3{font-size:11pt;margin:12px 0 4px}#p6Doc table{border-collapse:collapse;font-size:10pt}#p6Doc .p6-kv td{padding:2px 10px 2px 0}#p6Doc .p6-tb td,#p6Doc .p6-tb th{border:1px solid #bbb;padding:3px 6px}' +
    '#p6Doc .p6-urgent{color:#C0392B}#p6Doc .p6-sig{margin-top:28px}' +
    '@media print{@page{size:A4;margin:14mm}body.p6-printing>*:not(#p6Modal){display:none!important}body.p6-printing #p6Modal{position:static;background:none;padding:0;overflow:visible}body.p6-printing #p6Modal .p6-bar{display:none!important}body.p6-printing #p6Doc{max-width:none;min-height:0;padding:0}body.p6-printing #p6Doc .p6-lhfoot{position:fixed;left:0;right:0;bottom:0}html:has(body.p6-printing),body.p6-printing,body.p6-printing #p6Modal{background:#fff!important}}#p6Doc .p6-lhband{margin:0 0 4mm}#p6Doc .p6-lhfoot{margin-top:10mm}';
  function ensureCss() { if ($('p6Css')) return; var s = document.createElement('style'); s.id = 'p6Css'; s.textContent = CSS; document.head.appendChild(s); }
  function log(rep, action) { APP.p6Reports = APP.p6Reports || []; APP.p6Reports.push({ kind: rep.kind, action: action, at: new Date().toISOString(), by: prof().name || '', redFlags: rep.redFlags, dx: rep.dx.map(function (x) { return { region: x.region, condition: x.condition, icd10: x.icd10, confirmed: x.confirmed }; }) }); }
  function docText() { var e = $('p6Doc'); return e ? e.innerText : ''; }
  function open(kind, opt) {
    ensureCss(); var rep = build(kind, opt);
    if (rep.needsPractice) { var w0 = $('p6Msg'); if (w0) w0.textContent = rep.blocked; CCPractice.ask(rep.date, rep.title, function () { open(kind, opt); }); return rep; }
    if (rep.blocked) { toast(rep.blocked); var w = $('p6Msg'); if (w) w.textContent = rep.blocked; return rep; }
    close(); var m = document.createElement('div'); m.id = 'p6Modal';
    m.innerHTML = '<div class="p6-bar"><b style="align-self:center;margin-right:auto">' + esc(rep.title) + ' — edit freely, then:</b><button type="button" class="btn btn-primary" id="p6Print">Print / Save as PDF</button><button type="button" class="btn btn-secondary" id="p6Copy">Copy text</button><button type="button" class="btn btn-secondary" id="p6Mail">Email…</button><button type="button" class="btn btn-secondary" id="p6Close">Close</button></div><div id="p6Doc" contenteditable="true">' + rep.html + '</div>';
    document.body.appendChild(m);
    $('p6Print').onclick = function () { log(rep, 'print'); document.body.classList.add('p6-printing'); try { window.print(); } finally { setTimeout(function () { document.body.classList.remove('p6-printing'); }, 500); } };
    $('p6Copy').onclick = function () { log(rep, 'copy'); try { navigator.clipboard.writeText(docText()).then(function () { toast('Report copied'); }); } catch (e) { toast('Copy not available'); } };
    $('p6Mail').onclick = function () { log(rep, 'email'); var p = patient(); location.href = 'mailto:?subject=' + encodeURIComponent(rep.title + (p.name ? ' — ' + p.name : '')) + '&body=' + encodeURIComponent(docText()); };
    $('p6Close').onclick = close;
    return rep;
  }
  function close() { var m = $('p6Modal'); if (m) m.remove(); document.body.classList.remove('p6-printing'); }
  function sickOpts() {
    var r = [].slice.call(document.querySelectorAll('#p6Lim input:checked')).map(function (c) { return c.value; }); var extra = val('p6LimExtra'); if (extra) r.push(extra);
    var reg = val('p6Reg'); if (reg) { try { var pp = JSON.parse(localStorage.getItem('chiroclinic_profile') || '{}'); if (pp.ahpcsaNo !== reg) { pp.ahpcsaNo = reg; localStorage.setItem('chiroclinic_profile', JSON.stringify(pp)); } } catch (e) {} }
    return { from: val('p6From'), to2: val('p6To'), type: val('p6Type'), practice: val('p6Prac'), examTime: val('p6Time'), basis: val('p6Basis'), consent: val('p6Consent'), layDx: val('p6LayDx'), empNo: val('p6EmpNo'), regNo: reg, examined: !!($('p6Examined') || {}).checked, restrictions: r, notes: val('p6Notes') };
  }
  function renderLimits() {
    var box = $('p6Lim'); if (!box) return; var L = functionalLimits();
    box.innerHTML = L.length ? L.map(function (l, i) { var t = l.area + ' — patient reports: “' + l.statement + '” (' + l.q.toUpperCase() + ')'; return '<label style="display:flex;gap:6px;font-size:12px"><input type="checkbox" checked style="width:auto" value="' + esc(t) + '"> ' + esc(t) + '</label>'; }).join('')
      : '<em style="font-size:12px;color:var(--text3)">No limitation recorded in today\'s Oswestry/NDI. Add restrictions below if needed.</em>';
  }
  function cardHtml() {
    return '<div class="card" id="p6Card"><div class="card-title"><span class="icon">⚡</span> One-tap reports <span style="font-weight:400;color:var(--text3);font-size:11px">— filled from this visit, editable, print/PDF offline</span></div>' +
      '<div class="p6-row"><button type="button" class="btn btn-secondary" data-p6="referral">Referral letter</button><button type="button" class="btn btn-secondary" data-p6="er">Urgent / ER referral</button><button type="button" class="btn btn-secondary" data-p6="insurer">Insurer progress report</button></div>' +
      '<div class="grid2"><div><label>Referral to (optional)</label><input id="p6To2Name" placeholder="Doctor / practice"></div><div><label>Reason for referral (optional)</label><input id="p6Reason"></div></div>' +
      '<div class="section-label" style="margin-top:10px">Sick note</div><div class="grid2"><div><label>From</label><input type="date" id="p6From"></div><div><label>To (inclusive)</label><input type="date" id="p6To"></div>' +
      '<div><label>Fitness category</label><select id="p6Type"><option value="">— choose —</option><option>Unfit for all duties</option><option>Fit for light / restricted duties</option><option>Fit for sedentary work only</option><option>Unfit for school / sport</option></select></div>' +
      '<div><label>Practice</label><select id="p6Prac"><option value="">— by visit weekday —</option><option>Melkbosstrand Chiropractic</option><option>Vredenburg Practice</option></select></div>' +
      '<div><label>Time of examination</label><input type="time" id="p6Time"></div>' +
      '<div><label>Basis of certificate</label><select id="p6Basis"><option value="">— choose —</option><option value="observation">My personal observations during examination</option><option value="patient">Information from the patient after examination</option></select></div>' +
      '<div><label>Patient consents to describe the condition?</label><select id="p6Consent"><option value="">— ask the patient —</option><option value="yes">Yes — describe in lay terms</option><option value="no">No — state "unfit to work" only</option></select></div>' +
      '<div style="grid-column:1/-1"><label>Condition in lay terms (only with consent)</label><input id="p6LayDx" placeholder="e.g. low back strain"></div>' +
      '<div><label>Employment no. (if applicable)</label><input id="p6EmpNo"></div>' +
      '<div><label>AHPCSA registration no. (saved to profile)</label><input id="p6Reg"></div></div>' +
      '<label style="display:flex;gap:6px;font-size:12px;margin-top:6px"><input type="checkbox" id="p6Examined" style="width:auto"> I examined this patient for this certificate (required — AHPCSA Board Notice 102 of 2019)</label>' +
      '<div style="margin-top:6px"><label>Functional restrictions (from today\'s questionnaire answers — untick any that do not apply)</label><div id="p6Lim"></div><input id="p6LimExtra" placeholder="Other restriction (optional)" style="margin-top:4px"></div>' +
      '<div><label>Notes (optional)</label><input id="p6Notes"></div><div class="p6-row"><button type="button" class="btn btn-secondary" id="p6Sick">Sick note</button></div><div id="p6Msg" style="font-size:12px;color:#a05a00"></div></div>';
  }
  function inject() {
    var host = $('sec-report'); if (!host || $('p6Card')) { renderLimits(); return; } ensureCss();
    var w = document.createElement('div'); w.innerHTML = cardHtml(); host.insertBefore(w.firstChild, host.firstChild);
    [].forEach.call(host.querySelectorAll('[data-p6]'), function (b) { b.onclick = function () { $('p6Msg').textContent = ''; open(b.dataset.p6, { to: val('p6To2Name'), reason: val('p6Reason') }); }; });
    try { var pr1 = prof(); if (pr1.ahpcsaNo) $('p6Reg').value = pr1.ahpcsaNo; } catch (e) {}
    $('p6Sick').onclick = function () { $('p6Msg').textContent = ''; open('sicknote', sickOpts()); };
    $('p6From').onchange = function () { if (!$('p6From').value) return; }; renderLimits();
  }
  function hook() {
    inject();
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p6) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (d && typeof d === 'object') d.p6Reports = JSON.parse(JSON.stringify(APP.p6Reports || [])); } catch (e) {} return d; }; window.gatherAllData._p6 = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p6) { var rd = window.restoreData; window.restoreData = function (data) { var r = rd.apply(this, arguments); try { APP.p6Reports = data && data.p6Reports ? JSON.parse(JSON.stringify(data.p6Reports)) : []; renderLimits(); } catch (e) {} return r; }; window.restoreData._p6 = 1; }
    document.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('[data-cc-click*="sec-report"],[data-section="report"],[data-cc-click*="\'report\'"]')) setTimeout(renderLimits, 50); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.P1Reports = { blockName: blockName, KINDS: KINDS, ER_SENTENCE: ER_SENTENCE, build: build, open: open, close: close, functionalLimits: functionalLimits, outcomeRows: outcomeRows, episode: episode, renderLimits: renderLimits, ODI_AREAS: ODI_AREAS, NDI_AREAS: NDI_AREAS };
})();
