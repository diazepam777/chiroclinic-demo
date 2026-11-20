/* P1 item 3 — Outcome tracking (2026-10-15; v484 2026-10-17: sourced interpretation bands + change thresholds, docs/P1_ITEM3_OUTCOMES_SIGNOFF_v4.md)
 * Pain 0–10 every visit + region questionnaires (NDI, ODI; QuickDASH/LEFS held for licensing), stored per visit in gatherAllData().outcomes,
 * trended on the patient timeline (SVG), actual vs EXPECTED (owner-entered table; none entered yet), findings per visit, anonymised CSV.
 * v2: questionnaires HELD BACK behind CC_QUESTIONNAIRES_ENABLED (default false): no UI, chart or CSV output.
 * LICENSING: no questionnaire item text is reproduced (see docs/P1_ITEM3_OUTCOMES_SIGNOFF.md). Items read
 * "Item N — item text to be inserted under licence". Only numeric response values are shown.
 * SCORING: only publicly documented scoring opened during the build; anything not verified is not computed.
 */
(function () {
  'use strict';
  var LIC = 'item text to be inserted under licence';
  // Scoring as verified (sources in the sign-off sheet). lowerBetter drives better/worse direction.
  // Published item text (NDI: WSIB copy of Vernon & Mior 1991; ODI v2.1a: British Spine Registry copy, (c) J Fairbank). Option index = score 0-5.
  var NDI_TEXT = [["Pain Intensity", ["I have no pain at the moment", "The pain is very mild at the moment", "The pain is moderate at the moment", "The pain is fairly severe at the moment", "The pain is very severe at the moment", "The pain is the worst imaginable at the moment"]], ["Personal Care (Washing, Dressing, etc.)", ["I can look after myself normally without causing extra pain", "I can look after myself normally but it causes extra pain", "It is painful to look after myself and I am slow and careful", "I need some help but can manage most of my personal care", "I need help every day in most aspects of self care", "I do not get dressed, I wash with difficulty and stay in bed"]], ["Lifting", ["I can lift heavy weights without extra pain", "I can lift heavy weights but it gives extra pain", "Pain prevents me lifting heavy weights off the floor, but I can manage if they are conveniently placed, for example on a table", "Pain prevents me from lifting heavy weights but I can manage light to medium weights if they are conveniently positioned", "I can only lift very light weights", "I cannot lift or carry anything"]], ["Reading", ["I can read as much as I want to with no pain in my neck", "I can read as much as I want to with slight pain in my neck", "I can read as much as I want with moderate pain in my neck", "I can’t read as much as I want because of moderate pain in my neck", "I can hardly read at all because of severe pain in my neck", "I cannot read at all"]], ["Headaches", ["I have no headaches at all", "I have slight headaches, which come infrequently", "I have moderate headaches, which come infrequently", "I have moderate headaches, which come frequently", "I have severe headaches, which come frequently", "I have headaches almost all the time"]], ["Concentration", ["I can concentrate fully when I want to with no difficulty", "I can concentrate fully when I want to with slight difficulty", "I have a fair degree of difficulty in concentrating when I want to", "I have a lot of difficulty in concentrating when I want to", "I have a great deal of difficulty in concentrating when I want to", "I cannot concentrate at all"]], ["Work", ["I can do as much work as I want to", "I can only do my usual work, but no more", "I can do most of my usual work, but no more", "I cannot do my usual work", "I can hardly do any work at all", "I can’t do any work at all"]], ["Driving", ["I can drive my car without any neck pain", "I can drive my car as long as I want with slight pain in my neck", "I can drive my car as long as I want with moderate pain in my neck", "I can’t drive my car as long as I want because of moderate pain in my neck", "I can hardly drive at all because of severe pain in my neck", "I can’t drive my car at all"]], ["Sleeping", ["I have no trouble sleeping", "My sleep is slightly disturbed (less than 1 hr sleepless)", "My sleep is mildly disturbed (1-2 hrs sleepless)", "My sleep is moderately disturbed (2-3 hrs sleepless)", "My sleep is greatly disturbed (3-5 hrs sleepless)", "My sleep is completely disturbed (5-7 hrs sleepless)"]], ["Recreation", ["I am able to engage in all my recreation activities with no neck pain at all", "I am able to engage in all my recreation activities, with some pain in my neck", "I am able to engage in most, but not all of my usual recreation activities because of pain in my neck", "I am able to engage in a few of my usual recreation activities because of pain in my neck", "I can hardly do any recreation activities because of pain in my neck", "I can’t do any recreation activities at all"]]];
  var ODI_TEXT = [["Pain Intensity", ["I have no pain at the moment", "The pain is very mild at the moment", "The pain is moderate at the moment", "The pain is fairly severe at the moment", "The pain is very severe at the moment", "The pain is the worst imaginable at the moment"]], ["Personal care (washing, dressing etc)", ["I can look after myself normally without causing extra pain", "I can look after myself normally but it is very painful", "It is painful to look after myself and I am slow and careful", "I need some help but manage most of my personal care", "I need help every day in most aspects of self-care", "I do not get dressed, wash with difficulty and stay in bed"]], ["Lifting", ["I can lift heavy weights without extra pain", "I can lift heavy weights but it gives extra pain", "Pain prevents me from lifting heavy weights off the floor but I can manage if they are conveniently positioned, eg on a table", "Pain prevents me from lifting heavy weights off the floor but I can manage light to medium weights if they are conveniently positioned", "I can lift only very light weights", "I cannot lift or carry anything at all"]], ["Walking", ["Pain does not prevent me walking any distance", "Pain prevents me walking more than one mile", "Pain prevents me walking more than a quarter of a mile", "Pain prevents me walking more than 100 yards", "I can only walk using a stick or crutches", "I am in bed most of the time and have to crawl to the toilet"]], ["Sitting", ["I can sit in any chair as long as I like", "I can sit in my favourite chair as long as I like", "Pain prevents me from sitting more than 1 hour", "Pain prevents me from sitting for more than half an hour", "Pain prevents me from sitting for more than 10 minutes", "Pain prevents me from sitting at all"]], ["Standing", ["I can stand as long as I want without extra pain", "I can stand as long as I want but it gives me extra pain", "Pain prevents me from standing for more than 1 hour", "Pain prevents me from standing for more than half an hour", "Pain prevents me from standing for more than 10 minutes", "Pain prevents me from standing at all"]], ["Sleeping", ["My sleep is never disturbed by pain", "My sleep is occasionally disturbed by pain", "Because of pain I have less than 6 hours of sleep", "Because of pain I have less than 4 hours of sleep", "Because of pain I have less than 2 hours of sleep", "Pain prevents me from sleeping at all"]], ["Sex life (if applicable)", ["My sex life is normal and causes no extra pain", "My sex life is normal but causes some extra pain", "My sex life is nearly normal but is very painful", "My sex life is severely restricted by pain", "My sex life is nearly absent because of pain", "Pain prevents any sex life at all"]], ["Social life", ["My social life is normal and causes me no extra pain", "My social life is normal but increases the degree of pain", "Pain has no significant effect on my social life apart from limiting my more energetic interests eg sport etc", "Pain has restricted my social life and I do not go out as often", "Pain has restricted my social life to my home", "I have no social life because of pain"]], ["Travelling", ["I can travel anywhere without pain", "I can travel anywhere but it gives extra pain", "Pain is bad but I manage journeys over two hours", "Pain restricts me to journeys of less than one hour", "Pain restricts me to short necessary journeys under 30 minutes", "Pain prevents me from travelling except to receive treatment"]]];
  var Q = {
    ndi: { name: 'NDI (neck)', items: 10, min: 0, max: 5, unit: '%', lowerBetter: true, regions: ['cs'], text: NDI_TEXT, enabled: true,
      // sralab NDI: 10 items 0-5, total 0-50, may be doubled to 0-100%. Missing-item rule NOT verified -> require all.
      // WSIB NDI form: sum/50 x 100; if one section missed or N/A, sum/45 x 100. More than one missing: not documented -> not scored.
      score: function (a) { var n = ans(a); if (n.length < 9) return null; return round1(sum(n) / (5 * n.length) * 100); },
      rule: 'Score = sum ÷ (5 × answered) × 100. One section may be missed (÷45); more than one missing is not scored.' },
    odi: { name: 'Oswestry (lumbar)', items: 10, min: 0, max: 5, unit: '%', lowerBetter: true, regions: ['ls', 'pelvis'], text: ODI_TEXT, enabled: true,
      // Mapi/eprovide ODI: 10 sections 0-5; max 50 doubled; unanswered section reduces denominator by 5.
      // v3: practice minimum 9 of 10 sections (Theunis). Source (ePROVIDE) gives the denominator rule but sets no minimum.
      score: function (a) { var n = ans(a); if (n.length < 9) return null; return round1(sum(n) / (5 * n.length) * 100); },
      rule: 'At least 9 of 10 sections required. Score = sum ÷ (5 × answered sections) × 100.' },
    qdash: { name: 'QuickDASH (upper limb)', items: 11, min: 1, max: 5, unit: '/100', lowerBetter: true, regions: ['shoulder', 'elbow', 'wrist'], enabled: false,
      // IWH QuickDASH: ((sum/n) - 1) x 25; no score if more than 1 item missing.
      score: function (a) { var n = ans(a); if (n.length < 10) return null; return round1((sum(n) / n.length - 1) * 25); },
      rule: '((sum ÷ n) − 1) × 25; not calculated if more than 1 of 11 items is missing.' },
    lefs: { name: 'LEFS (lower limb)', items: 20, min: 0, max: 4, unit: '/80', lowerBetter: false, regions: ['hip', 'knee', 'ankle'], enabled: false,
      // sralab / APTA LEFS: 20 items 0-4, total 0-80, higher = better. Missing-item rule NOT verified -> require all.
      score: function (a) { var n = ans(a); if (n.length < 20) return null; return sum(n); },
      rule: 'All 20 items required (missing-item rule not verified). Score = sum, 0–80 (higher = better).' }
  };
  // QuickDASH + LEFS HELD BACK (no licences) behind this off-by-default flag; scoring kept but inactive. NDI + ODI are on (Theunis, own clinical practice).
  var CC_QUESTIONNAIRES_ENABLED = window.CC_QUESTIONNAIRES_ENABLED === true;
  function QK() { return Object.keys(Q).filter(function (k) { return Q[k].enabled || CC_QUESTIONNAIRES_ENABLED; }); }
  window.P1_QKEYS = function () { return QK(); };
  var VAS = { name: 'VAS pain', unit: '/10', lowerBetter: true };
  // ---------- v484: sourced interpretation (bands) and change thresholds. Shown as guidance; never used to block anything. ----------
  var OSRC = {
    OSTELO: { name: 'Ostelo et al. 2008, Spine 33:90 (MIC consensus, low back pain)', url: 'https://europepmc.org/article/MED/18165753' },
    FARRAR: { name: 'Farrar et al. 2001, Pain 94:149 (11-point NRS, chronic pain)', url: 'https://europepmc.org/article/MED/11690728' },
    SRA_NPRS: { name: 'Shirley Ryan AbilityLab: Numeric Pain Rating Scale', url: 'https://www.sralab.org/rehabilitation-measures/numeric-pain-rating-scale' },
    VERNON08: { name: 'Vernon 2008, J Manipulative Physiol Ther 31:491 (NDI state of the art)', url: 'https://chiro.org/Graphics_Box_LINKS/Neck_Disability_Index_2008.pdf' },
    WSIB: { name: 'WSIB NDI form (Vernon & Mior 1991)', url: 'https://www.wsib.ca/sites/default/files/2023-03/ndi.pdf' },
    SRA_NDI: { name: 'Shirley Ryan AbilityLab: Neck Disability Index', url: 'https://www.sralab.org/rehabilitation-measures/neck-disability-index' },
    MACDERMID: { name: 'MacDermid et al. 2009, JOSPT 39:400 (NDI systematic review)', url: 'https://www.jospt.org/doi/full/10.2519/jospt.2009.2930' },
    FAIRBANK: { name: 'Fairbank & Pynsent 2000, Spine 25:2940 (as reproduced by Oregon/NW Pain Guidance)', url: 'https://northwestpainguidance.org/wp-content/uploads/2016/05/Oswestry-Low-Back-Pain-Disability-Questionnaire.pdf' },
    SRA_ODI: { name: 'Shirley Ryan AbilityLab: Oswestry Disability Index', url: 'https://www.sralab.org/rehabilitation-measures/oswestry-disability-index' },
    EPROVIDE: { name: 'ePROVIDE (Mapi): ODI scoring', url: 'https://eprovide.mapi-trust.org/odi-oswestry-disability-index/' } };
  var MINFO = {
    vas: { scale: 'Pain 0–10 (11-point numeric rating, 0 = no pain, 10 = worst imaginable). Stored under "vas" for compatibility with earlier visits.',
      bands: [[0, 0, 'no pain'], [1, 3, 'mild'], [4, 6, 'moderate'], [7, 10, 'severe']], bandSrc: ['SRA_NPRS'], bandNote: 'Cut-offs reported on the SRA page (worst pain: 1–3 mild, 4–6 moderate, 7–10 severe) come from spinal-cord-injury studies, not spinal pain — a guide only.',
      mic: { points: 2, pct: 30 }, mdc: 2, micSrc: ['OSTELO', 'FARRAR', 'SRA_NPRS'], micNote: 'MIC 2 points or 30% (Ostelo 2008 consensus for LBP; Farrar 2001 chronic pain). MDC 2 points (Childs 2005 LBP, via SRA).' },
    ndi: { scale: 'NDI % (raw 0–50 × 2). Bands use the raw score (Vernon & Mior 1991).',
      bands: [[0, 8, 'no disability'], [10, 28, 'mild'], [30, 48, 'moderate'], [50, 68, 'severe'], [70, 100, 'complete']], bandRaw: [[0, 4], [5, 14], [15, 24], [25, 34], [35, 50]], bandSrc: ['VERNON08', 'MACDERMID'],
      bandNote: 'Bands from Vernon & Mior 1991 (0–4 none, 5–14 mild, 15–24 moderate, 25–34 severe, 35+ complete); MacDermid 2009: not formally derived or validated — a guide only.',
      mic: { points: 14 }, mdc: 10, micSrc: ['MACDERMID', 'WSIB', 'VERNON08', 'SRA_NDI'], micNote: 'Clinically important: 7/50 = 14 %-points (MacDermid 2009 key point 5: "The CID is approximately 7 points"; same value as the item 4 HEP rule). Beyond measurement error: 5/50 = 10 %-points (MacDermid 2009 key point 4 "The MDC is accepted as 5 points"; WSIB form "Minimum Detectable Change (90% confidence): 5 points or 10 %points"). Reported CID range 5–19/50; radiculopathy MDC up to 10/50.' },
    odi: { scale: 'ODI % (0–100).',
      bands: [[0, 20, 'minimal disability'], [21, 40, 'moderate disability'], [41, 60, 'severe disability'], [61, 80, 'crippled'], [81, 100, 'bed-bound or exaggerating symptoms']], bandSrc: ['FAIRBANK'],
      bandNote: 'Category descriptors from Fairbank & Pynsent 2000 (full paper not retrievable here; quoted from Oregon/NW Pain Guidance copy citing it).',
      mic: { points: 10, pct: 30 }, mdc: 10, micSrc: ['OSTELO', 'SRA_ODI'], micNote: 'MIC 10 points or 30% improvement from baseline (Ostelo 2008). MDC about 10–13 points in low back pain (Copay 2008 11.7–12.8; Johnsen 2013 11.7; Miekisiak 2013 MDC95 10; via SRA).' } };
  function band(m, score) { var I = MINFO[m]; if (!I || score == null || isNaN(score)) return null; var v = +score;
    if (m === 'ndi') { var raw = v / 2; for (var i = 0; i < I.bandRaw.length; i++) if (raw <= I.bandRaw[i][1] + 0.4999) return I.bands[i][2]; return I.bands[I.bands.length - 1][2]; }
    for (var j = 0; j < I.bands.length; j++) if (v <= I.bands[j][1] + 0.4999) return I.bands[j][2]; return I.bands[I.bands.length - 1][2]; }
  function change(m, base, last) { var I = MINFO[m]; if (!I || base == null || last == null) return null; var d = round1(last - base), pct = base > 0 ? round1((base - last) / base * 100) : null;
    var imp = -d >= I.mic.points || (I.mic.pct && pct != null && pct >= I.mic.pct), mdc = I.mdc || I.mic.points;
    var verdict = imp ? 'clinically important improvement' : -d >= mdc ? 'improvement beyond measurement error, below the clinically important threshold' : d >= mdc ? 'worse beyond measurement error' : 'change within measurement error';
    return { delta: d, pctImprovement: pct, verdict: verdict }; }
  function srcLinks(keys) { return keys.map(function (k) { return '<a href="' + OSRC[k].url + '" target="_blank" rel="noopener">' + esc(OSRC[k].name) + '</a>'; }).join(' · '); }
  function infoHTML(m) { var I = MINFO[m]; return '<details class="p1o-info" data-measure="' + m + '" style="font-size:11px;color:#444;margin-top:2px"><summary>Interpretation and sources</summary>' + esc(I.scale) + '<br><b>Bands:</b> ' + I.bands.map(function (b) { return b[0] + '–' + b[1] + ' ' + b[2]; }).join(' · ') + ' — ' + esc(I.bandNote) + ' ' + srcLinks(I.bandSrc) + '<br><b>Change threshold:</b> ' + esc(I.micNote) + ' ' + srcLinks(I.micSrc) + '</details>'; }
  var STATUS = 'Scoring, bands and change thresholds sourced (links under each measure); bands are a guide only';
  /* EXPECTED reference curves — owner-entered (none shipped; no numbers are invented). Entered via localStorage below.
   * Template (one row per measure/condition/phase):
   *   { measure: 'vas'|'ndi'|'odi'|'qdash'|'lefs', icd10: 'M54.56' (or condition text), phase: 'acute'|'early_subacute'|'subacute'|'chronic'|'flare',
   *     points: [ { day: 0, value: <number> }, { day: 14, value: <number> }, ... ],  tolerance: <number, same units>,  source: '<citation>' }
   * Optional override: localStorage 'chiroclinic_expected_outcomes' = JSON array of rows in this format. */
  var EXPECTED = [];
  var EXPECTED_TEMPLATE = { measure: '', icd10: '', phase: '', points: [{ day: 0, value: null }], tolerance: null, source: '' };

  function ans(a) { return (a || []).filter(function (x) { return x !== null && x !== '' && x !== undefined && !isNaN(+x); }).map(Number); }
  function sum(n) { return n.reduce(function (s, x) { return s + x; }, 0); }
  function round1(x) { return Math.round(x * 10) / 10; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  var state = { vas: null, q: {} }; // q[key] = answers array
  function curRegion() { try { return APP.currentRegion || (APP.activeRegions || [])[0] || ''; } catch (e) { return ''; } }
  function qForRegion(r) { return QK().filter(function (k) { return Q[k].regions.indexOf(r) >= 0; }); }

  function findings(examData) {
    var rom = 0, pos = 0, tested = 0;
    Object.keys(examData || {}).forEach(function (r) { var D = examData[r] || {};
      Object.keys(D).forEach(function (k) { var v = D[k];
        if (/^romA_deg_/.test(k) && v !== '' && v != null) rom++;
        if (/^ort_[RL]_/.test(k) && v && v !== '—' && v !== 'N/A') { tested++; if (v === '+' || v === 'Positive') pos++; }
      }); });
    return { romMeasured: rom, orthoTested: tested, positiveTests: pos };
  }
  function snapshot() {
    var o = { vas: state.vas, scores: {}, answers: {}, region: curRegion() };
    Object.keys(state.q).filter(function (k) { return QK().indexOf(k) >= 0; }).forEach(function (k) { o.answers[k] = state.q[k].slice(); o.scores[k] = Q[k].score(state.q[k]); });
    try { o.findings = findings(APP.examData); } catch (e) { o.findings = null; }
    return o;
  }

  // ---------- UI: outcomes card at top of History ----------
  function qHTML(k) {
    var d = Q[k], a = state.q[k] || [], h = '<div class="p1o-q" data-q="' + k + '" style="margin:6px 0;padding:6px;border:1px dashed #bbb;border-radius:6px">' +
      '<b>' + esc(d.name) + '</b> <span style="font-size:11px;color:#a33">items: ' + LIC + '</span><br><span style="font-size:11px;color:#666">' + esc(d.rule) + '</span><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">';
    if (d.text) { h = h.replace('<span style="font-size:11px;color:#a33">items: ' + LIC + '</span>', ''); h += d.text.map(function (sec, i) { return '<label style="font-size:11px;display:block;width:100%">Section ' + (i + 1) + ': ' + esc(sec[0]) + ' <select data-qi="' + i + '"><option value="">—</option>' + sec[1].map(function (t, v) { return '<option value="' + v + '"' + (String(a[i]) === String(v) ? ' selected' : '') + '>' + v + ' — ' + esc(t) + '</option>'; }).join('') + '</select></label>'; }).join(''); }
    else for (var i = 0; i < d.items; i++) {
      h += '<label style="font-size:11px">Item ' + (i + 1) + ' — ' + LIC + ' <select data-qi="' + i + '"><option value="">—</option>';
      for (var v = d.min; v <= d.max; v++) h += '<option' + (String(a[i]) === String(v) ? ' selected' : '') + '>' + v + '</option>';
      h += '</select></label>';
    }
    var sc = d.score(a);
    return h + '</div><div>Score: <b class="p1o-score">' + scoreText(k, sc) + '</b></div>' + (MINFO[k] ? infoHTML(k) : '') + '</div>';
  }
  function scoreText(k, sc) { if (sc == null) return 'incomplete — not scored'; var b = band(k, sc); return sc + ' ' + Q[k].unit + (b ? ' — ' + b : ''); }
  function render() {
    var sec = $('sec-history'); if (!sec) return;
    var card = $('p1Outcomes');
    if (!card) { card = document.createElement('div'); card.id = 'p1Outcomes'; card.className = 'card'; card.style.cssText = 'margin:8px 0;padding:10px;border:2px solid #2B5F5C;border-radius:8px';
      var rf = sec.querySelector('.p1rf-card'); if (rf && rf.parentNode) rf.parentNode.insertBefore(card, rf.nextSibling); else sec.insertBefore(card, sec.firstChild); }
    var reg = curRegion(), sugg = qForRegion(reg);
    var keys = Object.keys(state.q).filter(function (k) { return QK().indexOf(k) >= 0; }); sugg.forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    card.innerHTML = '<div style="font-weight:700">Outcome measures (this visit) <span class="p1o-status" style="font-size:11px;color:#2B5F5C;font-weight:400">' + esc(STATUS) + '</span></div>' +
      '<label>VAS pain now (0 = none, 10 = worst imaginable): <input type="range" id="p1oVas" min="0" max="10" step="1" value="' + (state.vas == null ? 0 : state.vas) + '"> <b id="p1oVasVal">' + (state.vas == null ? 'not recorded' : state.vas + '/10') + '</b></label> ' +
      '<button type="button" id="p1oVasClr" class="ehr-mini-btn">clear</button> <span id="p1oVasBand" style="font-size:12px">' + (state.vas == null ? '' : '(' + band('vas', state.vas) + ')') + '</span>' + infoHTML('vas') +
      (QK().length ? '<div style="margin-top:4px;font-size:12px">Add questionnaire: ' + QK().map(function (k) { return '<button type="button" class="ehr-mini-btn" data-addq="' + k + '">' + esc(Q[k].name) + (sugg.indexOf(k) >= 0 ? ' ★' : '') + '</button>'; }).join(' ') + '</div>' : '') +
      keys.map(qHTML).join('');
    var r = $('p1oVas'); r.oninput = r.onchange = function () { state.vas = +this.value; $('p1oVasVal').textContent = state.vas + '/10'; $('p1oVasBand').textContent = '(' + band('vas', state.vas) + ')'; };
    $('p1oVasClr').onclick = function () { state.vas = null; render(); };
    card.querySelectorAll('[data-addq]').forEach(function (b) { b.onclick = function () { if (!state.q[b.dataset.addq]) state.q[b.dataset.addq] = []; render(); }; });
    card.querySelectorAll('.p1o-q').forEach(function (box) { var k = box.dataset.q;
      box.querySelectorAll('select[data-qi]').forEach(function (s) { s.onchange = function () { if (!state.q[k]) state.q[k] = []; state.q[k][+s.dataset.qi] = s.value === '' ? null : +s.value;
        var sc = Q[k].score(state.q[k]); box.querySelector('.p1o-score').textContent = scoreText(k, sc); }; }); });
  }

  // ---------- Episodes / trend ----------
  function loadExpected() { var rows = EXPECTED.slice(); try { var x = JSON.parse(localStorage.getItem('chiroclinic_expected_outcomes') || 'null'); if (Array.isArray(x)) rows = rows.concat(x); } catch (e) {} return rows; }
  function dayDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function visitRegion(v) { return (v.outcomes && v.outcomes.region) || v.currentRegion || ((v.activeRegions || [])[0]) || ''; }
  function visitDx(v, r) { var D = (v.examData && v.examData[r]) || {}; return { icd10: D.icd10 || '', phase: D.phase || '', dx: D.primaryDx || D.formulatedCondition || '' }; }
  function allVisits() { try { var a = window.CCData.all(); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function episodes(visits) {
    var map = {};
    visits.forEach(function (v) { if (!v || !v.outcomes) return; var r = visitRegion(v), key = (v.patientId || '?') + '|' + r; (map[key] = map[key] || []).push(v); });
    return Object.keys(map).map(function (k) { var list = map[k].sort(function (a, b) { return String((a.visit || {}).date).localeCompare(String((b.visit || {}).date)); });
      var base = (list[0].visit || {}).date; return { key: k, patientId: list[0].patientId, region: visitRegion(list[0]), baseline: base, visits: list }; });
  }
  function expectedFor(measure, icd10, phase) { return loadExpected().filter(function (r) { return r.measure === measure && r.icd10 === icd10 && r.phase === phase && Array.isArray(r.points) && r.points.length && r.points.every(function (p) { return typeof p.value === 'number' && typeof p.day === 'number'; }); })[0] || null; }
  function interp(points, day) { var p = points.slice().sort(function (a, b) { return a.day - b.day; }); if (day <= p[0].day) return p[0].value; for (var i = 1; i < p.length; i++) if (day <= p[i].day) { var a = p[i - 1], b = p[i]; return a.value + (b.value - a.value) * (day - a.day) / (b.day - a.day); } return p[p.length - 1].value; }
  function compare(measure, day, actual, exp) {
    if (!exp || actual == null) return null; if (typeof exp.tolerance !== 'number') return 'tolerance not entered';
    var e = interp(exp.points, day), lb = measure === 'lefs' ? false : true, d = actual - e;
    if (Math.abs(d) <= exp.tolerance) return 'as expected'; return (lb ? d < 0 : d > 0) ? 'better' : 'worse';
  }
  function series(ep, measure) {
    return ep.visits.map(function (v) { var o = v.outcomes || {}; var val = measure === 'vas' ? o.vas : (o.scores || {})[measure];
      return { day: dayDiff(ep.baseline, (v.visit || {}).date), value: val == null ? null : +val, date: (v.visit || {}).date, findings: o.findings || null }; }).filter(function (p) { return p.value != null && !isNaN(p.day); });
  }
  function svg(measure, pts, exp) {
    var W = 300, H = 110, P = 24, maxY = measure === 'vas' ? 10 : measure === 'lefs' ? 80 : 100;
    var maxX = Math.max(1, pts.length ? pts[pts.length - 1].day : 1, exp ? exp.points[exp.points.length - 1].day : 1);
    var X = function (d) { return P + (W - 2 * P) * d / maxX; }, Y = function (v) { return H - P + 4 - (H - P - 8) * v / maxY; };
    var path = function (ps, attr) { return '<polyline fill="none" ' + attr + ' points="' + ps.map(function (p) { return X(p.day).toFixed(1) + ',' + Y(p.value).toFixed(1); }).join(' ') + '"/>'; };
    var s = '<svg class="p1o-svg" data-measure="' + measure + '" width="' + W + '" height="' + H + '" style="background:#fff;border:1px solid #ddd"><text x="4" y="12" font-size="10">' + maxY + '</text><text x="4" y="' + (H - P + 4) + '" font-size="10">0</text><text x="' + (W - P) + '" y="' + (H - 4) + '" font-size="9">day ' + maxX + '</text>';
    if (exp) s += path(exp.points, 'class="p1o-expected" stroke="#999" stroke-dasharray="4 3" stroke-width="2"');
    s += path(pts, 'class="p1o-actual" stroke="#2B5F5C" stroke-width="2"') + pts.map(function (p) { return '<circle cx="' + X(p.day).toFixed(1) + '" cy="' + Y(p.value).toFixed(1) + '" r="3" fill="#2B5F5C"><title>' + p.date + ': ' + p.value + '</title></circle>'; }).join('');
    return s + '</svg>';
  }
  function renderTrend() {
    var tl = $('ehrVisitTimeline'); if (!tl) return;
    var box = $('p1OutcomeTrend'); if (!box) { box = document.createElement('div'); box.id = 'p1OutcomeTrend'; box.style.cssText = 'margin-top:8px'; tl.parentNode.insertBefore(box, tl.nextSibling); }
    var pid = (window.EHR && EHR.currentPatientId) || null;
    var eps = episodes((pid && window.CCData.forPatientEpisodes(pid)) || allVisits()).filter(function (e) { return !pid || e.patientId === pid; }); // P1 v9: this patient's candidates only
    if (!eps.length) { box.innerHTML = '<div style="font-size:12px;color:#666">Outcome trend: no saved outcome scores yet.</div>' + exportBtn(); bindExport(box); return; }
    box.innerHTML = eps.map(function (ep) {
      var last = ep.visits[ep.visits.length - 1], dx = visitDx(last, ep.region);
      var ms = ['vas'].concat(QK()).filter(function (m) { return series(ep, m).length; });
      return '<div class="p1o-episode" data-region="' + esc(ep.region) + '" style="border:1px solid #cfd8d7;border-radius:6px;padding:6px;margin:6px 0"><b>Outcome trend — ' + esc(ep.region || 'region?') + '</b> ' +
        '<span style="font-size:11px">' + esc(dx.icd10 || 'no ICD-10') + ' · ' + esc(dx.phase || 'no phase') + ' · baseline ' + esc(ep.baseline) + '</span>' +
        ms.map(function (m) { var pts = series(ep, m), exp = expectedFor(m, dx.icd10, dx.phase), lp = pts[pts.length - 1];
          var cmp = exp ? compare(m, lp.day, lp.value, exp) : null;
          return '<div style="margin-top:4px"><div style="font-size:12px">' + esc(m === 'vas' ? VAS.name : Q[m].name) + ': ' + pts.map(function (p) { return p.value; }).join(' → ') +
            (pts.length > 1 && MINFO[m] ? (function () { var c = change(m, pts[0].value, lp.value); return ' <span class="p1o-chg" data-measure="' + m + '" style="font-size:11px">· change ' + (c.delta > 0 ? '+' : '') + c.delta + (c.pctImprovement != null ? ' (' + (c.pctImprovement >= 0 ? c.pctImprovement + '% better' : (-c.pctImprovement) + '% worse') + ')' : '') + ': ' + esc(c.verdict) + '</span>'; })() : '') +
            ' <span class="p1o-cmp" data-measure="' + m + '" style="font-weight:700">' + (exp ? (cmp ? '· vs expected: ' + cmp : '') : '<span class="p1o-noexp" style="color:#7A4A00">· expected values not yet entered</span>') + '</span></div>' + svg(m, pts, exp) +
            '<div style="font-size:10px;color:#666">— actual' + (exp ? ' · - - expected' : '') + '</div></div>'; }).join('') +
        '<table class="p1o-find" style="font-size:11px;margin-top:4px;border-collapse:collapse"><tr><th>Day</th><th>Date</th><th>VAS</th><th>ROM measured</th><th>Ortho tested</th><th>Positive tests</th></tr>' +
        ep.visits.map(function (v) { var o = v.outcomes || {}, f = o.findings || {}; return '<tr><td>' + dayDiff(ep.baseline, (v.visit || {}).date) + '</td><td>' + esc((v.visit || {}).date) + '</td><td>' + (o.vas == null ? '—' : o.vas) + '</td><td>' + (f.romMeasured == null ? '—' : f.romMeasured) + '</td><td>' + (f.orthoTested == null ? '—' : f.orthoTested) + '</td><td>' + (f.positiveTests == null ? '—' : f.positiveTests) + '</td></tr>'; }).join('') + '</table></div>';
    }).join('') + exportBtn();
    bindExport(box);
  }
  function exportBtn() { return '<button type="button" id="p1oCsv" class="ehr-mini-btn">Export anonymised outcomes CSV (local file)</button>'; }
  function bindExport(box) { var b = box.querySelector('#p1oCsv'); if (b) b.onclick = function () { downloadCsv(); }; }

  // ---------- Anonymised CSV ----------
  function ageBand(dob, at) { if (!dob || !at) return ''; var b = new Date(dob), t = new Date(at); if (isNaN(b) || isNaN(t)) return ''; var a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; if (a < 0) return ''; var lo = Math.floor(a / 10) * 10; return lo + '-' + (lo + 9); }
  function csvCell(x) { x = x == null ? '' : String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  var Q_COLS = ['quickdash', 'lefs'];
  var CSV_COLS = ['episode', 'visit_no', 'age_band', 'sex', 'region', 'icd10', 'phase', 'day_from_baseline', 'vas', 'ndi_pct', 'odi_pct'].concat(CC_QUESTIONNAIRES_ENABLED ? Q_COLS : []).concat(['rom_measured', 'ortho_tested', 'positive_tests', 'red_flags_positive']);
  function buildCsv(visits) {
    var rows = [CSV_COLS.join(',')];
    episodes(visits || allVisits()).forEach(function (ep, i) {
      var p = (ep.visits[0].patient) || {}, band = ageBand(p.dob, ep.baseline), sex = p.gender || '';
      ep.visits.forEach(function (v, j) { var o = v.outcomes || {}, s = o.scores || {}, f = o.findings || {}, dx = visitDx(v, ep.region);
        rows.push([ 'E' + (i + 1), j + 1, band, sex, ep.region, dx.icd10, dx.phase, dayDiff(ep.baseline, (v.visit || {}).date), o.vas, s.ndi, s.odi].concat(CC_QUESTIONNAIRES_ENABLED ? [s.qdash, s.lefs] : []).concat([f.romMeasured, f.orthoTested, f.positiveTests, (v.redFlagPositive || []).length ]).map(csvCell).join(',')); });
    });
    return rows.join('\n') + '\n';
  }
  function downloadCsv() {
    var csv = buildCsv(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'chiroclinic_outcomes_anonymised_' + localISODate() + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); return csv;
  }

  // ---------- hooks ----------
  function hookAll() {
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p1o) {
      var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { d.outcomes = snapshot(); } catch (e) {} return d; }; window.gatherAllData._p1o = 1;
    }
    if (typeof window.restoreData === 'function' && !window.restoreData._p1o) {
      var rs = window.restoreData; window.restoreData = function (d) { var r = rs.apply(this, arguments); try { var o = (d && d.outcomes) || {}; state.vas = o.vas == null ? null : o.vas; state.q = {}; Object.keys(o.answers || {}).forEach(function (k) { if (Q[k] && QK().indexOf(k) >= 0) state.q[k] = o.answers[k].slice(); }); render(); setTimeout(renderTrend, 50); } catch (e) {} return r; }; window.restoreData._p1o = 1;
    }
    if (typeof window.renderExam === 'function' && !window.renderExam._p1o) {
      var re = window.renderExam; window.renderExam = function () { var r = re.apply(this, arguments); try { render(); } catch (e) {} return r; }; window.renderExam._p1o = 1;
    }
    var tl = $('ehrVisitTimeline');
    if (tl && !tl._p1o) { tl._p1o = 1; new MutationObserver(function () { clearTimeout(tl._p1oT); tl._p1oT = setTimeout(renderTrend, 30); }).observe(tl, { childList: true }); }
  }
  function init() { if (window.P1_INTAKE_KIOSK) return; /* P1 item 9: patient kiosk page uses only Q (published NDI/ODI text + scoring); never reads charts */ hookAll(); render(); renderTrend(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); }); else setTimeout(init, 0);
  window.addEventListener('load', function () { setTimeout(init, 300); });

  window.P1Outcomes = { CC_QUESTIONNAIRES_ENABLED: CC_QUESTIONNAIRES_ENABLED, Q: Q, EXPECTED: EXPECTED, EXPECTED_TEMPLATE: EXPECTED_TEMPLATE, state: state, snapshot: snapshot, findings: findings, episodes: episodes, expectedFor: expectedFor,
    compare: compare, MINFO: MINFO, OSRC: OSRC, band: band, change: change, STATUS: STATUS, buildCsv: buildCsv, downloadCsv: downloadCsv, CSV_COLS: CSV_COLS, ageBand: ageBand, render: render, renderTrend: renderTrend, LIC: LIC };
})();
