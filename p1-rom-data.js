/* P1 item 10 — ROM data layer: sided keys, sourced normal values, readers. Loaded in <head> so every reader can use it.
 * Keys: spine regions (cs, ts, ls) keep romA_deg_<i> etc. Limb regions (pelvis, hip, shoulder, elbow, wrist, knee, ankle)
 * use romA_deg_<i>_R / _L (and pain, rest, grade; romP_deg/pain/ef/grade). An unsuffixed key in a limb region is a
 * pre-item-10 value: it is read as the side recorded on the region (D.side Right/Left) or "side not recorded".
 * Normal values: docs/P1_ITEM10_ROM_RULES.md. */
(function (g) {
  'use strict';
  var SIDED = { pelvis: 1, hip: 1, shoulder: 1, elbow: 1, wrist: 1, knee: 1, ankle: 1 };
  var FIELDS_A = ['deg', 'pain', 'pscore', 'rest', 'grade'], FIELDS_P = ['deg', 'pain', 'pscore', 'ef', 'grade']; // v15: pscore = pain score 0-10 (optional)
  var GRADES = ['Full', 'Mild limitation', 'Moderate limitation', 'Severe limitation'];
  var SRC = {
    soucie: { short: 'CDC/Soucie 2011', tag: 'CDC', url: 'https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index.html', doi: 'https://doi.org/10.1111/j.1365-2516.2010.02399.x' },
    aaos: { short: 'AAOS 1965', tag: 'AAOS', url: 'https://goniometer.io/rom-chart.pdf', doi: 'https://doi.org/10.1302/0301-620x.48b4.857' },
    // v13: cervical and hip use the AAOS compilation in Jones & Bartlett Tables 3-13/3-14 (agrees with goniometer.io); hip values are fixed (no CDC substitution)
    aaos_cs: { short: 'AAOS', tag: 'AAOS', url: 'https://samples.jbpub.com/9781284105568/9781284105568_PT03.pdf' },
    aaos_hip: { short: 'AAOS', tag: 'AAOS', url: 'https://samples.jbpub.com/9781284105568/9781284105568_PT03.pdf' },
    ama5: { short: 'AMA Guides 5th ed.', tag: 'AMA 5th', url: 'https://backtochiropractic.net/PDF/Basic%20AMA%20Impairment%20Ratings%20for%20Chiropractors%20Notes%20LMS.pdf' },
    guide: { short: 'clinic guide (Theunis), no published source', tag: 'clinic guide', url: '' },
    none: { short: 'no reference value', tag: 'no reference', url: '' },
    clinic: { short: 'clinic default (unsourced)', tag: 'clinic default', url: '' } };
  // v15: pain at the movement is recorded as where it is felt. Older visits stored Yes/No; those are still read and shown.
  var PAIN = ['None', 'End of range', 'Through range'];
  var LOSS_NOTE = 'Loss % = (normal − measured) ÷ normal, using the normal value shown for each movement. Movements with no normal value, or a normal of 10° or less, are left out. This is a range-of-motion summary, not an impairment rating.';
  // CDC normal joint ROM study (Soucie et al. 2011, Haemophilia 17:500-507), mean passive ROM by age group and sex.
  var SOUCIE_COLS = ['hipExt', 'hipFlex', 'kneeFlex', 'kneeExt', 'ankleDF', 'anklePF', 'shFlex', 'elbFlex', 'elbExt', 'pron', 'sup'];
  var SOUCIE = {
    '2-8':   { F: [26.2, 140.8, 152.6, 5.4, 24.8, 67.1, 178.6, 152.9, 6.8, 84.6, 93.7], M: [28.3, 131.1, 147.8, 1.6, 22.8, 55.8, 177.8, 151.4, 2.2, 79.6, 86.4] },
    '9-19':  { F: [20.5, 134.9, 142.3, 2.4, 17.3, 57.3, 171.8, 149.7, 6.4, 81.2, 90.0], M: [18.2, 135.2, 142.2, 1.8, 16.3, 52.8, 170.9, 148.3, 5.3, 79.8, 87.8] },
    '20-44': { F: [18.1, 133.8, 141.9, 1.6, 13.8, 62.1, 172.0, 150.0, 4.7, 82.0, 90.6], M: [17.4, 130.4, 137.7, 1.0, 12.7, 54.6, 168.8, 144.6, 0.8, 76.9, 85.0] },
    '45-69': { F: [16.7, 130.8, 137.8, 1.2, 11.6, 56.5, 168.1, 148.3, 3.6, 80.8, 87.2], M: [13.5, 127.2, 132.9, 0.5, 11.9, 49.4, 164.0, 143.5, -0.7, 77.7, 82.4] } };
  // AAOS (1965) average values, as reproduced at goniometer.io (secondary source; see rules doc).
  // v13 normal table (sources: docs/normal_values_sources.md). e = [kind, ...]: 's' CDC column with AAOS fallback, 'a' AAOS 1965, 'x' fixed value with source key, 'n' no reference value.
  var HIPN = { 'Flexion': ['x', 120, 'aaos_hip'], 'Extension': ['x', 30, 'aaos_hip'], 'Abduction': ['x', 45, 'aaos_hip'], 'Adduction': ['x', 30, 'aaos_hip'], 'Internal Rotation': ['a', 45], 'External Rotation': ['a', 45] };
  var NORM = {
    cs: { 'Flexion': ['x', 45, 'aaos_cs'], 'Extension': ['x', 45, 'aaos_cs'], 'Right Rotation': ['x', 60, 'aaos_cs'], 'Left Rotation': ['x', 60, 'aaos_cs'], 'Right Lat Flex': ['x', 45, 'aaos_cs'], 'Left Lat Flex': ['x', 45, 'aaos_cs'] },
    ts: { 'Flexion': ['x', 45, 'guide'], 'Extension': ['x', 20, 'guide'], 'Right Rotation': ['x', 50, 'guide'], 'Left Rotation': ['x', 50, 'guide'], 'Right Lat Flex': ['n'], 'Left Lat Flex': ['n'] },
    ls: { 'Flexion': ['x', 60, 'ama5', 'dual inclinometer method'], 'Extension': ['x', 25, 'ama5', 'dual inclinometer method'], 'Right Rotation': ['x', 30, 'guide'], 'Left Rotation': ['x', 30, 'guide'], 'Right Lat Flex': ['x', 25, 'ama5', 'dual inclinometer method'], 'Left Lat Flex': ['x', 25, 'ama5', 'dual inclinometer method'] },
    pelvis: { 'Hip Flexion': HIPN['Flexion'], 'Hip Extension': HIPN['Extension'], 'Hip Abduction': HIPN['Abduction'], 'Hip Adduction': HIPN['Adduction'], 'Internal Rotation': HIPN['Internal Rotation'], 'External Rotation': HIPN['External Rotation'] },
    hip: HIPN, // v13: hip rows are named 'Flexion'... (index REGIONS); before v13 this table was keyed 'Hip Flexion'... and the hip tab fell back to the REGIONS defaults
    shoulder: { 'Abduction': ['a', 180], 'Adduction': ['a', 40], 'Forward Flexion': ['s', 'shFlex', 180], 'Internal Rotation': ['a', 70], 'External Rotation': ['a', 90], 'Extension': ['a', 60] },
    elbow: { 'Flexion': ['s', 'elbFlex', 150], 'Extension': ['s', 'elbExt', 0], 'Pronation': ['s', 'pron', 80], 'Supination': ['s', 'sup', 80] },
    wrist: { 'Wrist Flexion': ['a', 80], 'Wrist Extension': ['a', 70], 'Radial Deviation': ['a', 20], 'Ulnar Deviation': ['a', 30] },
    knee: { 'Flexion': ['s', 'kneeFlex', 135], 'Extension': ['s', 'kneeExt', 0] },
    ankle: { 'Dorsiflexion': ['s', 'ankleDF', 20], 'Plantarflexion': ['s', 'anklePF', 50], 'Inversion': ['a', 35], 'Eversion': ['a', 15] } };
  function el(id) { return typeof document !== 'undefined' ? document.getElementById(id) : null; }
  function patientCtx() {
    var dob = el('ptDOB') ? el('ptDOB').value : '', gen = el('ptGender') ? el('ptGender').value : '', age = null;
    if (dob) { var d = new Date(dob + 'T00:00:00'), n = new Date(); if (!isNaN(d)) { age = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) age--; } }
    return { age: age, sex: gen === 'Male' ? 'M' : gen === 'Female' ? 'F' : null };
  }
  function band(age) { if (age == null) return null; if (age >= 2 && age <= 8) return '2-8'; if (age >= 9 && age <= 19) return '9-19'; if (age >= 20 && age <= 44) return '20-44'; if (age >= 45 && age <= 69) return '45-69'; return null; }
  function rows(region) { return (typeof REGIONS !== 'undefined' && REGIONS[region] && REGIONS[region].rom) || []; }
  // norm(region, i | name, ctx) -> {deg, src, label, note}
  function norm(region, i, ctx) {
    var R = rows(region), name = typeof i === 'number' ? (R[i] || {}).name : i, e = (NORM[region] || {})[name];
    ctx = ctx || patientCtx();
    if (!e) { var r0 = R.filter(function (x) { return x.name === name; })[0]; return { deg: r0 ? r0.norm : null, src: 'clinic', label: SRC.clinic.short, note: '' }; }
    if (e[0] === 's') { var b = band(ctx.age);
      if (b && ctx.sex) { var v = SOUCIE[b][ctx.sex][SOUCIE_COLS.indexOf(e[1])]; return { deg: v, src: 'soucie', label: SRC.soucie.short + ' (' + (ctx.sex === 'M' ? 'male' : 'female') + ' ' + b + ' y)', note: '' }; }
      return { deg: e[2], src: 'aaos', label: SRC.aaos.short, note: !ctx.sex ? 'sex not recorded: AAOS used' : (ctx.age == null ? 'age not recorded: AAOS used' : 'age outside CDC 2–69 y: AAOS used') }; }
    if (e[0] === 'a') return { deg: e[1], src: 'aaos', label: SRC.aaos.short, note: '' };
    if (e[0] === 'x') return { deg: e[1], src: e[2], label: SRC[e[2]].short, note: e[3] || '' };
    if (e[0] === 'n') return { deg: null, src: 'none', label: SRC.none.short, note: '' };
    return { deg: e[1], src: 'clinic', label: SRC.clinic.short, note: '' };
  }
  function sided(region) { return !!SIDED[region]; }
  function key(mode, field, i, side) { return 'rom' + mode + '_' + field + '_' + i + (side ? '_' + side : ''); }
  function legacySide(D) { return D && D.side === 'Right' ? 'R' : D && D.side === 'Left' ? 'L' : ''; }
  function filled(v) { return v !== '' && v != null && v !== '—'; }
  // One measurement record: {region, i, name, side ('R','L','' spine,'?' legacy unknown), mode, deg, pain, rest, ef, grade}
  function rec(region, D, i, side, mode, legacy) {
    var o = { region: region, i: i, name: (rows(region)[i] || {}).name, side: side, mode: mode, legacy: !!legacy }, any = false;
    (mode === 'A' ? FIELDS_A : FIELDS_P).forEach(function (f) { var v = D[key(mode, f, i, legacy ? '' : (side === '?' ? '' : side))]; if (filled(v)) { o[f] = v; any = true; } });
    return any ? o : null;
  }
  function entries(region, D, mode) {
    var out = [], R = rows(region); D = D || {};
    (mode ? [mode] : ['A', 'P']).forEach(function (m) {
      R.forEach(function (r, i) {
        if (!sided(region)) { var x = rec(region, D, i, '', m); if (x) out.push(x); return; }
        ['R', 'L'].forEach(function (s) { var x = rec(region, D, i, s, m); if (x) out.push(x); });
        var lg = rec(region, D, i, legacySide(D) || '?', m, true); if (lg) out.push(lg);
      });
    });
    return out;
  }
  function sideWord(s) { return s === 'R' ? 'R' : s === 'L' ? 'L' : s === '?' ? '(side not recorded)' : ''; }
  function label(e) { return e.name + (e.side ? ' ' + sideWord(e.side) : ''); }
  // v15: 'End of range' / 'Through range' count as painful; legacy 'Yes' too. 'None' and legacy 'No' are pain-free.
  function isYes(v) { return v === 'Yes' || v === true || v === 'End of range' || v === 'Through range'; }
  function painFree(v) { return v === 'No' || v === 'None'; }
  function text(e, withNorm, ctx) {
    var s = label(e) + (filled(e.deg) ? ' ' + e.deg + '°' : '');
    if (withNorm) { var n = norm(e.region, e.i, ctx); if (n.deg != null) s += ' (norm ' + n.deg + '°)'; }
    var q = [];
    if (e.pain === 'End of range' || e.pain === 'Through range') q.push('painful ' + e.pain.toLowerCase()); else if (isYes(e.pain)) q.push('painful'); else if (painFree(e.pain)) q.push('pain-free');
    if (e.grade && e.grade !== 'Full') q.push(e.grade.toLowerCase()); else if (e.grade === 'Full') q.push('full');
    if (filled(e.pscore)) q.push('pain ' + e.pscore + '/10');
    if (e.mode === 'A' && e.rest === 'Yes') q.push('restricted');
    if (e.mode === 'P' && e.ef) q.push('end feel ' + String(e.ef).toLowerCase());
    return s + (q.length ? ' (' + q.join(', ') + ')' : '');
  }
  // Worst-of-sides view for single-value readers (DDx flags, Wainner): lowest degrees, any pain/restriction.
  function worst(region, D, i, mode) {
    mode = mode || 'A'; var es = entries(region, D, mode).filter(function (e) { return e.i === i; }), o = { deg: NaN, pain: false, rest: false };
    es.forEach(function (e) { var d = parseFloat(e.deg); if (!isNaN(d) && (isNaN(o.deg) || d < o.deg)) o.deg = d; if (isYes(e.pain)) o.pain = true; if (e.rest === 'Yes') o.rest = true; });
    return o;
  }
  function indexOf(region, name) { var R = rows(region); for (var i = 0; i < R.length; i++) if (R[i].name === name) return i; return -1; }
  // Status colour (clinic default thresholds, unsourced; see rules doc): green / amber / red / none.
  function status(e, ctx) {
    var lv = 0, d = parseFloat(e.deg), n = norm(e.region, e.i, ctx).deg, recd = filled(e.deg) || filled(e.grade) || filled(e.pain);
    if (!recd) return 'none';
    if (!isNaN(d) && n != null) {
      if (n <= 10) { var def = n - d; lv = Math.max(lv, def > 15 ? 2 : def > 5 ? 1 : 0); }
      else { var ratio = d / n; lv = Math.max(lv, ratio < 0.7 ? 2 : ratio < 0.9 ? 1 : 0); }
    }
    if (e.grade === 'Severe limitation') lv = 2; else if (e.grade === 'Mild limitation' || e.grade === 'Moderate limitation') lv = Math.max(lv, 1);
    if (isYes(e.pain)) lv = Math.max(lv, 1);
    if (e.rest === 'Yes') lv = Math.max(lv, 1);
    return ['green', 'amber', 'red'][lv];
  }
  function jointStatus(region, D, side, ctx) {
    var lv = -1, order = ['green', 'amber', 'red'];
    entries(region, D).forEach(function (e) { if (sided(region) && side && e.side !== side && !(e.legacy && e.side === side)) return; var s = status(e, ctx); if (s !== 'none') lv = Math.max(lv, order.indexOf(s)); });
    return lv < 0 ? 'none' : order[lv];
  }
  // v13: loss of range for one record. null when the movement has no normal, a normal of 10° or less, or no degrees.
  function loss(e, ctx) { var d = parseFloat(e.deg), n = norm(e.region, e.i, ctx).deg; if (isNaN(d) || n == null || n <= 10) return null;
    return { norm: n, deg: d, pct: Math.round(Math.max(0, (n - d) / n) * 100), raw: (n - d) / n * 100 }; }
  // Summed loss over a region (one side for limbs): sum(normal - measured) / sum(normal), measured capped at normal.
  function lossSummary(region, D, mode, side, ctx) { var sn = 0, sd = 0, k = 0, items = [];
    entries(region, D || {}, mode || 'A').forEach(function (e) { if (sided(region) && side && e.side !== side) return; var l = loss(e, ctx); if (!l) return; sn += l.norm; sd += Math.min(l.deg, l.norm); k++; items.push({ name: label(e), pct: l.pct }); });
    return k ? { pct: Math.round((sn - sd) / sn * 100), n: k, items: items } : null; }
  // Human label for an exam-data key (item 8 change list).
  function keyLabel(region, k) {
    var m = /^rom([AP])_(deg|pain|pscore|rest|ef|grade)_(\d+)(?:_([RL]))?$/.exec(k); if (!m) return k;
    var r = rows(region)[+m[3]]; if (!r) return k;
    var f = { deg: '', pain: ' pain', pscore: ' pain score', rest: ' restricted', ef: ' end feel', grade: ' grade' }[m[2]];
    var side = m[4] || (sided(region) ? (legacySide(typeof APP !== 'undefined' && APP.examData ? APP.examData[region] : null) || '(side not recorded)') : '');
    return r.name + (side ? ' ' + side : '') + ' ' + (m[1] === 'A' ? 'active' : 'passive') + f;
  }
  g.ROMDATA = { SIDED: SIDED, GRADES: GRADES, PAIN: PAIN, LOSS_NOTE: LOSS_NOTE, loss: loss, lossSummary: lossSummary, isYes: isYes, painFree: painFree, band: band, SRC: SRC, SOUCIE: SOUCIE, SOUCIE_COLS: SOUCIE_COLS, NORM: NORM, patientCtx: patientCtx, norm: norm, sided: sided, key: key,
    entries: entries, text: text, label: label, worst: worst, indexOf: indexOf, status: status, jointStatus: jointStatus, keyLabel: keyLabel, legacySide: legacySide, filled: filled };
})(typeof window !== 'undefined' ? window : globalThis);
