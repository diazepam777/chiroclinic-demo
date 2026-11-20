/* P1 item 9 v1 — iPad patient intake (local / Node only, no Firebase).
 * Patient fills demographics, history, red flags and a baseline questionnaire in a kiosk page (intake.html).
 * Nothing reaches the chart until the clinician reviews it field by field and presses "Accept selected".
 * Positive red flags accepted into the chart fire the item 2 alert (P1RedFlags.checkAlert).
 * Rules + sources: docs/P1_ITEM9_INTAKE_RULES.md. */
(function () {
  'use strict';
  var KIOSK = !!window.P1_INTAKE_KIOSK;
  var INBOX_KEY = 'chiroclinic_intake_inbox', KIOSK_KEY = 'chiroclinic_kiosk';
  var VERSION = 'p1-item9-v1';
  // ---------- small SHA-256 (works over plain-http LAN where crypto.subtle is unavailable) ----------
  function sha256(str) {
    function r(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [], H = [], p = 2, n = 0;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (n < 64) { var ok = true; for (var f = 2; f * f <= p; f++) if (p % f === 0) { ok = false; break; } if (ok) { if (n < 8) H[n] = frac(Math.pow(p, 1 / 2)); K[n] = frac(Math.pow(p, 1 / 3)); n++; } p++; }
    var b = unescape(encodeURIComponent(str)), w = [], l = b.length * 8, i;
    for (i = 0; i < b.length; i++) w[i >> 2] |= b.charCodeAt(i) << (24 - (i % 4) * 8);
    w[l >> 5] |= 0x80 << (24 - l % 32); w[(((l + 64) >> 9) << 4) + 15] = l;
    for (var j = 0; j < w.length; j += 16) {
      var a = H.slice(0), W = [];
      for (i = 0; i < 64; i++) {
        if (i < 16) W[i] = w[j + i] | 0; else { var s0 = r(7, W[i - 15]) ^ r(18, W[i - 15]) ^ (W[i - 15] >>> 3), s1 = r(17, W[i - 2]) ^ r(19, W[i - 2]) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
        var t1 = (a[7] + (r(6, a[4]) ^ r(11, a[4]) ^ r(25, a[4])) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + W[i]) | 0;
        var t2 = ((r(2, a[0]) ^ r(13, a[0]) ^ r(22, a[0])) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0].concat(a.slice(0, 7)); a[4] = (a[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function nowISO() { return new Date().toISOString(); }
  function rid() { return 'in-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 8); }

  // ---------- patient-facing definitions ----------
  // Region: patient label -> chart pcRegion value; questionnaire per roadmap (NDI neck, ODI low back/pelvis). QuickDASH/LEFS held back (licences).
  var REGIONS = [['Neck', 'Cervical Spine', 'ndi'], ['Mid back', 'Thoracic Spine', ''], ['Low back', 'Lumbar Spine', 'odi'], ['Pelvis / buttock (SI joint)', 'Pelvis/SI', 'odi'],
    ['Hip', 'Hip', ''], ['Shoulder', 'Shoulder', ''], ['Elbow', 'Elbow', ''], ['Wrist / hand / fingers', 'Wrist/Fingers', ''], ['Knee', 'Knee', ''], ['Ankle / foot', 'Ankle/Foot', '']];
  var SIDES = [['Right', 'Right'], ['Left', 'Left'], ['Both sides', 'Both'], ['In the middle', 'Central']];
  var FREQ = [['Constant (all the time)', 'Constant'], ['Comes and goes', 'Intermittent']];
  var RESPONSE = ['Much Improved', 'Improved', 'No Change', 'Worse', 'N/A'];
  var GENDER = ['Male', 'Female', 'Other'];
  var SMOKING = ['Non-smoker', 'Current smoker', 'Ex-smoker'], ALCOHOL = ['None', 'Social', 'Moderate', 'Heavy'], EXERCISE = ['Sedentary', 'Light', 'Moderate', 'Active'];
  // Conditions: chart chip data-val (exact) + the chart's own chip label as patient wording.
  var CONDITIONS = [['Hypertension', 'High blood pressure'], ['Diabetes', 'Diabetes (sugar)'], ['Heart Disease', 'Heart condition'], ['High Cholesterol', 'High cholesterol'],
    ['Anticoagulant / Clotting Condition', 'Blood thinners or a clotting condition'], ['Asthma', 'Asthma'], ['COPD / Allergy', 'COPD / chronic lung condition'], ['Thyroid', 'Thyroid condition'],
    ['Gastrointestinal / Reflux', 'Stomach problems / reflux'], ['Epilepsy', 'Epilepsy'], ['Parkinsonism', "Parkinson's"], ['Migraine / Neuropathic Pain', 'Migraine or nerve pain'],
    ['Vertigo / Nausea', 'Vertigo'], ['Depression/Anxiety', 'Depression, anxiety or sleep problems'], ['Arthritis', 'Arthritis'], ['Rheumatoid Arthritis', 'Rheumatoid arthritis / autoimmune condition'],
    ['Osteoporosis', 'Osteoporosis (thin bones)'], ['Cancer', 'Cancer (now or in the past)'], ['Stroke', 'Stroke'], ['Kidney / Urology', 'Kidney or bladder condition'], ['Pregnancy', 'Pregnant'],
    ['HIV/AIDS', 'HIV'], ['Tuberculosis', 'Tuberculosis (TB)'], ['Fibromyalgia', 'Fibromyalgia']];
  // Red flags: patient-answerable subset of item 2 keys (exam-only, age-cut-off and unverified items excluded). Lay wording from the
  // item 2 question / sign-off sheet "suggested wording". v3: tiers sourced in item 2; lay wording = clinic default (unsourced).
  var RF_STATUS = 'tiers sourced (item 2, links on each flag); lay question wording is clinic default (unsourced)';
  var RF = [
    ['ce_saddle', 'New numbness or tingling between your legs or around your bottom (the area you would sit on a saddle)?'],
    ['ce_bladder', 'New trouble starting to pass urine, leaking urine, or not feeling when your bladder is full?'],
    ['ce_bowel', 'New loss of bowel control, or not feeling when you need to open your bowels?'],
    ['ce_sexual', 'New change in sexual function or feeling in the genital area?'],
    ['ce_bilat', 'Pain, numbness or weakness in BOTH legs, or symptoms in one leg now spreading to both?'],
    ['ce_weak', 'Leg weakness that is getting worse, or your foot dragging or slapping when you walk?'],
    ['va_dizzy', 'New dizziness or a spinning feeling (vertigo)?'],
    ['va_diplopia', 'Double vision or other new problems with your eyesight?'],
    ['va_dysarthria', 'Slurred speech or difficulty swallowing?'],
    ['va_numb', 'Numbness of your face or of one side of your body?'],
    ['va_ataxia', 'Unsteady walking or new clumsiness?'],
    ['va_nausea', 'Nausea or vomiting with the neck pain or headache?'],
    ['va_headache', 'A sudden, severe or "worst ever" headache or neck pain unlike anything you have had before?'],
    ['va_trauma', 'A recent neck or head injury (even a minor one) before these symptoms started?'],
    ['sy_cancer', 'Have you ever had cancer?'],
    ['sy_weight', 'Have you lost weight recently without trying?'],
    ['sy_fever', 'Fever, chills or night sweats, or feeling generally unwell?'],
    ['sy_night', 'Constant pain that does not ease with rest or changing position, or is worse at night?'],
    ['sy_immuno', 'A weakened immune system, long-term steroid use, or injecting drugs?'],
    ['sy_thoracic', 'Mid-back pain together with chest pain, stomach pain or trouble breathing?'],
    ['cm_hands', 'Clumsy hands, for example trouble with buttons, keys or writing?'],
    ['cm_gait', 'A change in the way you walk, unsteadiness, or new falls?'],
    ['cm_lhermitte', 'An electric-shock feeling down your back or into your arms or legs when you bend your neck?'],
    ['fx_osteo', 'Osteoporosis (thin bones), or a broken bone from a minor fall?'],
    ['fx_steroid', 'Steroid (cortisone) tablets for more than 3 months?'],
    ['fx_trauma', 'A significant injury, such as a fall from a height or a road accident, before this pain started?'],
    ['gc_jaw', 'Jaw or tongue pain or tiredness when chewing that eases when you stop?'],
    ['gc_scalp', 'A tender scalp, for example painful to brush your hair?'],
    ['gc_visual', 'New blurred or double vision, or any loss of vision?'],
    ['hs_ptosis', 'A drooping upper eyelid on one side?'],
    ['ib_move', 'Back pain that gets better with movement or exercise but not with rest?']
  ];
  var RF_ANS = [['yes', 'Yes'], ['no', 'No'], ['unknown', 'Not sure']];
  // v3: optional five-part hypermobility questionnaire (Hakim & Grahame 2003; wording as reproduced in Malfait et al. 2017, Table III). Optional for the patient.
  var HYPER_5PQ = ['Can you now (or could you ever) place your hands flat on the floor without bending your knees?',
    'Can you now (or could you ever) bend your thumb to touch your forearm?',
    'As a child, did you amuse your friends by contorting your body into strange shapes or could you do the splits?',
    'As a child or teenager, did your shoulder or kneecap dislocate on more than one occasion?',
    'Do you consider yourself “double-jointed”?'];
  // Published instructions (WSIB NDI copy; British Spine Registry ODI v2.1a copy) — sources in the rules doc.
  var Q_INTRO = {
    ndi: 'This questionnaire has been designed to give us information as to how your neck pain has affected your ability to manage in everyday life. Please answer every section and mark in each section only the one box that applies to you. We realise you may consider that two or more statements in any one section relate to you, but please just mark the box that most closely describes your problem.',
    odi: 'Please complete this questionnaire. It is designed to give us information as to how your back (or leg) trouble affects your ability to manage in everyday life. Please answer every section. Tick one box only in each section that most closely describes you today.'
  };
  // Information Regulator (South Africa) — verified 2026-10-16 at https://inforegulator.org.za/contact-us/
  var REGULATOR = { name: 'Information Regulator (South Africa)', addr: 'Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg, 2191', tollFree: '0800 017 160', phone: '010 023 5200',
    email: 'enquiries@inforegulator.org.za', complaints: 'POPIAComplaints@inforegulator.org.za', url: 'https://inforegulator.org.za' };
  var IDLE_MS = 10 * 60 * 1000;   // clinic default (unsourced): kiosk resets after 10 min without a touch
  var PIN_MAX_TRIES = 5, PIN_LOCK_MS = 60 * 1000; // clinic default (unsourced)

  function ageOn(dob, on) { if (!dob) return null; var d = new Date(dob + 'T00:00:00'), t = on ? new Date(on) : new Date(); if (isNaN(d)) return null;
    var a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a; }
  function isChild(dob) { var a = ageOn(dob); return a != null && a < 18; } // POPIA s1: "child" = under 18

  // POPIA s18(1)(a)-(h) notice, shown before collection (s18(2)(a)); consent s11(1)(a)/s27(1)(a); withdrawal s11(2)(b); objection s11(3); access s23; correction s24.
  function consentHTML(k) {
    var pr = k.practice || {};
    return '<h2>Before you start: how we use your information</h2>' +
      '<p><b>Who is asking (responsible party):</b> ' + esc(pr.name) + (k.practitioner ? ', ' + esc(k.practitioner) : '') + '. ' + esc(pr.addr) + (pr.phone ? '. Tel ' + esc(pr.phone) : '') + (pr.email ? '. ' + esc(pr.email) : '') + '.</p>' +
      '<p><b>What we collect:</b> your name, date of birth, ID number, contact and medical aid details, and health information: your symptoms, medical history, medicines, answers to safety questions and a questionnaire about how your pain affects daily life.</p>' +
      '<p><b>Why:</b> so that your practitioner can assess and treat you safely, and for the practice to run your file and accounts (including medical aid claims).</p>' +
      '<p><b>Is it compulsory?</b> No. Filling in this form is voluntary. If you leave something out, your practitioner will ask you in person; without enough information it may not be safe to treat you.</p>' +
      '<p><b>Law:</b> the Protection of Personal Information Act 4 of 2013 (POPIA) allows health professionals to use health information when it is needed for your treatment and care (section 32), and with your consent (sections 11 and 27).</p>' +
      '<p><b>Where it goes:</b> your answers are saved on this practice\'s own device or server. They are not sent to a cloud service or outside South Africa. Only your practitioner and practice staff who need them for your care and account will see them. Your practitioner checks every answer before it goes into your file.</p>' +
      '<p><b>Your rights:</b> you may ask to see the information we hold about you (section 23), ask us to correct or delete it (section 24), withdraw your consent at any time (section 11(2)(b)) and object to its use (section 11(3)). Speak to reception or your practitioner.</p>' +
      '<p><b>Complaints:</b> you may complain to the ' + esc(REGULATOR.name) + ': ' + esc(REGULATOR.addr) + '. Toll-free ' + esc(REGULATOR.tollFree) + ', tel ' + esc(REGULATOR.phone) + ', ' + esc(REGULATOR.email) + ' (complaints: ' + esc(REGULATOR.complaints) + ').</p>';
  }

  // ---------- storage ----------
  function readInbox() { try { var a = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function writeInbox(a) { localStorage.setItem(INBOX_KEY, JSON.stringify(a)); }
  function kiosk() { try { return JSON.parse(localStorage.getItem(KIOSK_KEY) || 'null'); } catch (e) { return null; } }
  function tfetch(url, opt, ms) { // never leave a request hanging (seen during service-worker install)
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(function () { if (ac) ac.abort(); }, ms || 3000);
    return fetch(url, Object.assign({ cache: 'no-store' }, opt || {}, ac ? { signal: ac.signal } : {})).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; }); }
  function onNode() { return tfetch('./api/health', {}, 2500).then(function (r) { var ok = r.ok; try { if (r.body && r.body.cancel) r.body.cancel().catch(function () {}); } catch (e) {} return ok; }) /* v9: release the unread body (newer Chrome keeps it open) */.catch(function () { return false; }); }

  // Patient submit: append-only. The kiosk never reads the inbox back.
  function submit(intake) {
    var rec = { id: rid(), version: VERSION, submittedAt: nowISO(), status: 'pending', data: intake };
    var a = readInbox(); a.push(rec); writeInbox(a);
    return onNode().then(function (ok) {
      if (!ok) return { ok: true, id: rec.id, server: false };
      return tfetch('./api/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) })
        .then(function (r) { // v6 audit: once the clinic server has the form, the kiosk device keeps no copy of the patient's answers
          if (r.ok) { try { writeInbox(readInbox().filter(function (x) { return x.id !== rec.id; })); } catch (e) {} }
          return { ok: true, id: rec.id, server: r.ok }; }).catch(function () { return { ok: true, id: rec.id, server: false }; });
    });
  }

  function validPin(p) { return /^\d{4,8}$/.test(String(p || '')); }
  function startKiosk(opts) {
    opts = opts || {}; var pr = opts.practice || {};
    if (!pr.name || !String(pr.addr || '').trim()) return { ok: false, reason: 'practice name and address are needed for the POPIA notice (Profile → practice address)' };
    if (!validPin(opts.pin)) return { ok: false, reason: 'PIN must be 4 to 8 digits' };
    var salt = (function () { try { var b = new Uint8Array(16); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); } catch (e) { return Math.random().toString(16).slice(2) + Date.now().toString(16); } })(); // v6: random salt
    var k = { active: true, startedAt: nowISO(), practice: { name: pr.name, addr: String(pr.addr).trim(), phone: pr.phone || '', email: pr.email || '' }, practitioner: opts.practitioner || '',
      salt: salt, pinHash: sha256(salt + ':' + opts.pin), tries: 0, lockUntil: 0 };
    localStorage.setItem(KIOSK_KEY, JSON.stringify(k)); return { ok: true, kiosk: k };
  }
  function endKiosk(pin) {
    var k = kiosk(); if (!k) return { ok: true };
    if (k.lockUntil && Date.now() < k.lockUntil) return { ok: false, reason: 'locked', wait: Math.ceil((k.lockUntil - Date.now()) / 1000) };
    if (sha256(k.salt + ':' + pin) !== k.pinHash) { k.tries = (k.tries || 0) + 1; if (k.tries >= PIN_MAX_TRIES) { k.tries = 0; k.lockUntil = Date.now() + PIN_LOCK_MS; } localStorage.setItem(KIOSK_KEY, JSON.stringify(k)); return { ok: false, reason: 'wrong PIN' }; }
    localStorage.removeItem(KIOSK_KEY); return { ok: true };
  }

  // ---------- mapping intake -> chart rows ----------
  function rowsFor(rec) {
    var d = rec.data || {}, dm = d.demo || {}, c = d.complaint || {}, h = d.history || {}, rows = [];
    function add(key, label, val, kind, target, show) { if (val == null || val === '' || (Array.isArray(val) && !val.length)) return; rows.push({ key: key, label: label, value: val, kind: kind, target: target, show: show == null ? String(val) : show }); }
    [['ptFirstName', 'First name', dm.firstName], ['ptLastName', 'Last name', dm.lastName], ['ptDOB', 'Date of birth', dm.dob], ['ptID', 'ID number', dm.idNo], ['ptGender', 'Gender', dm.gender],
     ['ptPhone', 'Phone', dm.phone], ['ptEmail', 'Email', dm.email], ['ptMedAid', 'Medical aid', dm.medAid], ['ptMedAidNo', 'Medical aid number', dm.medAidNo],
     ['pcRegion', 'Primary region', c.region], ['pcSide', 'Side', c.side], ['pcOnset', 'Onset', c.onset], ['pcDuration', 'Duration', c.duration], ['pcFrequency', 'Frequency', c.frequency],
     ['pcPrevTx', 'Previous treatment', c.prevTx], ['pcPrevResponse', 'Response to previous treatment', c.prevResponse],
     ['condOther', 'Other conditions', h.condOther], ['allergies', 'Allergies', h.allergies], ['surgHx', 'Surgical history', h.surgHx], ['famHx', 'Family history', h.famHx],
     ['shSmoking', 'Smoking', h.smoking], ['shAlcohol', 'Alcohol', h.alcohol], ['shExercise', 'Exercise', h.exercise], ['shOccupation', 'Occupation', h.occupation]
    ].forEach(function (x) { add('f:' + x[0], x[1], x[2], 'field', x[0]); });
    add('conditions', 'Medical conditions (added, none removed)', h.conditions, 'chips', 'conditions', (h.conditions || []).join(', '));
    add('meds', 'Medicines (added as new rows)', h.meds, 'meds', 'medList', (h.meds || []).map(function (m) { return [m.name, m.dose, m.frequency].filter(Boolean).join(' '); }).join('; '));
    var rf = d.redFlags || {}; function tl(k) { try { return window.P1RedFlags && P1RedFlags.tierOf ? (P1RedFlags.tierOf(k) === 'emergency' ? 'EMERGENCY' : 'caution') : ''; } catch (e) { return ''; } }
    RF.forEach(function (x) { if (rf[x[0]]) add('rf:' + x[0], 'Red flag' + (tl(x[0]) ? ' (' + tl(x[0]) + ')' : '') + ': ' + x[1], rf[x[0]], 'redflag', x[0], rf[x[0]] === 'unknown' ? 'not sure' : rf[x[0]]); });
    var h5 = Array.isArray(d.hyper5pq) ? d.hyper5pq : null; if (h5 && h5.some(function (v) { return v; })) { var y5 = h5.filter(function (v) { return v === 'yes'; }).length;
      add('hyper5pq', 'Five-part hypermobility questionnaire (to Joint hypermobility card)', h5, 'hyper5pq', 'hyper5pq', y5 + ' “yes” of ' + h5.filter(function (v) { return v; }).length + ' answered' + (y5 >= 2 ? ' → POSITIVE (caution)' : '')); }
    if (d.vas != null) add('vas', 'Pain now (0–10)', d.vas, 'vas', 'vas', d.vas + '/10');
    var q = d.questionnaire; if (q && q.key && Array.isArray(q.answers)) {
      var Q = window.P1Outcomes && P1Outcomes.Q[q.key], sc = Q ? Q.score(q.answers) : null;
      add('q:' + q.key, (Q ? Q.name : q.key) + ' baseline', q.answers, 'questionnaire', q.key, (sc == null ? 'incomplete — not scored' : sc + ' %') + ' (' + q.answers.filter(function (x) { return x != null; }).length + '/10 sections)');
    }
    return rows;
  }
  function chartValue(r) {
    try {
      if (r.kind === 'field') { var e = $(r.target); return e ? e.value : ''; }
      if (r.kind === 'chips') return Array.prototype.map.call(document.querySelectorAll('#conditions .chip.active'), function (c) { return c.dataset.val; }).join(', ');
      if (r.kind === 'meds') return Array.prototype.map.call(document.querySelectorAll('#medList .med-name'), function (i) { return i.value; }).filter(Boolean).join('; ');
      if (r.kind === 'redflag') return ((APP.redFlags || {}).answers || {})[r.target] || '';
      if (r.kind === 'hyper5pq') { var hq = (APP.hypermobility || {}).q5 || []; return hq.some(function (v) { return v; }) ? 'answers present' : ''; }
      if (r.kind === 'vas') return P1Outcomes.state.vas == null ? '' : P1Outcomes.state.vas + '/10';
      if (r.kind === 'questionnaire') { var a = P1Outcomes.state.q[r.target]; return a && a.length ? 'answers present' : ''; }
    } catch (e) {}
    return '';
  }
  function setField(id, v) { var e = $(id); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; }

  function accept(id, keys, by) {
    if (window.P1FollowUp && P1FollowUp.isLocked && P1FollowUp.isLocked()) return { ok: false, reason: 'This visit is signed — intake cannot change it. Open or start an unsigned visit.' };
    by = String(by || '').trim(); if (!by) return { ok: false, reason: 'reviewer name required' };
    var inbox = readInbox(), rec = inbox.filter(function (x) { return x.id === id; })[0];
    if (!rec) return { ok: false, reason: 'intake not found' }; if (rec.status !== 'pending') return { ok: false, reason: 'intake already ' + rec.status };
    var rows = rowsFor(rec), sel = {}; (keys || []).forEach(function (k) { sel[k] = 1; });
    var applied = [], skipped = [], anyYes = false;
    rows.forEach(function (r) {
      if (!sel[r.key]) { skipped.push(r.key); return; }
      if (r.kind === 'field') setField(r.target, r.value);
      else if (r.kind === 'chips') r.value.forEach(function (v) { var c = document.querySelector('#conditions .chip[data-val="' + v.replace(/"/g, '\\"') + '"]'); if (c && !c.classList.contains('active')) { if (typeof toggleChip === 'function') toggleChip(c); else c.classList.add('active'); } });
      else if (r.kind === 'meds') r.value.forEach(function (m) { try { addMedRow({ name: m.name, dose: m.dose, frequency: m.frequency, status: 'Current', notes: 'From patient intake ' + rec.submittedAt.slice(0, 10) }); } catch (e) {} });
      else if (r.kind === 'redflag') { APP.redFlags = APP.redFlags || { answers: {}, acks: [] }; APP.redFlags.answers[r.target] = r.value; if (r.value === 'yes') anyYes = true; }
      else if (r.kind === 'hyper5pq') { try { var hr = P1Hyper.setQ5(r.value); if (hr && hr.q5positive) anyYes = true; } catch (e) {} }
      else if (r.kind === 'vas') P1Outcomes.state.vas = +r.value;
      else if (r.kind === 'questionnaire') P1Outcomes.state.q[r.target] = r.value.slice();
      applied.push(r.key);
    });
    // region chip for the exam so the NDI/ODI card + red-flag screens appear
    try { var reg = (rec.data.complaint || {}).region, map = { 'Cervical Spine': 'cs', 'Thoracic Spine': 'ts', 'Lumbar Spine': 'ls', 'Pelvis/SI': 'pelvis', 'Hip': 'hip', 'Shoulder': 'shoulder', 'Elbow': 'elbow', 'Wrist/Fingers': 'wrist', 'Knee': 'knee', 'Ankle/Foot': 'ankle' };
      if (sel['f:pcRegion'] && map[reg]) { var ch = document.querySelector('#examRegionSelect .chip[data-region="' + map[reg] + '"]'); if (ch && !ch.classList.contains('active') && typeof toggleExamRegion === 'function') toggleExamRegion(ch); } } catch (e) {}
    var audit = { intakeId: rec.id, submittedAt: rec.submittedAt, reviewedAt: nowISO(), reviewedBy: by, applied: applied, skipped: skipped, consent: rec.data.consent || null };
    APP.intakeAudit = (APP.intakeAudit || []).concat([audit]);
    rec.status = 'accepted'; rec.review = audit; writeInbox(inbox);
    patchServer(rec);
    try { P1Outcomes.render(); } catch (e) {}
    try { if (window.P1RedFlags) { document.querySelectorAll('select[data-rf]').forEach(function (s) { var v = APP.redFlags.answers[s.dataset.rf]; if (v) s.value = v; }); if (anyYes) P1RedFlags.checkAlert(); } } catch (e) {}
    renderInbox();
    return { ok: true, applied: applied, skipped: skipped, redFlagAlert: anyYes };
  }
  function reject(id, by, reason) {
    by = String(by || '').trim(); if (!by) return { ok: false, reason: 'reviewer name required' };
    var inbox = readInbox(), rec = inbox.filter(function (x) { return x.id === id; })[0]; if (!rec || rec.status !== 'pending') return { ok: false, reason: 'not pending' };
    rec.status = 'rejected'; rec.review = { reviewedAt: nowISO(), reviewedBy: by, reason: String(reason || '') }; writeInbox(inbox); patchServer(rec); renderInbox(); return { ok: true };
  }
  function patchServer(rec) { onNode().then(function (ok) { if (ok) tfetch('./api/intake/' + encodeURIComponent(rec.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: rec.status, review: rec.review }) }).catch(function () {}); }); }
  // pull intakes submitted from another iPad to the Node server into the local inbox
  function pullServer() {
    return onNode().then(function (ok) { if (!ok) return 0; return tfetch('./api/intake', {}, 5000).then(function (r) { return r.json(); }).then(function (j) {
      if (window.CC_SYNC_PAUSED) return 0; // v7: a practice-backup restore is writing and checking the device data; the next app start pulls again
      var inbox = readInbox(), have = {}, n = 0; inbox.forEach(function (x) { have[x.id] = x; });
      (j.intakes || []).forEach(function (x) { if (!have[x.id]) { inbox.push(x); n++; } else if (x.status !== 'pending' && have[x.id].status === 'pending') { have[x.id].status = x.status; have[x.id].review = x.review; } });
      writeInbox(inbox); return n; }).catch(function () { return 0; }); });
  }

  // ---------- clinician UI (index.html only) ----------
  function profilePractices() { var p = {}; try { p = loadProfile() || {}; } catch (e) {}
    return [{ name: 'Melkbosstrand Chiropractic', addr: p.melkbosAddr, phone: p.melkbosPhone, email: p.melkbosEmail }, { name: 'Vredenburg Practice', addr: p.vredAddr, phone: p.vredPhone, email: p.vredEmail }]
      .map(function (x) { x.ready = !!String(x.addr || '').trim(); return x; }).concat([{ name: '', practitioner: p.name || '' }]); }
  function renderInbox() {
    if (KIOSK) return; var sec = $('sec-patient'); if (!sec) return;
    var card = $('p9Inbox'); if (!card) { card = document.createElement('div'); card.className = 'card'; card.id = 'p9Inbox'; var after = $('patientSearchCard'); if (after && after.nextSibling) sec.insertBefore(card, after.nextSibling); else sec.insertBefore(card, sec.firstChild); }
    var inbox = readInbox(), pend = inbox.filter(function (x) { return x.status === 'pending'; });
    var pr = profilePractices(), practitioner = pr.pop().practitioner;
    card.innerHTML = '<div class="card-title"><span class="icon">📥</span> Patient intake (iPad) <span id="p9Count" style="margin-left:8px;font-size:12px;color:var(--text3)">' + pend.length + ' waiting for review</span></div>' +
      (pend.length ? pend.map(function (x) { var dm = (x.data || {}).demo || {}; var rfk = Object.keys((x.data || {}).redFlags || {}).filter(function (k) { return x.data.redFlags[k] === 'yes'; }), rf = rfk.length, rfe = rfk.filter(function (k) { try { return P1RedFlags.tierOf(k) === 'emergency'; } catch (e) { return false; } }).length;
        return '<div class="p9-item" data-id="' + esc(x.id) + '" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid var(--border,#ddd)"><b>' + esc(dm.firstName + ' ' + dm.lastName) + '</b> <span style="font-size:12px">DOB ' + esc(dm.dob || '—') + ' · sent ' + esc(typeof localStamp === 'function' ? localStamp(x.submittedAt) : x.submittedAt) + '</span>' +
          (rfe ? '<span style="background:#fde2e2;color:#a00;border-radius:10px;padding:1px 8px;font-size:12px">🚨 ' + rfe + ' emergency red flag' + (rfe > 1 ? 's' : '') + '</span>' : '') + (rf - rfe ? '<span style="background:#fff3cd;color:#8a5a00;border-radius:10px;padding:1px 8px;font-size:12px">⚠ ' + (rf - rfe) + ' caution flag' + (rf - rfe > 1 ? 's' : '') + '</span>' : '') +
          '<button type="button" class="p9-review" style="margin-left:auto;background:#2B5F5C;color:#fff;border:0;border-radius:8px;padding:8px 16px">Review</button></div>'; }).join('') : '<p style="font-size:12px;color:var(--text3)">No intake waiting.</p>') +
      '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:13px">Hand the iPad to a patient (kiosk mode)</summary><div style="font-size:12px;margin:6px 0">The iPad shows only the intake form until a staff PIN is entered. It cannot open charts or other patients. For a full lock, also turn on Apple Guided Access (Settings → Accessibility → Guided Access; <a href="https://support.apple.com/en-us/111795" target="_blank" rel="noopener">Apple guide</a>).</div>' +
      '<div class="grid2"><div><label>Practice (POPIA notice shows its name and address)</label><select id="p9Practice">' + pr.map(function (x, i) { return '<option value="' + i + '"' + (x.ready ? '' : ' disabled') + '>' + esc(x.name) + (x.ready ? '' : ' — add address in Profile') + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Staff PIN to leave kiosk (4–8 digits)</label><input id="p9Pin" type="password" inputmode="numeric" autocomplete="off"></div></div>' +
      '<button type="button" id="p9Start" style="margin-top:8px;background:#2B5F5C;color:#fff;border:0;border-radius:8px;padding:9px 16px">Start patient kiosk</button> <span id="p9StartMsg" style="font-size:12px;color:#a00"></span></details>';
    card.querySelectorAll('.p9-review').forEach(function (b) { b.onclick = function () { openReview(b.closest('.p9-item').dataset.id); }; });
    $('p9Start').onclick = function () { var i = +$('p9Practice').value, r = startKiosk({ practice: pr[i] || {}, pin: $('p9Pin').value, practitioner: practitioner });
      if (!r.ok) { $('p9StartMsg').textContent = r.reason; return; }
      // v2: end the staff session on this device before handing it to a patient (kiosk must not carry a staff cookie)
      onNode().then(function (ok) { return ok ? tfetch('./api/auth/logout', { method: 'POST' }, 2500).catch(function () {}) : null; }).then(function () { location.replace('./intake.html'); }); };
  }
  function openReview(id) {
    var rec = readInbox().filter(function (x) { return x.id === id; })[0]; if (!rec) return;
    var rows = rowsFor(rec), locked = !!(window.P1FollowUp && P1FollowUp.isLocked && P1FollowUp.isLocked());
    var dm = rec.data.demo || {}, cur = (($('ptFirstName') || {}).value || '') + ' ' + (($('ptLastName') || {}).value || ''), curDob = ($('ptDOB') || {}).value || '';
    var mismatch = (cur.trim() && (cur.trim().toLowerCase() !== (dm.firstName + ' ' + dm.lastName).trim().toLowerCase())) || (curDob && dm.dob && curDob !== dm.dob);
    var old = $('p9Review'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'p9Review'; m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px';
    var cons = rec.data.consent || {};
    m.innerHTML = '<div style="background:#fff;border-radius:10px;max-width:900px;width:100%;padding:14px">' +
      '<h3 style="margin:0 0 6px">Review intake — ' + esc(dm.firstName + ' ' + dm.lastName) + '</h3>' +
      '<div style="font-size:12px;margin-bottom:6px">POPIA notice shown and consent given ' + esc(cons.at ? (typeof localStamp === 'function' ? localStamp(cons.at) : cons.at) : '—') + (cons.guardian ? ' · by ' + esc(cons.guardian.name) + ' (' + esc(cons.guardian.relationship) + ') for a child' : '') + '. Red-flag questions: ' + esc(RF_STATUS) + '.</div>' +
      (locked ? '<div style="background:#fde2e2;padding:6px;border-radius:6px;font-size:13px">This visit is signed. Intake cannot change it — open or start an unsigned visit first.</div>' : '') +
      (mismatch ? '<div style="background:#fff3cd;padding:6px;border-radius:6px;font-size:13px">⚠ The open chart (' + esc(cur.trim() || '—') + ', DOB ' + esc(curDob || '—') + ') does not match this intake. Open the right patient (Find Existing Patient) or clear the form for a new patient before accepting.</div>' : '') +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:6px"><thead><tr><th style="text-align:left;padding:4px 8px 4px 0;width:42px">Use</th><th style="text-align:left;padding:4px 8px">Field</th><th style="text-align:left;padding:4px 8px;width:22%">Patient answered</th><th style="text-align:left;padding:4px 8px;width:22%">Chart now</th></tr></thead><tbody>' +
      rows.map(function (r) { var cv = chartValue(r), rfYes = r.kind === 'redflag' && r.value === 'yes', rfEm = rfYes && /EMERGENCY/.test(r.label);
        return '<tr data-key="' + esc(r.key) + '" style="border-top:1px solid #eee' + (rfEm ? ';background:#fde2e2' : rfYes ? ';background:#fff3cd' : '') + '"><td style="padding:3px 0"><input type="checkbox" class="p9-use" checked style="width:20px;height:20px"></td><td style="padding:3px 8px">' + esc(r.label) + '</td><td style="padding:3px 8px"><b>' + esc(r.show) + '</b></td><td style="color:#666;padding:3px 8px">' + esc(cv || '—') + (cv && r.kind === 'field' && cv !== String(r.value) ? ' <b style="color:#7A4A00">(will be replaced)</b>' : '') + '</td></tr>'; }).join('') +
      '</tbody></table>' +
      '<div style="margin-top:8px;font-size:13px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="p9Confirm" style="width:22px;height:22px;flex:none"> I have reviewed each ticked answer with the patient where needed and accept it into this chart.</label></div>' +
      '<div class="grid2" style="margin-top:6px"><div><label>Reviewed by</label><input id="p9By" value="' + esc((function () { try { return loadProfile().name || ''; } catch (e) { return ''; } })()) + '"></div><div><label>Reason (if rejecting)</label><input id="p9Why"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" id="p9Accept" disabled style="background:#2B5F5C;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px">Accept selected</button><button type="button" id="p9Reject" style="background:#fff;color:#a00;border:1px solid #a00;border-radius:8px;padding:10px 18px;font-size:14px">Reject intake</button><button type="button" id="p9Close" style="margin-left:auto;background:#e3e9ea;border:0;border-radius:8px;padding:10px 18px;font-size:14px">Close</button></div><div id="p9Msg" style="font-size:12px;color:#a00;margin-top:4px"></div></div>';
    document.body.appendChild(m);
    var acc = $('p9Accept'), conf = $('p9Confirm');
    function upd() { acc.disabled = locked || mismatch || !conf.checked || !$('p9By').value.trim(); acc.style.opacity = acc.disabled ? '.45' : '1'; }
    conf.onchange = upd; $('p9By').oninput = upd; upd();
    $('p9Close').onclick = function () { m.remove(); };
    acc.onclick = function () { var keys = Array.prototype.map.call(m.querySelectorAll('tr[data-key]'), function (tr) { return tr.querySelector('.p9-use').checked ? tr.dataset.key : null; }).filter(Boolean);
      var r = accept(id, keys, $('p9By').value); if (!r.ok) { $('p9Msg').textContent = r.reason; return; } m.remove(); toast('Intake accepted: ' + r.applied.length + ' fields' + (r.redFlagAlert ? ' — red flags need review' : '')); };
    $('p9Reject').onclick = function () { var r = reject(id, $('p9By').value, $('p9Why').value); if (!r.ok) { $('p9Msg').textContent = r.reason; return; } m.remove(); toast('Intake rejected'); };
  }
  function hook() {
    if (KIOSK) return;
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p9) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (APP.intakeAudit && APP.intakeAudit.length) d.intakeAudit = JSON.parse(JSON.stringify(APP.intakeAudit)); } catch (e) {} return d; }; window.gatherAllData._p9 = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p9) { var rs = window.restoreData; window.restoreData = function (d) { var r = rs.apply(this, arguments); try { APP.intakeAudit = (d && d.intakeAudit) ? JSON.parse(JSON.stringify(d.intakeAudit)) : []; } catch (e) {} return r; }; window.restoreData._p9 = 1; }
    renderInbox();
    // pull from Node only after the service worker has settled: a fetch issued while it claims the page can stay pending (seen in Chrome)
    var go = function () { setTimeout(function () { pullServer().then(function (n) { if (n) renderInbox(); }); }, 1500); };
    try { if (navigator.serviceWorker && navigator.serviceWorker.ready) Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(r, 5000); })]).then(go); else go(); } catch (e) { go(); }
  }
  if (!KIOSK) { window.addEventListener('load', function () { setTimeout(hook, 600); }); window.addEventListener('storage', function (e) { if (e.key === INBOX_KEY) renderInbox(); }); }

  window.P1Intake = { VERSION: VERSION, INBOX_KEY: INBOX_KEY, KIOSK_KEY: KIOSK_KEY, REGIONS: REGIONS, SIDES: SIDES, FREQ: FREQ, RESPONSE: RESPONSE, GENDER: GENDER, SMOKING: SMOKING, ALCOHOL: ALCOHOL, EXERCISE: EXERCISE,
    CONDITIONS: CONDITIONS, RF: RF, HYPER_5PQ: HYPER_5PQ, RF_ANS: RF_ANS, RF_STATUS: RF_STATUS, Q_INTRO: Q_INTRO, REGULATOR: REGULATOR, IDLE_MS: IDLE_MS, PIN_MAX_TRIES: PIN_MAX_TRIES, PIN_LOCK_MS: PIN_LOCK_MS,
    sha256: sha256, ageOn: ageOn, isChild: isChild, consentHTML: consentHTML, submit: submit, startKiosk: startKiosk, endKiosk: endKiosk, kiosk: kiosk,
    rowsFor: rowsFor, accept: accept, reject: reject, renderInbox: renderInbox, openReview: openReview, pullServer: pullServer, _readInbox: KIOSK ? null : readInbox };
})();
