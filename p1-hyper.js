/* P1 item 9 v3 — Joint hypermobility chart field (user instruction 2026-10-16).
 * Beighton score (9 points; cut-offs 6 before puberty / 5 puberty–50 / 4 over 50: 2017 International Classification of the EDS, Malfait et al.)
 * Five-part questionnaire (Hakim & Grahame 2003; wording as reproduced in Malfait 2017 Table III; positive = 2+ "yes").
 * Diagnosis (hEDS / HSD / other heritable connective-tissue disorder). Results feed the item 2 caution tier (hm_* keys) and technique warnings.
 * Age → puberty mapping (under 12 = pre-pubertal) is a clinic default (unsourced); the practitioner can override it. */
(function () {
  'use strict';
  if (window.P1_INTAKE_KIOSK) return;
  var UNS = 'clinic default (unsourced)';
  var SRC = { EDS2017: 'https://ehlers-danlos.com/wp-content/uploads/2022/03/Malfait_et_al-2017-American_Journal_of_Medical_Genetics_Part_C__Seminars_in_Medical_Genetics.pdf',
    EDSJH: 'https://www.ehlers-danlos.com/assessing-joint-hypermobility/', HG2003: 'https://doi.org/10.1111/j.1742-1241.2003.tb10455.x', WHO: 'https://iris.who.int/handle/10665/43352' };
  var BEIGHTON = [['b_lf_l', 'Left little finger bends back beyond 90°'], ['b_lf_r', 'Right little finger bends back beyond 90°'],
    ['b_th_l', 'Left thumb can be pushed back to touch the forearm'], ['b_th_r', 'Right thumb can be pushed back to touch the forearm'],
    ['b_el_l', 'Left elbow hyperextends more than 10°'], ['b_el_r', 'Right elbow hyperextends more than 10°'],
    ['b_kn_l', 'Left knee hyperextends more than 10°'], ['b_kn_r', 'Right knee hyperextends more than 10°'],
    ['b_trunk', 'Palms flat on the floor with knees straight']];
  var Q5 = ['Can you now (or could you ever) place your hands flat on the floor without bending your knees?',
    'Can you now (or could you ever) bend your thumb to touch your forearm?',
    'As a child, did you amuse your friends by contorting your body into strange shapes or could you do the splits?',
    'As a child or teenager, did your shoulder or kneecap dislocate on more than one occasion?',
    'Do you consider yourself “double-jointed”?'];
  var DX = [['', '—'], ['none', 'None known'], ['hEDS', 'Hypermobile EDS (hEDS)'], ['HSD', 'Hypermobility spectrum disorder (HSD)'], ['HDCT', 'Other heritable connective-tissue disorder (e.g. Marfan, other EDS types)'], ['unknown', 'Not sure']];
  function st() { APP.hypermobility = APP.hypermobility || { beighton: {}, q5: [null, null, null, null, null], dx: '', stage: 'auto' }; return APP.hypermobility; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function age() { var e = document.getElementById('ptDOB'), d = e && e.value ? new Date(e.value) : null; if (!d || isNaN(d)) return null; var n = new Date(), a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; }
  function stage() { var s = st(); if (s.stage === 'pre' || s.stage === 'adult' || s.stage === 'over50') return s.stage; var a = age(); if (a == null) return null; return a < 12 ? 'pre' : a > 50 ? 'over50' : 'adult'; }
  function cutoff(sg) { return sg === 'pre' ? 6 : sg === 'over50' ? 4 : sg === 'adult' ? 5 : null; }
  function score() { var b = st().beighton, n = 0, done = 0; BEIGHTON.forEach(function (x) { if (b[x[0]] === true) n++; if (b[x[0]] === true || b[x[0]] === false) done++; }); return { score: n, done: done }; }
  function q5() { var a = st().q5 || [], y = a.filter(function (v) { return v === 'yes'; }).length, ans = a.filter(function (v) { return v === 'yes' || v === 'no' || v === 'unknown'; }).length; return { yes: y, answered: ans, positive: y >= 2 }; }
  function results() {
    var s = st(), sc = score(), sg = stage(), co = cutoff(sg), q = q5();
    return { beighton: sc.score, beightonDone: sc.done, stage: sg, cutoff: co, beightonPositive: sc.done ? (co != null && sc.score >= co) : null,
      q5yes: q.yes, q5answered: q.answered, q5positive: q.answered ? q.positive : null, dx: s.dx, dxPositive: s.dx ? /^(hEDS|HSD|HDCT)$/.test(s.dx) : null };
  }
  // feed item 2 (only when the card has an answer; never clears a manual 'yes' when the card is untouched)
  function feed(alert) {
    var r = results(), RF = window.P1RedFlags; if (!RF || !RF.setAnswer) return r;
    function put(k, v) { if (v == null) return; RF.setAnswer(k, v ? 'yes' : 'no', alert); }
    put('hm_beighton', r.beightonPositive); put('hm_5pq', r.q5positive); put('hm_dx', r.dxPositive); return r;
  }
  function summary() { var r = results(); var sgT = { pre: 'before puberty', adult: 'puberty to 50', over50: 'over 50' };
    return 'Beighton ' + r.beighton + '/9' + (r.beightonDone < 9 ? ' (' + r.beightonDone + '/9 tested)' : '') + (r.cutoff != null ? ' · cut-off ' + r.cutoff + ' (' + sgT[r.stage] + ')' + (r.beightonDone ? (r.beightonPositive ? ' → POSITIVE' : ' → below cut-off') : '') : ' · enter date of birth or choose an age group for the cut-off') +
      ' | Five-part questionnaire: ' + (r.q5answered ? r.q5yes + ' yes' + (r.q5positive ? ' → POSITIVE' : ' → negative') : 'not asked') + (r.dx ? ' | Diagnosis: ' + (DX.filter(function (d) { return d[0] === r.dx; })[0] || ['', r.dx])[1] : ''); }
  function cardHTML() {
    var s = st();
    return '<div class="card" id="p9Hyper"><div class="card-title"><span class="icon">🤸</span> Joint hypermobility</div>' +
      '<div style="font-size:11px;color:var(--text3,#777)">Beighton score and cut-offs: <a href="' + SRC.EDS2017 + '" target="_blank" rel="noopener">2017 International Classification of the EDS</a> (Malfait et al.), test wording from <a href="' + SRC.EDSJH + '" target="_blank" rel="noopener">The Ehlers-Danlos Society</a>. Five-part questionnaire: <a href="' + SRC.HG2003 + '" target="_blank" rel="noopener">Hakim &amp; Grahame 2003</a> (as reproduced in Malfait 2017, Table III). Using age under 12 for "before puberty" is a ' + UNS + ' choice; you can override it. A positive result is a caution flag (WHO 2005), never a block.</div>' +
      '<div style="font-weight:700;font-size:13px;margin-top:6px">Beighton score (tick each positive; leave untested blank)</div>' +
      BEIGHTON.map(function (b) { var v = s.beighton[b[0]]; return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:12px;border-bottom:1px solid var(--border,#eee)"><span>' + esc(b[1]) + '</span><select data-hb="' + b[0] + '" style="width:auto;min-width:90px"><option value=""' + (v == null ? ' selected' : '') + '>—</option><option value="no"' + (v === false ? ' selected' : '') + '>No</option><option value="yes"' + (v === true ? ' selected' : '') + '>Yes</option></select></div>'; }).join('') +
      '<div style="font-size:12px;margin-top:4px">Age group for cut-off <select id="p9hStage" style="width:auto"><option value="auto"' + (s.stage === 'auto' ? ' selected' : '') + '>Auto from date of birth</option><option value="pre"' + (s.stage === 'pre' ? ' selected' : '') + '>Before puberty (≥ 6)</option><option value="adult"' + (s.stage === 'adult' ? ' selected' : '') + '>Puberty to 50 (≥ 5)</option><option value="over50"' + (s.stage === 'over50' ? ' selected' : '') + '>Over 50 (≥ 4)</option></select></div>' +
      '<div style="font-weight:700;font-size:13px;margin-top:8px">Five-part questionnaire (positive = 2 or more “yes”)</div>' +
      Q5.map(function (q, i) { var v = (s.q5 || [])[i]; return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:12px;border-bottom:1px solid var(--border,#eee)"><span>' + (i + 1) + '. ' + esc(q) + '</span><select data-hq="' + i + '" style="width:auto;min-width:90px"><option value="">—</option><option value="no"' + (v === 'no' ? ' selected' : '') + '>No</option><option value="yes"' + (v === 'yes' ? ' selected' : '') + '>Yes</option><option value="unknown"' + (v === 'unknown' ? ' selected' : '') + '>Unsure</option></select></div>'; }).join('') +
      '<div style="font-size:12px;margin-top:6px">Diagnosis <select id="p9hDx" style="width:auto;max-width:100%">' + DX.map(function (d) { return '<option value="' + d[0] + '"' + (s.dx === d[0] ? ' selected' : '') + '>' + esc(d[1]) + '</option>'; }).join('') + '</select></div>' +
      '<div id="p9hSum" style="font-size:12px;margin-top:6px;font-weight:700"></div></div>';
  }
  function upd() { var e = document.getElementById('p9hSum'); if (e) e.textContent = summary(); }
  function bind(c) {
    c.querySelectorAll('select[data-hb]').forEach(function (x) { x.onchange = function () { st().beighton[x.dataset.hb] = x.value === 'yes' ? true : x.value === 'no' ? false : null; feed(true); upd(); }; });
    c.querySelectorAll('select[data-hq]').forEach(function (x) { x.onchange = function () { st().q5[+x.dataset.hq] = x.value || null; feed(true); upd(); }; });
    c.querySelector('#p9hStage').onchange = function () { st().stage = this.value; feed(true); upd(); };
    c.querySelector('#p9hDx').onchange = function () { st().dx = this.value; feed(true); upd(); };
  }
  function render() {
    var sec = document.getElementById('sec-history'); if (!sec) return;
    var old = document.getElementById('p9Hyper'), w = document.createElement('div'); w.innerHTML = cardHTML(); var c = w.firstChild;
    if (old) old.replaceWith(c); else { var rf = sec.querySelector('.p1rf-card'); if (rf && rf.nextSibling) sec.insertBefore(c, rf.nextSibling); else sec.appendChild(c); }
    bind(c); upd();
  }
  function setQ5(arr) { st().q5 = [0, 1, 2, 3, 4].map(function (i) { var v = (arr || [])[i]; return v === 'yes' || v === 'no' || v === 'unknown' ? v : null; }); render(); return feed(true); }
  function hook() {
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p9hm) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (APP.hypermobility) { d.hypermobility = JSON.parse(JSON.stringify(APP.hypermobility)); d.hypermobility.result = results(); } } catch (e) {} return d; }; window.gatherAllData._p9hm = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p9hm) { var r = window.restoreData; window.restoreData = function (d) { var x = r.apply(this, arguments); try { APP.hypermobility = d && d.hypermobility ? JSON.parse(JSON.stringify(d.hypermobility)) : null; delete (APP.hypermobility || {}).result; render(); } catch (e) {} return x; }; window.restoreData._p9hm = 1; }
    render();
  }
  window.addEventListener('load', function () { setTimeout(hook, 800); });
  window.P1Hyper = { BEIGHTON: BEIGHTON, Q5: Q5, DX: DX, SRC: SRC, results: results, summary: summary, render: render, feed: feed, setQ5: setQ5, cutoff: cutoff, state: st };
})();
