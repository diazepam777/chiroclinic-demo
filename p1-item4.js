/* P1 item 4 — Smarter HEP (PREVIEW, 2026-10-15)
 * 1) Progression across visits: per-exercise suggestion progress / hold / regress vs the previous visit's accepted HEP.
 *    Defaults are sourced (MIC: Ostelo 2008, MacDermid 2009; pain-monitoring model: Silbernagel 2007) or marked 'clinic default (unsourced)'.
 *    Uses ENGINE_LIBRARY phase order + rx text. Clinician accepts/overrides each line; nothing changes automatically.
 * 2) Branded HEP PDF (letterhead from chiroclinic_profile, first name only, date, exercises + images + dose + description, ice/heat).
 * 3) WhatsApp share: Web Share API with the PDF where supported, else download PDF + open wa.me text link. Never auto-sends.
 */
(function () {
  'use strict';
  // ---------- SOURCED DEFAULTS (sign-off sheet section A records every source) ----------
  var HEP_THRESHOLDS = {
    vasImprovedBy: 2,      // NRS/VAS 0-10 MIC = 2 points (Ostelo et al. Spine 2008 consensus)
    vasWorsenedBy: 2,      // clinic default (unsourced): MIC applied in reverse
    ndiImprovedBy: 14,     // NDI CID ~7/50 = 14 % points (MacDermid et al. JOSPT 2009, key point 5)
    ndiWorsenedBy: 10,     // NDI MDC ~5/50 = 10 % points (MacDermid et al. 2009, key point 4): change beyond measurement error
    odiImprovedBy: 10,     // ODI MIC = 10 points of 100 (Ostelo et al. 2008)
    odiWorsenedBy: 10,     // clinic default (unsourced): MIC applied in reverse
    pmMaxPainDuring: 5,    // pain-monitoring model: pain during exercise allowed up to 5/10 (Silbernagel et al. AJSM 2007)
    pmMaxPainAfter: 5      // pain after exercise up to 5/10, must settle by next morning; no week-to-week increase (Silbernagel 2007)
  };
  try { var ov = JSON.parse(localStorage.getItem('chiroclinic_hep_thresholds') || 'null'); if (ov) Object.keys(HEP_THRESHOLDS).forEach(function (k) { if (typeof ov[k] === 'number') HEP_THRESHOLDS[k] = ov[k]; }); } catch (e) {}
  var PHASES = ['acute', 'early_subacute', 'subacute', 'chronic']; // 'flare' handled as regress trigger
  var REGION_LABEL = { cs: 'Cervical', ts: 'Thoracic', ls: 'Lumbar', pelvis: 'Pelvis/SI', hip: 'Hip', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist/Fingers', knee: 'Knee', ankle: 'Ankle/Foot' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lib() { return window.CC_ENGINE_LIBRARY || []; }
  function findEx(name) { return lib().filter(function (e) { return e.name === name; })[0] || null; }
  function minPhase(ex) { var t = (ex && ex.phase) || []; var idx = t.map(function (p) { return PHASES.indexOf(p); }).filter(function (i) { return i >= 0; }); return idx.length ? Math.min.apply(null, idx) : -1; }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function curRegion() { try { return APP.currentRegion || (APP.activeRegions || [])[0] || ''; } catch (e) { return ''; } }

  // ---------- previous visit / inputs ----------
  function visits() { try { var a = window.CCData.all(); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function prevHepVisit(region) {
    var pid = window.EHR && EHR.currentPatientId, cur = window.EHR && EHR.currentVisitId;
    var date = ($('visitDate') || {}).value || '9999';
    var list = ((pid && window.CCData.forPatient(pid)) || visits()).filter(function (v) { return v && (!pid || v.patientId === pid) && (v.visitId || v.id) !== cur && String((v.visit || {}).date || '') <= date && prevHep(v, region).length; });
    list.sort(function (a, b) { return String((a.visit || {}).date).localeCompare(String((b.visit || {}).date)); });
    return list[list.length - 1] || null;
  }
  function prevHep(v, region) {
    if (v.p4Hep && v.p4Hep.region === region && (v.p4Hep.lines || []).length) return v.p4Hep.lines.filter(function (l) { return l.decision && l.decision.action !== 'stop'; }).map(function (l) { return { name: l.decision.name, rx: l.decision.rx }; });
    var p = v.p1Plan && v.p1Plan[region]; return p && p.hep ? p.hep.map(function (h) { return { name: h.name, rx: h.rx }; }) : [];
  }
  function currentOutcomes() { try { return P1Outcomes.snapshot(); } catch (e) { return {}; } }
  function delta(a, b) { return (a == null || b == null || isNaN(a) || isNaN(b)) ? null : Math.round((a - b) * 10) / 10; }
  function trend(inputs) {
    var T = HEP_THRESHOLDS, checks = [['vas', 'vasImprovedBy', 'vasWorsenedBy'], ['ndi', 'ndiImprovedBy', 'ndiWorsenedBy'], ['odi', 'odiImprovedBy', 'odiWorsenedBy']];
    var anyEval = false, worse = false, better = false, missing = [];
    checks.forEach(function (c) { var d = inputs.deltas[c[0]]; if (d == null) return;
      if (T[c[1]] == null || T[c[2]] == null) { missing.push(c[1] + '/' + c[2]); return; }
      anyEval = true; if (d >= T[c[2]]) worse = true; else if (d <= -T[c[1]]) better = true; });
    if (!anyEval) return { trend: 'unknown', reason: missing.length ? 'thresholds not set (' + missing.join(', ') + ')' : 'no comparable scores on both visits' };
    return { trend: worse ? 'worse' : better ? 'improving' : 'unchanged', reason: '' };
  }
  // Pain-monitoring model (Silbernagel 2007): acceptable = during <= 5/10, after <= 5/10 and settled by next morning, no week-to-week increase.
  function painMonitor(pm) {
    pm = pm || {}; var T = HEP_THRESHOLDS, have = pm.during != null || pm.after != null || pm.settledNextMorning != null || pm.worseWeekToWeek != null;
    if (!have) return { status: 'not recorded', reasons: [] };
    var r = [];
    if (pm.during != null && pm.during > T.pmMaxPainDuring) r.push('pain during exercise ' + pm.during + '/10 > ' + T.pmMaxPainDuring);
    if (pm.after != null && pm.after > T.pmMaxPainAfter) r.push('pain after exercise ' + pm.after + '/10 > ' + T.pmMaxPainAfter);
    if (pm.settledNextMorning === false) r.push('not settled by next morning');
    if (pm.worseWeekToWeek === true) r.push('pain/stiffness increasing week to week');
    return { status: r.length ? 'exceeded' : 'acceptable', reasons: r };
  }
  function pmFromUI() { var n = function (id) { var e = $(id); return e && e.value !== '' ? +e.value : null; }, b = function (id) { var e = $(id); return e && e.value !== '' ? e.value === 'yes' : null; };
    return { during: n('p4PmDuring'), after: n('p4PmAfter'), settledNextMorning: b('p4PmSettled'), worseWeekToWeek: b('p4PmWorse') }; }

  function inputs(region) {
    var pv = prevHepVisit(region); if (!pv) return null;
    var o = currentOutcomes(), po = pv.outcomes || {}, ps = po.scores || {}, cs = o.scores || {};
    var D = (APP.examData && APP.examData[region]) || {}, PD = (pv.examData && pv.examData[region]) || {};
    var pm = (APP.p4PainMonitor) || null;
    return { painMonitoring: pm, prevVisitId: pv.visitId || pv.id, prevDate: (pv.visit || {}).date, prevHep: prevHep(pv, region), phase: D.phase || '', prevPhase: PD.phase || '',
      vas: o.vas, prevVas: po.vas, deltas: { vas: delta(o.vas, po.vas), ndi: delta(cs.ndi, ps.ndi), odi: delta(cs.odi, ps.odi) } };
  }
  // Dose step when no next/previous-phase variant exists — clinic default (unsourced): sets +/-1 when the rx starts 'N x', else reps +/-2.
  function doseStep(rx, dir) {
    rx = String(rx || ''); var m = rx.match(/^(\s*)(\d+)(\s*x\s*)/i);
    if (m) { var n = Math.max(1, +m[2] + dir); return n === +m[2] ? null : rx.replace(m[0], m[1] + n + m[3]); }
    var r = rx.match(/(\d+)(?:\s*-\s*(\d+))?(\s*(?:slow\s+)?reps)/i);
    if (r) { var a = Math.max(1, +r[1] + 2 * dir), b = r[2] != null ? Math.max(1, +r[2] + 2 * dir) : null; var rep = a + (b != null ? '-' + b : '') + r[3]; return rep === r[0] ? null : rx.replace(r[0], rep); }
    return null;
  }
  function candidates(ex, region) { var lab = REGION_LABEL[region]; return lib().filter(function (e) { return e !== ex && e.region === (ex ? ex.region : lab) && (!ex || e.cat === ex.cat); }); }
  function suggest(line, inp, region) {
    var ex = findEx(line.name), ph = inp.phase, phi = PHASES.indexOf(ph), tr = trend(inp), pm = painMonitor(inp.painMonitoring);
    var base = { from: line.name, fromRx: line.rx || (ex && ex.rx) || '' };
    var why = ['outcome trend: ' + tr.trend + (tr.reason ? ' (' + tr.reason + ')' : ''), 'pain-monitoring: ' + pm.status + (pm.reasons.length ? ' (' + pm.reasons.join('; ') + ')' : ''), 'phase: ' + (inp.prevPhase || '?') + ' → ' + (ph || '?')];
    var phaseBack = phi >= 0 && PHASES.indexOf(inp.prevPhase) > phi, action;
    if (ph === 'flare' || tr.trend === 'worse' || pm.status === 'exceeded' || phaseBack) action = 'regress';
    else if (tr.trend === 'improving' && pm.status !== 'exceeded') action = 'progress';
    else action = 'hold';
    var target = null, mp = minPhase(ex);
    if (ex && action === 'progress') target = candidates(ex, region).filter(function (e) { return minPhase(e) > mp && (phi < 0 || e.phase.indexOf(ph) >= 0 || minPhase(e) === phi + 1); }).sort(function (a, b) { return minPhase(a) - minPhase(b); })[0] || null;
    if (ex && action === 'regress') target = candidates(ex, region).filter(function (e) { return minPhase(e) >= 0 && minPhase(e) < mp && (ph === 'flare' ? e.phase.indexOf('flare') >= 0 || minPhase(e) === 0 : true); }).sort(function (a, b) { return minPhase(b) - minPhase(a); })[0] || null;
    var s;
    if (action === 'hold') s = { action: 'hold', name: line.name, rx: base.fromRx, note: 'Keep exercise and dose' };
    else if (target) s = { action: action, name: target.name, rx: target.rx, note: (action === 'progress' ? 'Next-phase variant' : 'Earlier-phase variant') + ' (ENGINE_LIBRARY phase order acute > early_subacute > subacute > chronic)' };
    else { var nrx = doseStep(base.fromRx, action === 'progress' ? 1 : -1);
      s = nrx ? { action: action, name: line.name, rx: nrx, doseChange: true, note: (action === 'progress' ? 'No next-phase variant — dose step up' : 'No earlier-phase variant — dose step down') + ' (sets ±1 or reps ±2, clinic default)' }
              : { action: action, name: line.name, rx: base.fromRx, doseChange: true, note: 'No variant and dose text not steppable — adjust dose manually' }; }
    if (!ex) s.note += ' [exercise not in ENGINE_LIBRARY — no phase tags]';
    return Object.assign(base, { suggested: s, why: why.join(' · ') });
  }
  function buildSuggestions(region) {
    region = region || curRegion(); var inp = inputs(region); if (!inp) return null;
    return { region: region, inputs: inp, thresholds: JSON.parse(JSON.stringify(HEP_THRESHOLDS)), lines: inp.prevHep.map(function (l) { return suggest(l, inp, region); }) };
  }

  // ---------- progression panel ----------
  var pending = null;
  function openPanel(region) {
    pending = buildSuggestions(region);
    var old = $('p4HepPanel'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'p4HepPanel';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:20px';
    if (!pending) { m.innerHTML = '<div style="background:#fff;padding:16px;border-radius:8px;max-width:520px">No previous visit with an accepted HEP for this patient/region. <button type="button" id="p4Close">Close</button></div>'; document.body.appendChild(m); $('p4Close').onclick = function () { m.remove(); }; return null; }
    var I = pending.inputs;
    var opts = function (sel) { return ['progress', 'hold', 'regress', 'stop'].map(function (a) { return '<option' + (a === sel ? ' selected' : '') + '>' + a + '</option>'; }).join(''); };
    m.innerHTML = '<div style="background:#fff;padding:16px;border-radius:8px;max-width:900px;width:100%"><h3 style="margin:0 0 6px">HEP progression — ' + esc(REGION_LABEL[pending.region] || pending.region) + ' <span style="font-size:11px;color:#2B5F5C">suggestions only — you decide each line</span></h3>' +
      '<div style="font-size:12px">Previous HEP: ' + esc(I.prevDate) + ' · VAS ' + (I.prevVas == null ? '—' : I.prevVas) + ' → ' + (I.vas == null ? '—' : I.vas) + ' (Δ ' + (I.deltas.vas == null ? '—' : I.deltas.vas) + ') · NDI Δ ' + (I.deltas.ndi == null ? '—' : I.deltas.ndi) + ' · ODI Δ ' + (I.deltas.odi == null ? '—' : I.deltas.odi) + ' · phase ' + esc(I.prevPhase || '?') + ' → ' + esc(I.phase || '?') + '</div>' +
      '<div style="font-size:11px;color:#555;margin:4px 0">Rules: improving/worse by MIC (VAS 2, NDI 14%, ODI 10) · pain-monitoring model (≤5/10 during and after, settled next morning, no week-to-week increase).</div>' +
      '<table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th align="left">Previous exercise / dose</th><th align="left">Suggestion</th><th align="left">Your decision</th></tr>' +
      pending.lines.map(function (l, i) { var s = l.suggested; return '<tr class="p4-line" data-i="' + i + '" style="border-top:1px solid #ddd;vertical-align:top"><td>' + esc(l.from) + '<br><span style="color:#666">' + esc(l.fromRx) + '</span></td>' +
        '<td><b class="p4-sugg">' + esc(s.action.toUpperCase()) + '</b>: ' + esc(s.name) + '<br><span style="color:#666">' + esc(s.rx) + '</span><br><span style="font-size:10px;color:#666">' + esc(s.note) + ' · ' + esc(l.why) + '</span></td>' +
        '<td><select class="p4-act">' + opts(s.action) + '</select><br><input class="p4-name" style="width:100%" value="' + esc(s.name) + '"><br><input class="p4-rx" style="width:100%" value="' + esc(s.rx) + '" placeholder="dose"></td></tr>'; }).join('') +
      '</table><div style="margin-top:8px;font-size:12px">Decided by <input id="p4By" value="' + esc((window.loadProfile ? loadProfile().name : '') || '') + '"> <button type="button" id="p4Apply" style="background:#2B5F5C;color:#fff;padding:6px 12px;border-radius:6px">Record decisions</button> <button type="button" id="p4Cancel">Cancel</button></div></div>';
    document.body.appendChild(m);
    $('p4Cancel').onclick = function () { m.remove(); pending = null; };
    $('p4Apply').onclick = function () { record(); m.remove(); };
    return pending;
  }
  function record() {
    if (!pending) return null;
    var rows = document.querySelectorAll('#p4HepPanel .p4-line');
    var lines = pending.lines.map(function (l, i) { var r = rows[i], d = { action: r.querySelector('.p4-act').value, name: r.querySelector('.p4-name').value.trim(), rx: r.querySelector('.p4-rx').value.trim() };
      var s = l.suggested, accepted = d.action === s.action && d.name === s.name && d.rx === s.rx;
      return { from: l.from, fromRx: l.fromRx, suggested: s, why: l.why, decision: d, accepted: accepted, overridden: !accepted }; });
    APP.p4Hep = { painMonitoring: pending.inputs.painMonitoring, region: pending.region, decidedAt: new Date().toISOString(), decidedBy: (($('p4By') || {}).value || '').trim(), prevVisitId: pending.inputs.prevVisitId, inputs: pending.inputs, thresholds: pending.thresholds, rulesStatus: 'sourced-defaults-v1', lines: lines };
    pending = null; toast('HEP decisions recorded — save the visit to store them');
    return APP.p4Hep;
  }

  // ---------- HEP content for PDF / share ----------
  function hepLines() {
    if (APP.p4Hep && (APP.p4Hep.lines || []).length) return APP.p4Hep.lines.filter(function (l) { return l.decision.action !== 'stop' && l.decision.name; }).map(function (l) { return { name: l.decision.name, rx: l.decision.rx }; });
    try { return getSelectedExercises().map(function (x) { return { name: String(x.name || '').replace(/Recommended/gi, '').replace(/\s*🖼\s*Image/g, '').replace(/\s+/g, ' ').trim(), rx: x.rx }; }); } catch (e) { return []; }
  }
  function loadJpeg(src) {
    return new Promise(function (res) { if (!src) return res(null); var im = new Image(); im.onload = function () { try { var mx = 360, sc = Math.min(1, mx / Math.max(im.naturalWidth, im.naturalHeight)); var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * sc)); c.height = Math.max(1, Math.round(im.naturalHeight * sc));
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); res({ data: atob(c.toDataURL('image/jpeg', 0.82).split(',')[1]), w: c.width, h: c.height }); } catch (e) { res(null); } };
      im.onerror = function () { res(null); }; im.src = src; });
  }
  function iceHeat() {
    var d = $('ihDescription'), txt = d ? (d.innerText || d.textContent || '').trim() : '', img = $('ihImage');
    var include = ($('p4IncIce') || { checked: true }).checked;
    return include && txt ? { text: ((($('ihModality') || {}).value || '') + ' — ' + (($('ihArea') || {}).value || '') + '\n' + txt).trim(), src: img && img.style.display !== 'none' ? img.src : null } : null;
  }
  async function collect() {
    var lines = hepLines(), out = [];
    for (var i = 0; i < lines.length; i++) { var n = lines[i].name, src = null; try { src = resolveExerciseImage(n); } catch (e) {}
      var desc = ''; try { desc = getExerciseDescription(n) || ''; } catch (e) {} var ex = findEx(n);
      out.push({ name: n, rx: lines[i].rx || (ex && ex.rx) || '', desc: desc, cue: ex && ex.caution ? ex.caution : '', img: await loadJpeg(src) }); }
    var ih = iceHeat(); if (ih) ih.img = await loadJpeg(ih.src);
    return { firstName: ((($('ptFirstName') || {}).value) || '').trim(), date: (($('visitDate') || {}).value) || localISODate(), exercises: out, iceHeat: ih, profile: window.loadProfile ? loadProfile() : {} };
  }

  // ---------- PDF (multi-image JPEG; reuses toLatin1 from index.html) ----------
  function L1(t) { try { return toLatin1(String(t)); } catch (e) { return String(t).replace(/[^\x20-\x7E\n]/g, '?'); } }
  function pdfEsc(t) { return L1(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  function wrap(text, maxW, size) { var mc = Math.floor(maxW / (size * 0.5)), out = []; String(text || '').split('\n').forEach(function (p) { if (!p) { out.push(''); return; } while (p.length) { if (p.length <= mc) { out.push(p); break; } var c = p.lastIndexOf(' ', mc); if (c <= 0) c = mc; out.push(p.slice(0, c)); p = p.slice(c).replace(/^\s+/, ''); } }); return out; }
  function buildPdf(H) {
    var pw = 595.28, ph = 841.89, ml = 50, tw = pw - 100, pages = [], s = '', y = 0, imgs = [], P = H.profile || {};
    function rgb(r, g, b) { return (r / 255).toFixed(3) + ' ' + (g / 255).toFixed(3) + ' ' + (b / 255).toFixed(3); }
    function txt(t, x, yy, sz, font, col) { s += 'BT /' + (font || 'F1') + ' ' + sz + ' Tf ' + (col || '0 0 0') + ' rg ' + x.toFixed(2) + ' ' + (ph - yy).toFixed(2) + ' Td (' + pdfEsc(t) + ') Tj ET\n'; }
    function rect(x, yy, w, h, col) { s += col + ' rg ' + x.toFixed(2) + ' ' + (ph - yy - h).toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f\n'; }
    function header() {
      rect(0, 0, pw, 74, rgb(43, 95, 92));
      txt(P.name || '', ml, 30, 16, 'F2', '1 1 1'); txt([P.quals, P.prNo ? 'Pr ' + P.prNo : ''].filter(Boolean).join(' · '), ml, 46, 9, 'F1', '1 1 1');
      var c = [P.melkbosAddr, P.melkbosPhone || P.mobile, P.melkbosEmail || P.email].filter(Boolean).join(' · '); if (c) txt(c, ml, 60, 8, 'F1', '1 1 1');
      y = 96;
    }
    function page() { if (s) pages.push(s); s = ''; header(); }
    function need(h) { if (y + h > ph - 50) page(); }
    function para(t, sz, font, col, ind) { wrap(t, tw - (ind || 0), sz).forEach(function (l) { need(sz + 4); y += sz; txt(l, ml + (ind || 0), y, sz, font, col); y += 4; }); }
    function image(im, maxW, maxH, x) { var sc = Math.min(maxW / im.w, maxH / im.h, 1), w = im.w * sc, h = im.h * sc; need(h + 6); var nm = 'Im' + (imgs.length + 1); imgs.push(im);
      s += 'q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + (x || ml).toFixed(2) + ' ' + (ph - y - h).toFixed(2) + ' cm /' + nm + ' Do Q\n'; y += h + 6; }
    page();
    txt('Home Exercise Programme', ml, y, 15, 'F2', rgb(43, 95, 92)); y += 20;
    txt('For: ' + (H.firstName || 'Patient') + '      Date: ' + H.date, ml, y, 10); y += 18;
    H.exercises.forEach(function (e, i) { need(40); txt((i + 1) + '. ' + e.name, ml, y, 12, 'F2'); y += 16;
      if (e.img) image(e.img, 200, 150, ml + 10);
      if (e.rx) para('Dose: ' + e.rx, 10, 'F2', '0 0 0', 10);
      if (e.desc) para(e.desc, 9.5, 'F1', '0.15 0.15 0.15', 10);
      if (e.cue) para('Cue / caution: ' + e.cue, 9.5, 'F1', '0.45 0.1 0.1', 10); y += 6; });
    if (!H.exercises.length) para('(No exercises selected)', 10);
    if (H.iceHeat) { need(40); txt('Ice / heat instructions', ml, y, 12, 'F2', rgb(43, 95, 92)); y += 16; if (H.iceHeat.img) image(H.iceHeat.img, 180, 140, ml + 10); para(H.iceHeat.text, 9.5, 'F1', '0 0 0', 10); }
    y += 8; para('Stop any exercise that causes sharp or increasing pain, numbness or tingling, and contact the practice.', 8.5, 'F1', '0.4 0.4 0.4');
    pages.push(s);
    // assemble objects
    var objs = [], N = function (b) { objs.push(b); return objs.length; };
    N('<< /Type /Catalog /Pages 2 0 R >>'); N('PAGES'); N('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); N('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var imgIds = imgs.map(function (im) { return N({ stream: im.data, dict: '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.data.length + ' >>' }); });
    var xo = imgIds.map(function (id, i) { return '/Im' + (i + 1) + ' ' + id + ' 0 R'; }).join(' ');
    var kids = pages.map(function (st) { var c = N({ stream: st, dict: '<< /Length ' + st.length + ' >>' }); return N('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ' + xo + ' >> >> /Contents ' + c + ' 0 R >>'); });
    objs[1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';
    var out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', off = [];
    objs.forEach(function (o, i) { off.push(out.length); out += (i + 1) + ' 0 obj\n' + (typeof o === 'string' ? o : o.dict + '\nstream\n' + o.stream + '\nendstream') + '\nendobj\n'; });
    var xr = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(function (o) { return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
    var bytes = new Uint8Array(out.length); for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return { bytes: bytes, pages: pages.length, images: imgs.length };
  }
  function fileName(H) { return 'HEP_' + (H.firstName || 'Patient').replace(/[^A-Za-z0-9]/g, '') + '_' + H.date + '.pdf'; }
  async function makePdf() { var H = await collect(), r = buildPdf(H); var blob = new Blob([r.bytes], { type: 'application/pdf' }); return { H: H, blob: blob, name: fileName(H), pages: r.pages, images: r.images }; }
  function download(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  async function downloadPdf() { var p = await makePdf(); download(p.blob, p.name); toast('HEP PDF downloaded'); return p; }

  // ---------- WhatsApp ----------
  function shareMessage(H) { var P = H.profile || {}; return 'Hi ' + (H.firstName || 'there') + ', here is your home exercise programme from ' + (P.name || 'the practice') + ' (' + H.date + '). Please see the attached PDF.'; }
  function waNumber() { var p = String((($('ptPhone') || {}).value) || '').replace(/[^\d+]/g, ''); if (!p) return ''; if (p[0] === '+') p = p.slice(1); else if (p[0] === '0') p = '27' + p.slice(1); return /^\d{9,15}$/.test(p) ? p : ''; }
  function waLink(msg) { var n = waNumber(); return 'https://wa.me/' + n + '?text=' + encodeURIComponent(msg); }
  async function shareWhatsApp() {
    var p = await makePdf(), msg = shareMessage(p.H), file = new File([p.blob], p.name, { type: 'application/pdf' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ title: 'Home exercise programme', text: msg, files: [file] }); toast('Share sheet opened — choose WhatsApp'); return { mode: 'share', msg: msg }; }
    } catch (e) { if (e && e.name === 'AbortError') return { mode: 'cancelled', msg: msg }; }
    download(p.blob, p.name); var url = waLink(msg);
    window.open(url, '_blank', 'noopener'); toast('PDF downloaded — attach it in WhatsApp (nothing is sent automatically)');
    return { mode: 'wa.me', msg: msg, url: url };
  }

  // ---------- UI hooks ----------
  function injectButtons() {
    var sec = $('sec-exercises'); if (!sec || $('p4Bar')) return;
    var bar = document.createElement('div'); bar.id = 'p4Bar'; bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0;padding:8px;border:1px dashed #2B5F5C;border-radius:8px';
    bar.innerHTML = '<button type="button" id="p4Prog" class="ehr-mini-btn">↗ HEP progression (follow-up)</button><button type="button" id="p4Pdf" class="ehr-mini-btn">📄 Branded HEP PDF</button><button type="button" id="p4Wa" class="ehr-mini-btn">💬 WhatsApp HEP</button><label style="font-size:12px"><input type="checkbox" id="p4IncIce" checked style="width:auto"> include ice/heat</label>' +
      '<div style="width:100%;font-size:12px">Since last visit (pain-monitoring): pain during HEP <input id="p4PmDuring" type="number" min="0" max="10" style="width:48px">/10 · after <input id="p4PmAfter" type="number" min="0" max="10" style="width:48px">/10 · settled by next morning <select id="p4PmSettled"><option value="">—</option><option>yes</option><option>no</option></select> · worse week to week <select id="p4PmWorse"><option value="">—</option><option>yes</option><option>no</option></select></div>';
    var list = $('exerciseList'); if (list && list.parentNode) list.parentNode.insertBefore(bar, list); else sec.insertBefore(bar, sec.firstChild);
    ['p4PmDuring', 'p4PmAfter', 'p4PmSettled', 'p4PmWorse'].forEach(function (id) { $(id).onchange = $(id).oninput = function () { APP.p4PainMonitor = pmFromUI(); }; });
    $('p4Prog').onclick = function () { APP.p4PainMonitor = pmFromUI(); openPanel(); }; $('p4Pdf').onclick = function () { downloadPdf(); }; $('p4Wa').onclick = function () { shareWhatsApp(); };
  }
  function hookAll() {
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p4) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { d.p4Hep = APP.p4Hep || null; d.p4PainMonitor = APP.p4PainMonitor || null; } catch (e) {} return d; }; window.gatherAllData._p4 = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p4) { var r = window.restoreData; window.restoreData = function (d) { var x = r.apply(this, arguments); try { APP.p4Hep = (d && d.p4Hep) || null; APP.p4PainMonitor = (d && d.p4PainMonitor) || null; } catch (e) {} return x; }; window.restoreData._p4 = 1; }
  }
  function init() { hookAll(); injectButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); }); else setTimeout(init, 0);
  window.addEventListener('load', function () { setTimeout(init, 350); });
  window.P1Hep = { HEP_THRESHOLDS: HEP_THRESHOLDS, PHASES: PHASES, trend: trend, painMonitor: painMonitor, doseStep: doseStep, inputs: inputs, buildSuggestions: buildSuggestions, suggest: suggest, openPanel: openPanel, record: record,
    collect: collect, buildPdf: buildPdf, makePdf: makePdf, downloadPdf: downloadPdf, shareMessage: shareMessage, waLink: waLink, shareWhatsApp: shareWhatsApp, hepLines: hepLines };
})();
