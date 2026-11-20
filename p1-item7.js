/* P1 item 7: SA medical-aid billing fit (2026-10-16, v1)
 * Checks ICD-10 codes against the SA ICD-10 MIT 2021 (validity, specificity, primary position, asterisk order, age/gender,
 * retired codes, external cause with injury codes, SA submission format). Pairs tariff lines with diagnoses (ICD-10 per line).
 * Applies chiropractor tariff rules (GEMS 2026 file for practice type 004, or COID 2026 tariff), then gives a pre-submit report.
 * Output is export only (CSV and a printable account); nothing is submitted or switched.
 * Rules and sources: docs/P1_ITEM7_RULES.md.
 */
(function () {
  'use strict';
  var MIT = window.CC_ICD10_MIT || { meta: {}, rows: [] };
  var IDX = {}; MIT.rows.forEach(function (r) { IDX[r[0]] = r; });
  var TARIFFS = {
    gems2026: { id: 'gems2026', name: 'GEMS tariff for services by chiropractors (practice type 004)', effective: '2026-01-01', version: 'TRF003 GEMS 2026 Chiropractic V1',
      url: 'https://www.gems.gov.za/-/media/Gems-Media/Documents/tarriffs-files/2026/BATCH-1---ICT-SUBMISSION/TRF003-_GEMS-2026-Chiropractic_V1.xlsx', retrieved: '2026-10-16',
      sha256: '9d27bcb122072247e025752cc84c9b7943d760ea278cab6edec9e4d6bbfadba8', vat: 'VAT inclusive', maxTreatmentsPerSeries: 12,
      codes: { '107': ['Appointment not kept', 0, 'other'], '301': ['Consultation', 263.2, 'consult'], '311': ['Single diagnostic procedure', 263.2, 'diag'], '312': ['Two diagnostic procedures', 394.4, 'diag'], '313': ['Three diagnostic procedures', 526, 'diag'],
        '321': ['Single instance of immobilization or therapeutic exercises', 105.2, 'immob'], '322': ['Two instances of immobilization or therapeutic exercises', 157.8, 'immob'],
        '331': ['Single treatment procedure', 105.2, 'treat'], '332': ['Two treatment procedures', 157.8, 'treat'], '333': ['Three treatment procedures', 210.2, 'treat'], '334': ['Four treatment procedures', 263.2, 'treat'], '335': ['Five treatment procedures', 315.4, 'treat'], '336': ['Six treatment procedures', 368, 'treat'],
        '100': ['Medication / material (NAPPI code required)', null, 'material'], '110': ['X-Ray films', null, 'xray'] } },
    coid2026: { id: 'coid2026', name: 'COID chiropractor tariff of fees (practice type 004)', effective: '2026-04-01', version: 'Government Gazette 54356, Notice 7254, 20 March 2026',
      url: 'https://www.labour.gov.za/DocumentCenter/Regulations%20and%20Notices/Notices/Compensation%20for%20Occupational%20Injuries%20and%20Diseases/2026%20%20COID%20Medical%20Tariffs%20Gazette/Chiropractor%2054356%20pdf%20-%202026.pdf', retrieved: '2026-10-16',
      sha256: '253b7475cff875a07b11b78995474f2468e0273b2b6e87a9bd3208c48d37f0de', vat: 'as gazetted', maxTreatmentsPerSeries: 10,
      codes: { '04301': ['Initial consultation', 399.06, 'consult'], '04311': ['Single diagnostic procedure', 258.69, 'diag'], '04312': ['Two diagnostic procedures (attach motivation)', 393.04, 'diag'], '04313': ['Three diagnostic procedures (initial consultation only)', 517.38, 'diag'],
        '04321': ['Single instance of immobilization or therapeutic exercises', 782.08, 'immob'], '04322': ['Two instances of immobilization or therapeutic exercises (attach motivation)', 982.61, 'immob'],
        '04331': ['Single treatment procedure', 549.46, 'treat'], '04332': ['Two treatment procedures', 665.77, 'treat'], '04333': ['Three treatment procedures', 782.08, 'treat'], '04334': ['Four treatment procedures', 898.39, 'treat'], '04335': ['Five treatment procedures', 1014.70, 'treat'], '04336': ['Six treatment procedures', 1129.00, 'treat'] } }
  };
  var SRC = {
    clinic: 'Practice days: Wed/Fri Melkbosstrand Chiropractic, Mon/Tue/Thu Vredenburg Practice, no weekend patients (user decision 2026-10-17)',
    mit: 'SA ICD-10 MIT 2021 (NDoH), columns Valid_ICD10_ClinicalUse / Primary / Asterisk / Dagger / Sequelae / Age_Range / Gender / SA_End_Date',
    gsn0006: 'SA ICD-10 Morbidity Coding Standards v6 (2014) GSN0006: highest level of specificity; ECC 4th/5th characters mandatory, .99 if unknown',
    gsn0010: 'SA Coding Standards GSN0010: dagger/asterisk sequence must be maintained',
    gsn0102: 'SA Coding Standards GSN0102.2: non-hospital claims carry ICD-10 at every line item',
    gsn0103: 'SA Coding Standards GSN0103: max 10 ICD-10 per line; 3-character codes without dot; no spaces, hyphens, brackets; codes without descriptions',
    seq: 'SA Coding Standards, sequencing rule: external cause, sequelae and B95–B98 codes never in primary position',
    ecc: 'WHO ICD-10 Vol 1, Chapter XX note (quoted in PHISC Addendum v7, Oct 2024) and SA Coding Standards DSN2001 (Y34.99 when no detail is known)',
    who13: 'WHO ICD-10 2019, Chapter XIII site subclassification (dorsopathy site codes before M40; limb site codes at the start of Chapter XIII)',
    gems001: 'GEMS 2026 chiropractic tariff, general rule 001 (account contents)', gems002: 'GEMS rule 002 (consultation once per visit)', gems003: 'GEMS rule 003 (max 3 diagnostic procedures)',
    gems004: 'GEMS rule 004 (max 3 treatment procedures per single diagnosis)', gems005: 'GEMS rule 005 (after 12 treatments for the same condition, a motivation letter is required)', gemsSec: 'GEMS file: only a single item per section per encounter; RCC certificate number on the account if X-rays are charged',
    alt: 'Alternative SA codes differing by location/type (clinician decision 2026-10-16; docs/P1_ITEM7_ICD10_MAPPING.md). Location cue from the exam data; WHO ICD-10 Ch XIII site tables',
    coid002: 'COID 2026 rules 002/006 (10 sessions; referral letter; motivation beyond 10)', coidDiag: 'COID 2026 section 2: 04313 initial consultation only; follow-up 04311/04312; 04312 at follow-up needs motivation', coid003: 'COID rule 003 (consultation once per day, once per claim)', coid005: 'COID rule 005 (max 3 treatment types per single diagnosis)'
  };
  // Region -> MIT description suffixes for the site character (WHO ICD-10 Ch XIII site tables). The first matching group wins.
  var SITE = { cs: [['cervical region']], ts: [['thoracic region']], ls: [['lumbar region']], pelvis: [['sacral and sacrococcygeal region', 'sacral region'], ['pelvic region and thigh', 'pelvic region']],
    hip: [['pelvic region and thigh'], ['lower extremity']], shoulder: [['shoulder region'], ['upper extremity']], elbow: [['upper arm'], ['upper extremity']],
    wrist: [['forearm', 'hand'], ['upper extremity']], knee: [['lower leg'], ['lower extremity']], ankle: [['ankle and foot'], ['lower extremity']] };
  var REGION_LABEL = { cs: 'Cervical', ts: 'Thoracic', ls: 'Lumbar', pelvis: 'Pelvis/SI', hip: 'Hip', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist/Hand', knee: 'Knee', ankle: 'Ankle/Foot' };

  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function prof() { try { return loadProfile(); } catch (e) { return {}; } }
  function visits() { try { var a = window.CCData.all(); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function visitDate() { return val('visitDate') || localISODate(); }

  // ---------- ICD-10 ----------
  function normalise(raw) { var c = String(raw || '').toUpperCase().replace(/[\s()\[\]+*†]/g, '').replace(/-/g, '.'); if (/^[A-Z][0-9]{2}\.$/.test(c)) c = c.slice(0, 3); if (/^[A-Z][0-9]{3,4}$/.test(c)) c = c.slice(0, 3) + '.' + c.slice(3); return c; }
  function row(c) { return IDX[c] || null; }
  function valid(c) { var r = row(c); return !!(r && r[1][0] === 'Y' && !r[4]); }
  function children(c) { return MIT.rows.filter(function (r) { return r[0].indexOf(c) === 0 && r[0] !== c && r[1][0] === 'Y' && !r[4]; }); }
  function bySite(cands, region) {
    var groups = SITE[region] || [];
    for (var g = 0; g < groups.length; g++) { var m = cands.filter(function (r) { var d = r[5].toLowerCase(); return groups[g].some(function (s) { return d.slice(-(s.length + 2)) === ', ' + s; }); }); if (m.length) return m; }
    return [];
  }
  // Deterministic SA-MIT suggestions for a code (never applied without the clinician).
  function suggest(code, region) {
    var c = normalise(code), out = [], why = '';
    if (valid(c)) return { code: c, options: [], why: '' };
    var r = row(c);
    if (!r) { // not in MIT: typically a US ICD-10-CM extension (laterality / 7th character)
      var p = c; while (p.length > 3 && !row(p)) { p = p.slice(0, -1); if (p.slice(-1) === '.') p = p.slice(0, -1); }
      if (row(p)) { if (valid(p)) { out = [row(p)]; why = c + ' is not in the SA MIT (ICD-10-CM extension). Nearest valid SA code: ' + p + '.'; } else { var ch = children(p), s = bySite(ch, region); out = s.length ? s : ch; why = c + ' is not in the SA MIT; ' + p + ' needs a further character' + (s.length ? ' (site from region ' + (REGION_LABEL[region] || region) + ')' : '') + '.'; } }
      else why = c + ' is not in the SA MIT and has no SA parent code.';
    } else if (r[4]) { why = c + ' was retired in SA on ' + r[4] + '.'; out = children(c.slice(0, 3)); }
    else { var ch2 = children(c), s2 = bySite(ch2, region); out = s2.length ? s2 : ch2; why = c + ' is not specific enough: SA requires the ' + (c.length === 3 ? '4th' : '5th') + ' character' + (s2.length ? ' (site from region ' + (REGION_LABEL[region] || region) + ')' : '') + '.'; }
    return { code: c, options: out.slice(0, 40).map(function (x) { return { code: x[0], desc: x[5] }; }), why: why };
  }

  // ---------- v3: alternative-code choices (clinician decision 2026-10-16) ----------
  // Pairs/groups of SA-valid codes that differ by location or type. If the exam data names exactly one option's location/type,
  // it is auto-picked and the reason shown; otherwise the practitioner picks one or removes the code. Unresolved = billing error.
  var ALT = [
    { id: 'sacroiliitis', label: 'Sacroiliitis level', opts: [
      { code: 'M46.17', cue: /lumbosacral|l5\s*[-\/]?\s*s1/, cueName: 'lumbosacral / L5-S1' },
      { code: 'M46.18', cue: /(^|[^a-z])sacral\b|sacrococcyg|sacrum/, cueName: 'sacral / sacrococcygeal' }] },
    { id: 'lbp', label: 'Low back pain level', opts: [
      { code: 'M54.57', cue: /lumbosacral|l5\s*[-\/]?\s*s1/, cueName: 'lumbosacral / L5-S1' },
      { code: 'M54.58', cue: /(^|[^a-z])sacral\b|sacrococcyg|sacrum/, cueName: 'sacral / sacrococcygeal' }] },
    { id: 'wristhand', label: 'Sprain: wrist or hand', opts: [
      { code: 'S63.5', cue: /\bwrist\b|\bcarpal\b|carpus|radiocarpal|scaphoid|lunate|tfcc/, cueName: 'wrist / carpus' },
      { code: 'S63.7', cue: /\bhand\b|metacarp|\bpalm|\bmcp\b/, cueName: 'hand / metacarpal' }] },
    { id: 'spasm', label: 'Muscle disorder or cramp/spasm', opts: [
      { code: 'M62.88', cue: /trigger point|hypertonic|taut band|muscle tightness/, cueName: 'trigger point / hypertonicity' },
      { code: 'R25.2', cue: /\bcramp|\bspasm/, cueName: 'cramp / spasm' }] },
    { id: 'spasmleg', label: 'Muscle disorder (lower leg) or cramp/spasm', opts: [
      { code: 'M62.86', cue: /trigger point|hypertonic|taut band|muscle tightness/, cueName: 'trigger point / hypertonicity' },
      { code: 'R25.2', cue: /\bcramp|\bspasm/, cueName: 'cramp / spasm' }] },
    { id: 'footstrain', label: 'Foot muscle/tendon strain', opts: [
      { code: 'S96.0', cue: /long flexor|flexor hallucis|\bfhl\b|\bfdl\b|flexor digitorum/, cueName: 'long flexor of toe' },
      { code: 'S96.9', cue: null, cueName: '' }] },
    { id: 'myalgiaarm', label: 'Myalgia: shoulder or upper arm', opts: [
      { code: 'M79.11', cue: /shoulder/, cueName: 'shoulder' },
      { code: 'M79.12', cue: /upper arm|biceps|triceps|deltoid|humer/, cueName: 'upper arm' }] },
    { id: 'pelvicseg', label: 'Segmental dysfunction: sacral or pelvic', opts: [
      { code: 'M99.04', cue: /(^|[^a-z])sacral\b|sacrum|sacroiliac|\bsi\s*joint|\bsij\b/, cueName: 'sacral / SI joint' },
      { code: 'M99.05', cue: /pelvi|ilium|iliac|innominate|pubic|symphysis/, cueName: 'pelvis / ilium' }] },
    { id: 'acjoint', label: 'AC joint condition', opts: [
      { code: 'S43.5', cue: /sprain|strain|grade\s*(i|1)\b/, cueName: 'sprain / grade I' },
      { code: 'S43.1', cue: /dislocat|separation|grade\s*(ii|iii|iv|v|2|3|4|5)\b|step deformity/, cueName: 'dislocation / separation' },
      { code: 'M19.01', cue: /\barthrosis|osteoarth|degenerat|\boa\b/, cueName: 'arthrosis' },
      { code: 'M19.11', cue: /post[- ]?traumatic arthr/, cueName: 'post-traumatic arthrosis' }] }
  ];
  // Regions where a group applies (M99.04/M99.05 only for pelvis, myalgia arm for shoulder/elbow/cs, AC for shoulder).
  var ALT_REG = { pelvicseg: ['pelvis', 'ls'], myalgiaarm: ['shoulder', 'elbow', 'cs'], acjoint: ['shoulder'] };
  function altGroup(code, region) { for (var i = 0; i < ALT.length; i++) { var g = ALT[i]; if (ALT_REG[g.id] && ALT_REG[g.id].indexOf(region) < 0) continue; if (g.opts.some(function (o) { return o.code === code; })) return g; } return null; }
  function examBlob(region) { var D = (APP.examData || {})[region] || {}, b = ''; try { b = dxBuildCueContext(region, D).blob || ''; } catch (e) {}
    var p = []; ['primaryDx', 'secondaryDx', 'formulatedCondition', 'impression', 'notes', 'soapA', 'soapO', 'palpation', 'palpNotes'].forEach(function (k) { if (D[k]) p.push(String(D[k])); });
    Object.keys(D).forEach(function (k) { var m = /^ort_([RL])_(.+)$/.exec(k); if (m && (D[k] === '+' || /^pos/i.test(D[k]))) p.push(m[2] + ' positive'); });
    return (b + ' ' + p.join(' ')).toLowerCase(); }
  function optDesc(c) { var r = row(c); return r ? r[5] : c; }
  // Returns {status:'none'|'resolved'|'auto'|'choice', group, rec}
  function resolveAlt(region, field) {
    var D = getExamData(region), code = normalise(D[field] || ''), g = code && altGroup(code, region); if (!g) return { status: 'none' };
    D.p7Alt = D.p7Alt || {}; var rec = D.p7Alt[field];
    if (rec && rec.code === code && rec.group === g.id) return { status: 'resolved', group: g, rec: rec };
    var blob = examBlob(region), hits = g.opts.filter(function (o) { return o.cue && o.cue.test(blob); });
    if (hits.length === 1) { var m = blob.match(hits[0].cue); rec = D.p7Alt[field] = { group: g.id, code: hits[0].code, by: 'auto', why: 'Exam data mentions "' + (m ? m[0].trim() : hits[0].cueName) + '" (' + hits[0].cueName + ')', options: g.opts.map(function (o) { return o.code; }), at: new Date().toISOString() };
      D[field] = hits[0].code; return { status: 'auto', group: g, rec: rec }; }
    return { status: 'choice', group: g, hits: hits.map(function (o) { return o.code; }) };
  }
  function chooseAlt(region, field, code) { var D = getExamData(region), g = altGroup(normalise(D[field] || ''), region) || altGroup(code, region); if (!g || !g.opts.some(function (o) { return o.code === code; })) return false;
    D[field] = code; if (field === 'icd10') D.dxIcdLocked = true; D.p7Alt = D.p7Alt || {}; D.p7Alt[field] = { group: g.id, code: code, by: 'practitioner', why: 'Chosen by the practitioner', options: g.opts.map(function (o) { return o.code; }), at: new Date().toISOString() }; state.lines = null; render(); return true; }
  function removeAlt(region, field) { var D = getExamData(region), old = D[field]; D[field] = ''; D.p7Alt = D.p7Alt || {}; D.p7AltRemoved = (D.p7AltRemoved || []).concat([{ field: field, code: old, at: new Date().toISOString() }]); delete D.p7Alt[field]; state.lines = null; render(); return true; }
  function altNote(region, field) { var D = ((typeof APP !== 'undefined' && APP.examData) || {})[region] || {}, rec = (D.p7Alt || {})[field || 'icd10']; if (!rec || rec.code !== D[field || 'icd10']) return ''; return (rec.by === 'auto' ? 'auto-picked: ' : 'practitioner choice: ') + rec.code + ' of ' + rec.options.join(' / ') + (rec.by === 'auto' ? ' — ' + rec.why : ''); }
  function altIssues(codes) { var out = [];
    codes.forEach(function (c) { if (c.field === 'extCause') return; var s = resolveAlt(c.region, c.field); if (s.status === 'none') return;
      if (s.status === 'choice') out.push({ level: 'error', rule: 'codeChoice', src: 'alt', code: c.code, region: c.region, field: c.field, alt: true, msg: (REGION_LABEL[c.region] || c.region) + ' ' + c.field + ': ' + s.group.label + ' — the exam data does not record which applies' + (s.hits && s.hits.length > 1 ? ' (it mentions more than one)' : '') + '. Choose one code or remove it.', fix: s.group.opts.map(function (o) { return { code: o.code, desc: optDesc(o.code) }; }) });
      else out.push({ level: 'info', rule: 'codeChosen', src: 'alt', code: s.rec.code, region: c.region, field: c.field, msg: (REGION_LABEL[c.region] || c.region) + ' ' + c.field + ': ' + s.rec.code + ' (' + optDesc(s.rec.code) + ') — ' + (s.rec.by === 'auto' ? 'auto-picked. ' + s.rec.why : 'chosen by the practitioner') + '. Options were ' + s.rec.options.join(' / ') + '.' }); });
    return out; }

  // ---------- v4: an injury code must carry a cause code (clinician decision 2026-10-16) ----------
  // Y34.99 (SA MIT 2021: valid for clinical use, not primary, so secondary only) is auto-attached when an injury code has no cause; it stays a warning.
  var ECC_AUTO = 'Y34.99';
  function eccAutoAdd() { var out = [];
    regions().forEach(function (r) { var D = APP.examData[r] || {};
      var inj = [D.icd10, D.icd10_2].map(function (c) { return normalise(c || ''); }).filter(isInjury);
      if (!inj.length) return;
      if (!String(D.extCause || '').trim()) { D.extCause = ECC_AUTO; D.p7EccAuto = { code: ECC_AUTO, injury: inj.join(','), at: new Date().toISOString(), label: 'auto-added, replace with actual cause' }; D.p7EccLog = (D.p7EccLog || []).concat([{ action: 'auto-added', code: ECC_AUTO, injury: inj.join(','), at: D.p7EccAuto.at }]); }
      else if (D.p7EccAuto && normalise(D.extCause) !== ECC_AUTO && !D.p7EccAuto.replacedBy) { D.p7EccAuto.replacedBy = normalise(D.extCause); D.p7EccAuto.replacedAt = new Date().toISOString(); D.p7EccLog = (D.p7EccLog || []).concat([{ action: 'replaced', code: D.p7EccAuto.replacedBy, at: D.p7EccAuto.replacedAt }]); }
      if (D.p7EccAuto && !D.p7EccAuto.replacedBy && normalise(D.extCause) === ECC_AUTO) out.push({ level: 'warn', rule: 'eccAuto', src: 'ecc', code: ECC_AUTO, region: r, field: 'extCause', msg: (REGION_LABEL[r] || r) + ': ' + ECC_AUTO + ' (' + (row(ECC_AUTO) || [, , , , , ''])[5] + ') was auto-added, replace with actual cause. Pick the real cause in the external-cause picker on the Exam tab (SA MIT V01–Y98).' }); });
    return out; }
  function isAutoEcc(region) { var D = (APP.examData || {})[region] || {}; return !!(D.p7EccAuto && !D.p7EccAuto.replacedBy && normalise(D.extCause || '') === ECC_AUTO); }
  // every line that carries an injury code also carries that region's cause code
  function ensureLineEcc(lines, codes) { lines.forEach(function (l) { var icd = l.icd || (l.icd = []);
      if (icd.some(isInjury) && !icd.some(isEcc)) { var inj = codes.filter(function (c) { return icd.indexOf(c.code) >= 0 && isInjury(c.code); })[0], e = inj && codes.filter(function (c) { return c.region === inj.region && c.field === 'extCause'; })[0]; e = e || codes.filter(function (c) { return isEcc(c.code); })[0]; if (e) icd.push(e.code); } }); return lines; }

  // ---------- v4: scheme selector (user-approved 2026-10-16). Only officially published tables are loaded; none other than GEMS was found. ----------
  // searched 2026-10-16: scheme websites and public search for a 2026 chiropractic (004) rate table. Third-party billing-house percentages are not official and are not loaded.
  var SCHEMES = [
    { id: 'gems', name: 'GEMS', table: 'gems2026', match: /\bgems\b|government employees/i },
    { id: 'discovery', name: 'Discovery Health Medical Scheme', table: null, match: /discovery/i, note: 'Pays chiropractors at the Discovery Health Rate (DHR); the 2026 DHR rate file is distributed to providers through billing software / provider channels, no public 2026 chiropractic rate file found' },
    { id: 'bonitas', name: 'Bonitas', table: null, match: /bonitas/i, note: '"Bonitas Tariff" referenced in benefit annexures; no public chiropractic rate table found' },
    { id: 'momentum', name: 'Momentum Medical Scheme', table: null, match: /momentum/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'medshield', name: 'Medshield', table: null, match: /medshield/i, note: '2026 benefit guides cover chiropractics (day-to-day / PSA); no public rate table found' },
    { id: 'bestmed', name: 'Bestmed', table: null, match: /bestmed/i, note: '2026 guides published; no public chiropractic rate table found' },
    { id: 'fedhealth', name: 'Fedhealth', table: null, match: /fedhealth/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'polmed', name: 'POLMED', table: null, match: /polmed/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'bankmed', name: 'Bankmed', table: null, match: /bankmed/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'profmed', name: 'Profmed', table: null, match: /profmed/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'sizwehosmed', name: 'Sizwe Hosmed', table: null, match: /sizwe|hosmed/i, note: '2026 plan guides pay chiropractors at 100% of "Scheme Tariff" (NHRPL 2006 + annual increase); the rate table itself is not published' },
    { id: 'keyhealth', name: 'KeyHealth', table: null, match: /key\s*health/i, note: 'no public 2026 chiropractic rate table found' },
    { id: 'other', name: 'Other scheme', table: null, match: null, note: 'no table loaded' }
  ];
  function schemeById(id) { return SCHEMES.filter(function (x) { return x.id === id; })[0] || null; }
  function schemeFromPatient(txt) { txt = String(txt || ''); for (var i = 0; i < SCHEMES.length; i++) if (SCHEMES[i].match && SCHEMES[i].match.test(txt)) return SCHEMES[i].id; return txt ? 'other' : 'gems'; }
  function rateBasis(tariff, schemeId) { if (tariff === 'coid2026') return { label: 'COID 2026 tariff', fallback: false };
    var sc = schemeById(schemeId) || schemeById('gems'); var imp = null; try { imp = sc.id !== 'gems' && window.P1SchemeRates ? P1SchemeRates.get(sc.id) : null; } catch (e) {}
    if (imp) return { label: 'imported: ' + sc.name + ' ' + imp.version + ' effective ' + imp.effective, fallback: false, scheme: sc, imported: imp };
    if (sc.table) return { label: sc.name + ' — ' + TARIFFS[sc.table].version, fallback: false, scheme: sc };
    return { label: 'GEMS 2026 reference rates (fallback: ' + sc.name + ' publishes no public chiropractic rate table; the scheme may pay a different rate)', fallback: true, scheme: sc }; }
  function ageYears(dob, at) { if (!dob) return null; var b = new Date(dob), t = new Date(at); if (isNaN(b) || isNaN(t)) return null; var a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a; }
  function ageOk(range, age) { if (!range || age == null) return true; var m = /^(>|≤|<=)(\d+)years?$/.exec(range); if (!m) return true; var n = +m[2]; return m[1] === '>' ? age > n : age <= n; }
  function isInjury(c) { return /^[ST]/.test(c); } function isEcc(c) { return /^[VWXY]/.test(c); }
  function checkCodes(list, ctx) {
    var iss = [], seen = {};
    list.forEach(function (raw, i) {
      var c = normalise(raw), r = row(c), where = (i === 0 ? 'primary' : 'position ' + (i + 1)) + ' (' + c + ')';
      if (String(raw).trim() !== c) iss.push({ level: 'warn', rule: 'format', src: 'gsn0103', code: c, msg: '"' + raw + '" will be exported as ' + c + ' (SA submission format).' });
      if (seen[c]) iss.push({ level: 'warn', rule: 'duplicate', src: 'gsn0103', code: c, msg: c + ' is listed twice.' }); seen[c] = 1;
      if (!r) { var s = suggest(c, ctx.region); iss.push({ level: 'error', rule: 'notInMit', src: 'mit', code: c, msg: where + ' is not a valid SA ICD-10 code. ' + s.why, fix: s.options }); return; }
      if (r[4]) { iss.push({ level: 'error', rule: 'retired', src: 'mit', code: c, msg: where + ' ended in SA on ' + r[4] + '.', fix: suggest(c, ctx.region).options }); return; }
      if (r[1][0] !== 'Y') { var s2 = suggest(c, ctx.region); iss.push({ level: 'error', rule: 'notSpecific', src: 'gsn0006', code: c, msg: where + ' is not valid for clinical use. ' + s2.why, fix: s2.options }); return; }
      if (i === 0 && r[1][1] !== 'Y') iss.push({ level: 'error', rule: 'notPrimary', src: 'seq', code: c, msg: c + ' may not be in the primary position (' + (isEcc(c) ? 'external cause' : r[1][2] === 'Y' ? 'asterisk' : r[1][4] === 'Y' ? 'sequela' : 'MIT primary flag N') + ').' });
      if (r[1][2] === 'Y') { var prev = i > 0 ? row(normalise(list[i - 1])) : null; if (!prev || prev[1][3] !== 'Y') iss.push({ level: 'warn', rule: 'asteriskOrder', src: 'gsn0010', code: c, msg: c + ' is an asterisk (manifestation) code: the dagger (aetiology) code must come directly before it.' }); }
      if (r[2] && ctx.gender && /^[MF]/i.test(ctx.gender) && r[2] !== ctx.gender.charAt(0).toUpperCase()) iss.push({ level: 'error', rule: 'gender', src: 'mit', code: c, msg: c + ' is valid only for gender ' + r[2] + '.' });
      if (!ageOk(r[3], ctx.age)) iss.push({ level: 'error', rule: 'age', src: 'mit', code: c, msg: c + ' is restricted to age ' + r[3] + ' (patient ' + ctx.age + ').' });
    });
    var cs = list.map(normalise);
    if (cs.some(isInjury) && !cs.some(isEcc)) iss.push({ level: 'warn', rule: 'eccMissing', src: 'ecc', msg: 'An injury code (S00–T98) is present without an external cause code (V01–Y98). Add the cause, or Y34.99 if nothing is known.', fix: [{ code: 'Y34.99', desc: (row('Y34.99') || [0, 0, 0, 0, 0, ''])[5] }] });
    if (cs.length > 10) iss.push({ level: 'error', rule: 'max10', src: 'gsn0103', msg: 'More than 10 ICD-10 codes.' });
    return iss;
  }

  // ---------- Claim from visit ----------
  function regions() { var ex = APP.examData || {}, act = (APP.activeRegions || []).slice(); Object.keys(ex).forEach(function (r) { if (act.indexOf(r) < 0 && ex[r] && ex[r].icd10 && ex[r].dxConfirmed) act.push(r); }); return act.filter(function (r) { return REGION_LABEL[r]; }); }
  function visitCodes() { var out = []; regions().forEach(function (r) { var D = APP.examData[r] || {}; [D.icd10, D.icd10_2, D.extCause].forEach(function (c, k) { if (c && String(c).trim()) out.push({ code: normalise(c), raw: c, region: r, field: ['icd10', 'icd10_2', 'extCause'][k], dx: D.formulatedCondition || D.primaryDx || '' }); }); }); return out; }
  function diagCount() { // examination types documented this visit (GEMS rule 003 list): orthopaedic, neurological, physical (ROM), postural
    var t = { orthopaedic: 0, neurological: 0, physical: 0, postural: 0 };
    regions().forEach(function (r) { var D = APP.examData[r] || {}; Object.keys(D).forEach(function (k) { var v = D[k]; if (v === '' || v == null || v === 'N/A' || v === '—') return;
      if (/^ort_/.test(k)) t.orthopaedic = 1; else if (/^(myo|ref|derm|sens)_/.test(k)) t.neurological = 1; else if (/^rom/.test(k)) t.physical = 1; else if (/^post/i.test(k)) t.postural = 1; }); });
    return { types: Object.keys(t).filter(function (k) { return t[k]; }), n: Object.keys(t).filter(function (k) { return t[k]; }).length };
  }
  function txCount() { var s = {}; regions().forEach(function (r) { ((APP.examData[r] || {}).txMods || []).forEach(function (m) { s[m] = 1; }); }); return Object.keys(s); }
  function patient() { return { first: val('ptFirstName'), last: val('ptLastName'), dob: val('ptDOB'), gender: val('ptGender'), scheme: val('ptMedAid'), memberNo: val('ptMedAidNo'), pid: (window.EHR && EHR.currentPatientId) || '' }; }
  function priorVisits(primary) { var p = patient(); if (!p.pid || !primary) return []; var cat = primary.slice(0, 3);
    return ((p.pid && window.CCData.forPatient(p.pid)) || visits()).filter(function (v) { if (!v || v.patientId !== p.pid || (v.visit || {}).date === visitDate()) return false; return Object.keys(v.examData || {}).some(function (r) { return normalise((v.examData[r] || {}).icd10).slice(0, 3) === cat; }); }); }
  // v485 (user decision 2026-10-17, Theunis: no weekend patients): a visit on a non-practice day (Sat/Sun, or a date that
  // cannot be read) gets NO automatic practice. The account shows a prompt and export/print stay blocked until a practice is chosen.
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function practiceName() { var d = new Date(visitDate() + 'T00:00:00'), w = d.getDay(), chosen = val('p7Prac'); try { chosen = ccPracticeName(chosen); } catch (e) {} // v5: old label -> same practice
    if (!chosen && window.CCPractice) chosen = CCPractice.manualFor(visitDate()); // v486: a practice chosen for this date's documents also applies here
    if (chosen) return { name: chosen, needsChoice: false };
    var n = isNaN(w) ? '' : (w === 3 || w === 5) ? 'Melkbosstrand Chiropractic' : (w === 1 || w === 2 || w === 4) ? 'Vredenburg Practice' : '';
    if (n) return { name: n, needsChoice: false };
    return { name: '', needsChoice: true, day: isNaN(w) ? null : w }; }
  function practicePrompt(day) { return 'No practice day on ' + (day == null ? 'this visit date' : DAYS[day]) + ' — the clinic does not see patients on weekends. Check the visit date or choose a practice.'; }
  function practice() { var pn = practiceName(), b = {}; try { b = profilePracticeBlock(pn.name); } catch (e) {} b.needsChoice = pn.needsChoice; b.day = pn.day; return b; }
  function suggestLines(tariff, codes) {
    var T = TARIFFS[tariff], first = !priorVisits(codes[0] && codes[0].code).length, dc = diagCount(), tx = txCount(), L = [], icds = codes.map(function (c) { return c.code; });
    var coid = tariff === 'coid2026';
    if (!coid || first) L.push({ code: coid ? '04301' : '301', why: coid ? 'initial consultation (first visit for this condition)' : 'consultation' });
    if (dc.n) { var n = Math.min(dc.n, 3); if (coid) n = first ? 3 : Math.min(n, 1); L.push({ code: (coid ? '0431' : '31') + n, why: 'diagnostic procedures documented: ' + dc.types.join(', ') + (coid ? (first ? ' (COID: 04313 on initial)' : ' (COID follow-up: 04311)') : '') }); }
    if (tx.length) { var k = Math.min(tx.length, 6); L.push({ code: (coid ? '0433' : '33') + k, why: 'treatment types recorded: ' + tx.join(', ') }); }
    return L.map(function (l) { return { code: l.code, why: l.why, qty: 1, icd: icds.slice() }; });
  }
  function checkLines(tariff, lines, codes, hdr) {
    var T = TARIFFS[tariff], iss = [], sec = {}, coid = tariff === 'coid2026', primary = codes[0] && codes[0].code, prior = priorVisits(primary).length, dxCount = codes.filter(function (c) { return !isEcc(c.code); }).length;
    if (!lines.length) iss.push({ level: 'error', rule: 'noLines', src: 'gsn0102', msg: 'No tariff lines.' });
    lines.forEach(function (l, i) {
      var t = T.codes[l.code], where = 'Line ' + (i + 1) + ' (' + l.code + ')';
      if (!t) { iss.push({ level: 'error', rule: 'tariffUnknown', src: tariff === 'gems2026' ? 'gemsSec' : 'coidDiag', msg: where + ' is not in ' + T.name + ' (' + T.version + ').' }); return; }
      if (sec[t[2]] && t[2] !== 'material') iss.push({ level: 'error', rule: 'onePerSection', src: tariff === 'gems2026' ? 'gemsSec' : 'coidDiag', msg: where + ': only one item from the "' + t[2] + '" section per encounter.' }); sec[t[2]] = 1;
      if (!(l.icd || []).length) iss.push({ level: 'error', rule: 'lineNoIcd', src: 'gsn0102', msg: where + ' has no ICD-10 code. Each line must carry its own code(s).' });
      if ((l.icd || []).length > 10) iss.push({ level: 'error', rule: 'max10', src: 'gsn0103', msg: where + ' has more than 10 ICD-10 codes.' });
      (l.icd || []).forEach(function (c) { if (!codes.some(function (x) { return x.code === c; })) iss.push({ level: 'error', rule: 'lineIcdNotInVisit', src: 'gsn0102', msg: where + ' uses ' + c + ', which is not a diagnosis on this visit.' }); });
      if ((l.icd || []).length && (l.icd || []).every(isEcc)) iss.push({ level: 'error', rule: 'lineOnlyEcc', src: 'seq', msg: where + ' has only external cause codes; a diagnosis code must come first.' });
      if ((l.icd || []).length && isEcc(l.icd[0])) iss.push({ level: 'error', rule: 'lineEccFirst', src: 'seq', msg: where + ': an external cause code may not be first.' });
      if (t[2] === 'treat' && +l.code.slice(-1) > 3 * Math.max(1, dxCount)) iss.push({ level: 'error', rule: 'max3Treat', src: coid ? 'coid005' : 'gems004', msg: where + ': more than 3 treatment procedures for ' + dxCount + ' diagnosis/es (max 3 per single diagnosis).' });
      if (t[2] === 'diag' && +l.code.slice(-1) > 3) iss.push({ level: 'error', rule: 'max3Diag', src: 'gems003', msg: where + ': max 3 diagnostic procedures.' });
      if (coid && l.code === '04313' && prior) iss.push({ level: 'error', rule: 'coid04313', src: 'coidDiag', msg: '04313 is for the initial consultation only; this condition has ' + prior + ' earlier visit(s). Use 04311 or 04312.' });
      if (coid && l.code === '04301' && prior) iss.push({ level: 'error', rule: 'coid04301', src: 'coid003', msg: '04301 may be charged once per claim; this condition has earlier visit(s).' });
      if (coid && (l.code === '04312' && prior || l.code === '04322') && !hdr.motivation) iss.push({ level: 'error', rule: 'coidMotivation', src: 'coidDiag', msg: where + ' requires an attached motivation (tick "motivation attached").' });
      if (l.code === '110' && !hdr.rccNo) iss.push({ level: 'error', rule: 'rcc', src: 'gemsSec', msg: 'X-rays charged: the Radiation Control Council certificate number must be on the account.' });
      if (l.code === '100' && !l.nappi) iss.push({ level: 'error', rule: 'nappi', src: 'gemsSec', msg: 'Material line needs a NAPPI code.' });
    });
    if (prior + 1 > T.maxTreatmentsPerSeries && !hdr.motivation) iss.push({ level: 'warn', rule: 'seriesLimit', src: coid ? 'coid002' : 'gems005', msg: 'Visit ' + (prior + 1) + ' for ' + primary.slice(0, 3) + ': beyond ' + T.maxTreatmentsPerSeries + ' treatments a motivation letter is required.' });
    if (coid && !hdr.referral) iss.push({ level: 'warn', rule: 'coidReferral', src: 'coid002', msg: 'COID: a written referral letter from the treating doctor is required.' });
    return iss;
  }
  function checkHeader(hdr) {
    var iss = [], need = [['practitioner name', hdr.prName], ['qualifications', hdr.quals], ['BHF practice number', hdr.bhf], ['postal address', hdr.addr], ['telephone number', hdr.phone], ['date of service', hdr.date], ['member surname and initials', hdr.member], ['patient first name', hdr.patientFirst]];
    if (hdr.tariff === 'gems2026') need.push(['scheme name', hdr.scheme], ['membership number', hdr.memberNo]);
    if (hdr.practiceNeedsChoice) { iss.push({ level: 'error', rule: 'practiceChoice', src: 'clinic', msg: practicePrompt(hdr.practiceDay) }); need = need.filter(function (n) { return n[0] !== 'postal address' && n[0] !== 'telephone number'; }); }
    need.forEach(function (n) { if (!n[1]) iss.push({ level: 'error', rule: 'header', src: 'gems001', msg: 'Account is missing: ' + n[0] + '.' }); });
    if (hdr.tariff === 'coid2026' && !hdr.claimNo) iss.push({ level: 'error', rule: 'coidClaimNo', src: 'coid002', msg: 'COID: Compensation Fund claim number missing.' });
    return iss;
  }
  function header(tariff) {
    var p = prof(), pr = practice(), pt = patient(), self = !!($('p7Self') || {}).checked;
    var ms = val('p7MemSurname') || (self ? pt.last : ''), mi = val('p7MemInit') || (self ? pt.first.split(/\s+/).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') : '');
    return { practiceNeedsChoice: !!pr.needsChoice, practiceDay: pr.day, practiceName: pr.name || '', tariff: tariff, prName: p.name, quals: p.quals, bhf: p.prNo, addr: pr.addr ? (pr.name + ', ' + String(pr.addr).replace(/\n/g, ', ')) : '', phone: pr.phone || p.mobile || '', date: visitDate(), member: ms ? (mi ? mi + ' ' : '') + ms : '', patientFirst: pt.first,
      scheme: pt.scheme, memberNo: pt.memberNo, dependant: val('p7Dep'), referring: val('p7Ref'), referringNo: val('p7RefNo'), claimNo: val('p7ClaimNo'), motivation: !!($('p7Motiv') || {}).checked, referral: !!($('p7Referral') || {}).checked, rccNo: val('p7Rcc') };
  }
  var state = { tariff: 'gems2026', lines: null, scheme: '' };
  function run(opt) {
    opt = opt || {}; var altIss = altIssues(visitCodes()); var eccIss = eccAutoAdd(); var tariff = opt.tariff || state.tariff, codes = visitCodes(), pt = patient(), ctx = { gender: pt.gender, age: ageYears(pt.dob, visitDate()), region: (codes[0] || {}).region };
    var lines = ensureLineEcc(opt.lines || state.lines || suggestLines(tariff, codes), codes), hdr = opt.header || header(tariff);
    var icdIss = []; // per-region checks with the region's site, then the combined claim sequence
    var seqIss = checkCodes(codes.map(function (c) { return c.code; }), ctx);
    seqIss.forEach(function (x) { var c = codes.filter(function (k) { return k.code === x.code; })[0]; if (c) { x.region = c.region; x.field = c.field; if (x.fix && x.rule !== 'eccMissing') x.fix = suggest(c.raw, c.region).options.length ? suggest(c.raw, c.region).options : x.fix; } else if (x.rule === 'eccMissing') { var inj = codes.filter(function (k) { return isInjury(k.code); })[0]; if (inj) { x.region = inj.region; x.field = 'extCause'; } } });
    if (!codes.length) seqIss.push({ level: 'error', rule: 'noIcd', src: 'gsn0102', msg: 'No ICD-10 code on this visit.' });
    var schemeId = state.scheme || schemeFromPatient(pt.scheme), basis = rateBasis(tariff, schemeId); var schIss = basis.fallback ? [{ level: 'info', rule: 'schemeFallback', src: 'gems001', msg: 'Rates: ' + basis.label + (basis.scheme.note ? ' (' + basis.scheme.note + ').' : '.') }] : []; var all = schIss.concat(altIss).concat(eccIss).concat(seqIss).concat(checkLines(tariff, lines, codes, hdr), checkHeader(hdr));
    var TB = TARIFFS[tariff]; if (basis.imported) { var mc = {}; Object.keys(TB.codes).forEach(function (k) { var g = TB.codes[k], v = basis.imported.codes[k]; mc[k] = [g[0], v ? v[1] : null, g[2]]; }); TB = Object.assign({}, TB, { codes: mc, version: basis.label, imported: true }); }
    var total = lines.reduce(function (s, l) { var t = TB.codes[l.code]; return s + (t && t[1] ? t[1] * (l.qty || 1) : 0); }, 0);
    return { tariff: tariff, scheme: schemeId, rateBasis: basis.label, rateFallback: basis.fallback, table: TB, mit: MIT.meta, codes: codes, lines: lines, header: hdr, issues: all, errors: all.filter(function (x) { return x.level === 'error'; }), warnings: all.filter(function (x) { return x.level === 'warn'; }), infos: all.filter(function (x) { return x.level === 'info'; }), choices: codes.map(function (c) { return c.field === 'extCause' && isAutoEcc(c.region) ? c.code + ' auto-added, replace with actual cause' : altNote(c.region, c.field); }).filter(Boolean), total: Math.round(total * 100) / 100 };
  }
  function applyFix(region, field, code) { var D = getExamData(region); D[field] = code; if (field === 'icd10') D.dxIcdLocked = true; state.lines = null; toast(code + ' applied to ' + (REGION_LABEL[region] || region)); render(); return D[field]; }

  // ---------- Export ----------
  function csvCell(x) { x = x == null ? '' : String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }
  var CSV_COLS = ['service_date', 'tariff_table', 'bhf_practice_no', 'practitioner', 'scheme', 'membership_no', 'dependant_code', 'member', 'patient_first_name', 'patient_dob', 'line', 'tariff_code', 'tariff_description', 'qty', 'icd10', 'reference_amount_R', 'referring_practitioner', 'referring_practice_no', 'coid_claim_no', 'icd10_code_choice', 'rate_basis'];
  function buildCsv(R) {
    var h = R.header, pt = patient(), rows = [CSV_COLS.join(',')];
    R.lines.forEach(function (l, i) { var t = R.table.codes[l.code] || ['', null];
      rows.push([h.date, R.table.version, h.bhf, h.prName, h.scheme, h.memberNo, h.dependant, h.member, h.patientFirst, pt.dob, i + 1, l.code, t[0], l.qty || 1, (l.icd || []).join(' / '), t[1] == null ? '' : (t[1] * (l.qty || 1)).toFixed(2), h.referring, h.referringNo, h.claimNo, (R.choices || []).join(' | '), R.rateBasis].map(csvCell).join(',')); });
    return rows.join('\r\n') + '\r\n';
  }
  function exportCsv(R, ack) {
    R = R || run(); if (R.errors.length) { toast('Fix ' + R.errors.length + ' error(s) before export'); return { ok: false, reason: 'errors' }; }
    if (R.warnings.length && !ack) { toast('Acknowledge the warnings before export'); return { ok: false, reason: 'warnings' }; }
    var csv = buildCsv(R), name = 'claim_' + R.header.date + '_' + (R.header.patientFirst || 'patient').replace(/\W+/g, '') + '.csv';
    try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); } catch (e) {}
    APP.p7Billing = { exportedAt: new Date().toISOString(), tariff: R.tariff, tableVersion: R.table.version, mitVersion: R.mit.version, lines: R.lines, codes: R.codes.map(function (c) { return c.code; }), codeChoices: R.choices || [], scheme: R.scheme, rateBasis: R.rateBasis, eccAuto: R.codes.filter(function (c) { return c.field === 'extCause' && isAutoEcc(c.region); }).map(function (c) { return c.region + ':' + c.code; }), warningsAcknowledged: R.warnings.map(function (w) { return w.msg; }), total: R.total, file: name };
    return { ok: true, csv: csv, name: name };
  }
  // ---------- UI ----------
  var CSS = '#p7Card .p7-iss{font-size:12px;margin:3px 0;padding:4px 6px;border-radius:6px}#p7Card .p7-e{background:#fdecea;color:#8a1c12}#p7Card .p7-w{background:#fff4e0;color:#7a4b00}#p7Card .p7-ok{background:#e8f6ec;color:#1d6b35}' +
    '#p7Card table{width:100%;border-collapse:collapse;font-size:12px}#p7Card td,#p7Card th{border:1px solid var(--border,#ccc);padding:3px 5px;text-align:left}#p7Card .p7-src{font-size:10px;color:var(--text3,#777)}#p7Card .p7-fix{margin:2px 4px 0 0;font-size:11px;padding:2px 6px}' +
    '@media print{body.p7-printing>*:not(#p7Print){display:none!important}#p7Print{display:none}body.p7-printing #p7Print{display:block}body.p7-printing #p7Print .p7-lhfoot{position:fixed;left:10mm;right:10mm;bottom:0}html:has(body.p7-printing),body.p7-printing,body.p7-printing #p7Print{background:#fff!important}}';
  function ensureCss() { if ($('p7Css')) return; var s = document.createElement('style'); s.id = 'p7Css'; s.textContent = CSS; document.head.appendChild(s); }
  function issHtml(x, i) { var fx = (x.fix || []).slice(0, 8).map(function (f) { return '<button type="button" class="btn btn-secondary p7-fix" data-i="' + i + '" data-code="' + esc(f.code) + '" title="' + esc(f.desc) + '">Use ' + esc(f.code) + ' — ' + esc(f.desc) + '</button>'; }).join('');
    if (x.alt) fx += '<button type="button" class="btn btn-secondary p7-rm" data-i="' + i + '">Remove ' + esc(x.code) + '</button>';
    return '<div class="p7-iss ' + (x.level === 'error' ? 'p7-e' : x.level === 'info' ? 'p7-ok' : 'p7-w') + '" data-rule="' + x.rule + '">' + (x.level === 'error' ? '✖ ' : x.level === 'info' ? 'ℹ ' : '⚠ ') + esc(x.msg) + (fx ? '<div>' + fx + '</div>' : '') + '<div class="p7-src">' + esc(SRC[x.src] || x.src) + '</div></div>'; }
  var last = null;
  function render() {
    var box = $('p7Body'); if (!box) return; var R = last = run();
    var T = R.table;
    box.innerHTML = '<div class="p7-src">Code tables: ' + esc(R.mit.name) + ' (' + esc(R.mit.version) + ', ' + R.mit.rows + ' codes) · ' + esc(T.name) + ', ' + esc(T.version) + ', effective ' + T.effective + ' (' + esc(T.vat) + ')</div>' +
      '<div class="p7-src" id="p7RateBasis"><b>Rate basis:</b> ' + esc(R.rateBasis) + '</div>' + '<h4 style="margin:8px 0 4px">Diagnoses (claim order)</h4>' + (R.codes.length ? '<ol style="margin:0 0 0 18px;font-size:12px">' + R.codes.map(function (c) { var r = row(c.code); return '<li>' + esc(c.code) + ' — ' + esc(r ? r[5] : 'not in SA MIT') + (c.field === 'extCause' && isAutoEcc(c.region) ? ' <b class="p7-autoecc">(auto-added, replace with actual cause)</b>' : '') + ' <span class="p7-src">(' + esc(REGION_LABEL[c.region]) + ' ' + c.field + ')</span></li>'; }).join('') + '</ol>' : '<em>none</em>') +
      '<h4 style="margin:8px 0 4px">Tariff lines</h4><table><tr><th>Code</th><th>Description</th><th>ICD-10 on line</th><th>Reference R</th><th></th></tr>' + R.lines.map(function (l, i) { var t = T.codes[l.code];
        return '<tr><td><input class="p7-lc" data-i="' + i + '" value="' + esc(l.code) + '" style="width:70px"></td><td>' + esc(t ? t[0] : 'unknown code') + (l.why ? '<div class="p7-src">suggested: ' + esc(l.why) + '</div>' : '') + '</td><td>' + R.codes.map(function (c) { return '<label style="display:inline-flex;gap:3px;margin-right:6px"><input type="checkbox" class="p7-li" data-i="' + i + '" value="' + esc(c.code) + '"' + ((l.icd || []).indexOf(c.code) >= 0 ? ' checked' : '') + ' style="width:auto">' + esc(c.code) + '</label>'; }).join('') + '</td><td>' + (t && t[1] != null ? t[1].toFixed(2) : '—') + '</td><td><button type="button" class="btn btn-secondary p7-del" data-i="' + i + '">✕</button></td></tr>'; }).join('') +
      '</table><div style="margin:4px 0"><button type="button" class="btn btn-secondary" id="p7Add">+ line</button> <button type="button" class="btn btn-secondary" id="p7Reset">Re-suggest from visit</button> <span class="p7-src">Reference total R ' + R.total.toFixed(2) + ' (table rate; your scheme or contract rate may differ)</span></div>' +
      '<h4 style="margin:8px 0 4px">Pre-submit check</h4>' + (R.issues.length ? R.issues.map(issHtml).join('') + (R.errors.length || R.warnings.length ? '' : '<div class="p7-iss p7-ok">✔ No problems found against the tables above.</div>') : '<div class="p7-iss p7-ok">✔ No problems found against the tables above.</div>') +
      (R.warnings.length ? '<label style="display:flex;gap:6px;font-size:12px;margin-top:6px"><input type="checkbox" id="p7Ack" style="width:auto"> I have reviewed the ' + R.warnings.length + ' warning(s).</label>' : '') +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="p7Export"' + (R.errors.length ? ' disabled' : '') + '>Export claim CSV</button><button type="button" class="btn btn-secondary" id="p7PrintBtn"' + (R.errors.length ? ' disabled' : '') + '>Print account</button>' + (R.errors.length ? '<span style="font-size:12px;color:#8a1c12;align-self:center">' + R.errors.length + ' error(s) block export</span>' : '') + '</div>';
    var pp = $('p7PracPrompt'), ps = $('p7Prac'), H = R.header || {}; if (pp) { pp.style.display = H.practiceNeedsChoice ? '' : 'none'; pp.textContent = H.practiceNeedsChoice ? '⚠ ' + practicePrompt(H.practiceDay) : ''; } if (ps) ps.style.outline = H.practiceNeedsChoice ? '2px solid #C0392B' : '';
    bindBody(box, R);
  }
  function bindBody(box, R) {
    [].forEach.call(box.querySelectorAll('.p7-fix'), function (b) { b.onclick = function () { var x = R.issues[+b.dataset.i]; if (x && x.region && x.field) { if (x.alt) chooseAlt(x.region, x.field, b.dataset.code); else applyFix(x.region, x.field, b.dataset.code); } }; });
    [].forEach.call(box.querySelectorAll('.p7-rm'), function (b) { b.onclick = function () { var x = R.issues[+b.dataset.i]; if (x && x.alt) removeAlt(x.region, x.field); }; });
    function cur() { state.lines = state.lines || R.lines.map(function (l) { return { code: l.code, why: l.why, qty: l.qty, icd: (l.icd || []).slice() }; }); return state.lines; }
    [].forEach.call(box.querySelectorAll('.p7-lc'), function (e) { e.onchange = function () { cur()[+e.dataset.i].code = e.value.trim(); cur()[+e.dataset.i].why = ''; render(); }; });
    [].forEach.call(box.querySelectorAll('.p7-li'), function (e) { e.onchange = function () { var l = cur()[+e.dataset.i]; l.icd = R.codes.map(function (c) { return c.code; }).filter(function (c) { var cb = box.querySelector('.p7-li[data-i="' + e.dataset.i + '"][value="' + c + '"]'); return cb && cb.checked; }); render(); }; });
    [].forEach.call(box.querySelectorAll('.p7-del'), function (e) { e.onclick = function () { cur().splice(+e.dataset.i, 1); render(); }; });
    $('p7Add').onclick = function () { cur().push({ code: '', qty: 1, icd: R.codes.length ? [R.codes[0].code] : [] }); render(); };
    $('p7Reset').onclick = function () { state.lines = null; render(); };
    var ex = $('p7Export'); if (ex) ex.onclick = function () { var r = exportCsv(run(), !!($('p7Ack') || {}).checked); if (r.ok) toast('Claim CSV exported: ' + r.name); };
    var pb = $('p7PrintBtn'); if (pb) pb.onclick = function () { printAccount(); };
  }
  function printAccount() {
    var R = run(); if (R.errors.length) { toast('Fix errors first'); return false; } if (R.warnings.length && !($('p7Ack') || {}).checked) { toast('Acknowledge the warnings first'); return false; }
    var h = R.header, el = $('p7Print'); if (!el) { el = document.createElement('div'); el.id = 'p7Print'; document.body.appendChild(el); }
    // P1 latest v2: TJG letterhead (image mode) replaces the plain name heading; the account still prints quals, BHF number, practice address and phone (required account fields).
    var LH = null; try { if (typeof lhEffective === 'function') { LH = lhEffective(); if (LH.mode !== 'image') LH = null; } } catch (e) { LH = null; }
    var lhHead = LH ? '<div class="lh-band p7-lhband" style="margin:0 0 4mm"><img src="' + LH.headerImg + '" alt="Letterhead" style="display:block;width:100%;height:auto"></div>' : '<h2 style="margin:0">' + esc(h.prName) + '</h2>';
    el.innerHTML = '<div style="font:11pt Georgia,serif;color:#222;padding:10mm">' + lhHead + '<div>' + esc(h.quals) + ' · BHF practice no. ' + esc(h.bhf) + '</div><div>' + esc(h.addr) + ' · Tel ' + esc(h.phone) + '</div><hr>' +
      '<p>Date of service: ' + esc(h.date) + '<br>Member: ' + esc(h.member) + ' · Patient: ' + esc(h.patientFirst) + '<br>Scheme: ' + esc(h.scheme) + ' · Membership no. ' + esc(h.memberNo) + (h.dependant ? ' · Dependant ' + esc(h.dependant) : '') + (h.referring ? '<br>Referring practitioner: ' + esc(h.referring) + ' (' + esc(h.referringNo) + ')' : '') + (h.claimNo ? '<br>COID claim no. ' + esc(h.claimNo) : '') + '</p>' +
      '<table style="width:100%;border-collapse:collapse" border="1" cellpadding="4"><tr><th>Tariff</th><th>Description</th><th>ICD-10</th><th>R</th></tr>' + R.lines.map(function (l) { var t = R.table.codes[l.code]; return '<tr><td>' + esc(l.code) + '</td><td>' + esc(t[0]) + '</td><td>' + esc((l.icd || []).join(' / ')) + '</td><td>' + (t[1] != null ? t[1].toFixed(2) : '') + '</td></tr>'; }).join('') + '</table>' +
      ((R.choices || []).length ? '<p style="font-size:9pt">ICD-10 code choice: ' + esc(R.choices.join('; ')) + '</p>' : '') + '<p style="font-size:9pt">Rate basis: ' + esc(R.rateBasis) + '</p>' + '<p>Total: R ' + R.total.toFixed(2) + '. ' + (R.tariff === 'gems2026' ? 'This account is charged in accordance with the GEMS 2026 chiropractic tariff (NHRPL code structure).' : 'Charged per the COID chiropractor tariff effective 1 April 2026.') + '</p></div>';
    if (LH && LH.footerImg) el.innerHTML += '<div class="lh-foot p7-lhfoot"><img src="' + LH.footerImg + '" alt="Practice addresses" style="display:block;width:100%;height:auto"></div>';
    APP.p7Billing = Object.assign({}, APP.p7Billing || {}, { printedAt: new Date().toISOString(), tariff: R.tariff });
    document.body.classList.add('p7-printing'); try { window.print(); } finally { setTimeout(function () { document.body.classList.remove('p7-printing'); }, 500); }
    return true;
  }
  function cardHtml() {
    return '<div class="card" id="p7Card"><div class="card-title"><span class="icon">🧾</span> Medical-aid billing check <span style="font-weight:400;color:var(--text3);font-size:11px">— export only, nothing is submitted</span></div>' +
      '<div class="grid2"><div><label>Tariff table</label><select id="p7Tariff"><option value="gems2026">Medical aid: GEMS 2026 chiropractic tariff (NHRPL codes)</option><option value="coid2026">COID (injury on duty), tariff from 1 Apr 2026</option></select></div>' +
      '<div><label>Scheme rate table</label><select id="p7Scheme"><option value="">— from patient medical aid —</option>' + SCHEMES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + (x.table ? '' : ' (no published table: GEMS reference rates)') + '</option>'; }).join('') + '</select></div><div><label>Practice</label><select id="p7Prac"><option value="">— by visit weekday —</option><option>Melkbosstrand Chiropractic</option><option>Vredenburg Practice</option></select><div id="p7PracPrompt" class="p7-iss p7-e" role="alert" style="display:none"></div></div>' +
      '<div><label><input type="checkbox" id="p7Self" style="width:auto"> Patient is the main member</label></div><div><label>Dependant code (optional)</label><input id="p7Dep"></div>' +
      '<div><label>Main member surname</label><input id="p7MemSurname"></div><div><label>Main member initials</label><input id="p7MemInit"></div>' +
      '<div><label>Referring practitioner (if any)</label><input id="p7Ref"></div><div><label>Referring practice no.</label><input id="p7RefNo"></div>' +
      '<div><label>COID claim no.</label><input id="p7ClaimNo"></div><div><label>RCC certificate no. (only if X-rays charged)</label><input id="p7Rcc"></div>' +
      '<div><label><input type="checkbox" id="p7Motiv" style="width:auto"> Motivation letter attached</label></div><div><label><input type="checkbox" id="p7Referral" style="width:auto"> COID referral letter on file</label></div></div>' +
      '<div id="p7Body"></div></div>';
  }
  function inject() {
    var host = $('sec-report'); if (!host) return; ensureCss();
    if (!$('p7Card')) { var w = document.createElement('div'); w.innerHTML = cardHtml(); var after = $('p6Card'); if (after && after.nextSibling) host.insertBefore(w.firstChild, after.nextSibling); else host.appendChild(w.firstChild);
      $('p7Scheme').onchange = function () { state.scheme = $('p7Scheme').value; render(); };
      $('p7Tariff').onchange = function () { state.tariff = $('p7Tariff').value; state.lines = null; render(); };
      ['p7Prac', 'p7Self', 'p7Dep', 'p7MemSurname', 'p7MemInit', 'p7Ref', 'p7RefNo', 'p7ClaimNo', 'p7Rcc', 'p7Motiv', 'p7Referral'].forEach(function (id) { $(id).addEventListener('change', render); });
      // v487: a practice picked here on a non-practice day is saved with the visit (logged) and used by the other documents too
      $('p7Prac').addEventListener('change', function () { try { var iso = visitDate(), v = $('p7Prac').value; if (v && window.CCPractice && !CCPractice.scheduled(iso).name) CCPractice.choose(iso, v, 'Account'); } catch (e) {} }); }
    render();
  }
  // SA-valid external cause list for the existing exam picker (replaces the US ICD-10-CM list, which is not in the SA MIT).
  function saEccList() { return MIT.rows.filter(function (r) { return /^[VWXY]/.test(r[0]) && r[1][0] === 'Y' && !r[4]; }).map(function (r) { return { code: r[0], desc: r[5] }; }); }
  function swapEcc() { try { if (typeof EXT_CAUSE_CODES !== 'undefined' && !EXT_CAUSE_CODES._p7) { var l = saEccList(); EXT_CAUSE_CODES.length = 0; Array.prototype.push.apply(EXT_CAUSE_CODES, l); EXT_CAUSE_CODES._p7 = 1; } } catch (e) {} }
  function hook() {
    swapEcc(); inject();
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p7) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (d && typeof d === 'object' && APP.p7Billing) d.p7Billing = JSON.parse(JSON.stringify(APP.p7Billing)); } catch (e) {} return d; }; window.gatherAllData._p7 = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p7) { var rd = window.restoreData; window.restoreData = function (data) { var r = rd.apply(this, arguments); try { APP.p7Billing = data && data.p7Billing ? JSON.parse(JSON.stringify(data.p7Billing)) : null; state.lines = null; render(); } catch (e) {} return r; }; window.restoreData._p7 = 1; }
    document.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('[data-cc-click*="report"]')) setTimeout(render, 60); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook); else hook();
  window.P1Billing = { practiceName: practiceName, practicePrompt: practicePrompt, SCHEMES: SCHEMES, schemeFromPatient: schemeFromPatient, rateBasis: rateBasis, ECC_AUTO: ECC_AUTO, isAutoEcc: isAutoEcc, ALT: ALT, resolveAlt: resolveAlt, chooseAlt: chooseAlt, removeAlt: removeAlt, altNote: altNote, altGroup: altGroup, MIT_META: MIT.meta, TARIFFS: TARIFFS, SRC: SRC, SITE: SITE, normalise: normalise, valid: valid, suggest: suggest, checkCodes: checkCodes, suggestLines: suggestLines, checkLines: checkLines, checkHeader: checkHeader, header: header, run: run, render: render, exportCsv: exportCsv, buildCsv: buildCsv, CSV_COLS: CSV_COLS, applyFix: applyFix, printAccount: printAccount, saEccList: saEccList, state: state, diagCount: diagCount };
})();
