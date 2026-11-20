/* ChiroClinic P1 item 1 — Exam -> Diagnosis -> Plan in one flow (PREVIEW).
 * After confirmFormulatedDx(region) succeeds, opens an editable "Draft plan" panel:
 *   - phase (acute / early_subacute / subacute / chronic / flare), suggested from onset/duration
 *   - drafted S/O/A/P from exam findings (editable)
 *   - suggested HEP from the existing ENGINE_LIBRARY filtered by region + ICD-10 prefix + phase
 * Nothing is written to the visit until the clinician taps "Accept plan".
 *
 * CLINICAL RULES BELOW ARE PLACEHOLDERS (P1_RULES_NEED_SOURCE).
 * They need a clinical source Theunis signs off on before clinical use. No citations are implied.
 */
(function () {
  'use strict';
  var RULES_STATUS = 'rules 5–6 set by Theunis (2026-10-15); all other rules on trial, not yet approved — phase cut-offs, HEP size and ranking are clinic default (unsourced)'; // P1 latest v1: accurate status (docs/P1_ITEM1_CLINICAL_RULES_SIGNOFF.md) replaces the placeholder label

  // PLACEHOLDER: exam region key -> ENGINE_LIBRARY region label(s)
  var REGION_MAP = {
    cs: ['Cervical'], ts: ['Thoracic'], ls: ['Lumbar'], hip: ['Hip'], knee: ['Knee'],
    ankle: ['Ankle/Foot'], shoulder: ['Shoulder'], elbow: ['Elbow'], wrist: ['Wrist/Fingers'],
    pelvis: ['Pelvis/SI']
  };
  // PLACEHOLDER: parse free-text duration/onset into weeks. Returns {flare:bool, weeks:number|null}.
  function parseDuration(txt) {
    txt = String(txt || '').toLowerCase();
    var n = parseFloat((txt.match(/(\d+(\.\d+)?)/) || [])[1]);
    var flare = /flare/.test(txt);
    if (isNaN(n)) return { flare: flare, weeks: null };
    var weeks = /day/.test(txt) ? n / 7 : /month|mnth/.test(txt) ? n * 4.3 : /year|yr/.test(txt) ? n * 52 : n;
    return { flare: flare, weeks: weeks };
  }
  function phaseFromWeeks(weeks) {
    if (weeks < 2) return 'acute';            // PLACEHOLDER cut-off
    if (weeks < 6) return 'early_subacute';   // PLACEHOLDER cut-off
    if (weeks < 12) return 'subacute';        // PLACEHOLDER cut-off
    return 'chronic';
  }
  // Rule 5 (changed by Theunis 2026-10-15): no number found -> null (ask the clinician), no default.
  // BUG FIX v3: pcOnset is <input type="date">; its "2026-09-01" was being read as 2026 weeks -> chronic.
  // A date-format onset is now ignored by the parser (no number -> ask). Using the onset date is an open question for Theunis.
  function durationText() {
    var on = val('pcOnset'); if (/^\d{4}-\d{2}-\d{2}$/.test(on)) on = '';
    return (val('pcDuration') + ' ' + on).trim();
  }
  function suggestPhase(txt) {
    var d = parseDuration(txt != null ? txt : durationText());
    if (d.flare) return 'flare';
    if (d.weeks == null) return null;
    return phaseFromWeeks(d.weeks);
  }
  var MAX_HEP = 5; // PLACEHOLDER

  function val(id) { var e = document.getElementById(id); return e ? (e.value || '') : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function regionName(r) { return (typeof REGIONS !== 'undefined' && REGIONS[r] && REGIONS[r].name) || (typeof REGIONS !== 'undefined' && REGIONS[r] && REGIONS[r].name) || r; }
  function examData(r) { try { return (APP.examData && APP.examData[r]) || {}; } catch (e) { return {}; } }

  function draftSoap(region) {
    var D = examData(region), S = [], O = [], A = [], P = [];
    var cr = val('pcRegion'), side = val('pcSide');
    if (cr) S.push('Presents with ' + cr + (side ? ' (' + side + ')' : '') + ' complaint' +
      (val('pcOnset') ? ', onset ' + val('pcOnset') : '') + (val('pcDuration') ? ', duration ' + val('pcDuration') : '') + '.');
    if (D.vas != null && D.vas !== '') S.push('Pain VAS ' + D.vas + '/10.');
    if (D.quality && D.quality.length) S.push('Quality: ' + D.quality.join(', ') + '.');
    var rom = [], ortho = [], neuro = [];
    Object.keys(D).forEach(function (k) {
      var v = D[k]; if (v === '' || v == null || v === '—') return;
      if (/^rom[AP]_/.test(k)) return; // ROM is written below from ROMDATA (movement names, R/L, pain only when recorded Yes)
      else if (k.indexOf('ort_R_') === 0 || k.indexOf('ort_L_') === 0) ortho.push(k.slice(6) + ' ' + k.charAt(4) + ' ' + v);
      else if (/^(myo|ref)_[RL]_/.test(k)) neuro.push(k.slice(6) + ' ' + k.charAt(4) + ' ' + v);
    });
    var romReg = region || '';
    if (typeof ROMDATA !== 'undefined') { ROMDATA.entries(romReg, D, 'A').forEach(function (e) { rom.push(ROMDATA.text(e)); });
      var romP = ROMDATA.entries(romReg, D, 'P').map(function (e) { return ROMDATA.text(e); }); }
    if (rom.length) O.push('Active ROM: ' + rom.join(', ') + '.');
    if (romP && romP.length) O.push('Passive ROM: ' + romP.join(', ') + '.');
    if (ortho.length) O.push('Orthopaedic tests: ' + ortho.join('; ') + '.');
    if (neuro.length) O.push('Neuro: ' + neuro.join('; ') + '.');
    if (D.palpNotes) O.push('Palpation: ' + D.palpNotes);
    var dx = D.formulatedCondition || D.primaryDx || '';
    var code = D.formulatedIcd10 || D.icd10 || '';
    if (dx) A.push(regionName(region) + ': ' + dx + (code ? ' (' + code + ')' : '') + '.');
    var ddx = (D.ddxList || []).filter(function (x) { return x && !x.dismissed; }).map(function (x) { return x.label || x.name || x.text || ''; }).filter(Boolean);
    if (ddx.length) A.push('DDx considered: ' + ddx.join(', ') + '.');
    if (D.clinicalImpression) A.push(D.clinicalImpression);
    if (D.planMod) P.push(D.planMod);
    return { S: S.join('\n'), O: O.join('\n') || '(no objective findings recorded — add before accepting)', A: A.join('\n'), P: P.join('\n') };
  }

  // Full catalog: ENGINE_LIBRARY (phase-tagged) first, then EXERCISES (no phase tag) as fallback.
  var CAT_KEYS = { stretch: 'stretch', strength: 'strength', mobility: 'mobility', nerve: 'nerve' };
  function untaggedCatalog(labels) {
    var out = [], seen = {};
    (window.CC_ENGINE_LIBRARY || []).forEach(function (e) { seen[e.name.toLowerCase()] = 1; });
    try {
      Object.keys(EXERCISES).forEach(function (cat) {
        labels.forEach(function (lab) {
          ((EXERCISES[cat] || {})[lab] || []).forEach(function (ex) {
            var k = String(ex.name || '').toLowerCase(); if (!k || seen[k]) return; seen[k] = 1;
            out.push({ name: ex.name, cat: CAT_KEYS[cat] || cat, region: lab, rx: ex.rx || '', untagged: true });
          });
        });
      });
    } catch (e) {}
    return out;
  }
  function suggestHep(region, phase, noIcd) {
    var lib = window.CC_ENGINE_LIBRARY || [];
    var D = examData(region), code = noIcd ? '' : String(D.formulatedIcd10 || D.icd10 || '').toUpperCase();
    var labels = REGION_MAP[region] || [];
    var tagged = lib.filter(function (ex) { return labels.indexOf(ex.region) >= 0 && (!ex.phase || ex.phase.indexOf(phase) >= 0); });
    // PLACEHOLDER ranking: ICD-10 prefix match first (skipped when no ICD-10), then category spread
    function score(ex) {
      var s = 0;
      (ex.codes || []).forEach(function (c) { c = String(c).toUpperCase(); if (code && (code.indexOf(c) === 0 || c.indexOf(code) === 0)) s = Math.max(s, c.length); });
      return s;
    }
    tagged.sort(function (a, b) { return score(b) - score(a); });
    var untagged = untaggedCatalog(labels);
    var out = [], cats = {};
    tagged.forEach(function (ex) { if (out.length < MAX_HEP && !cats[ex.cat]) { cats[ex.cat] = 1; out.push(ex); } });
    tagged.forEach(function (ex) { if (out.length < MAX_HEP && out.indexOf(ex) < 0) out.push(ex); });
    // Fallback only when phase-tagged picks do not fill the plan; always ranked below tagged
    untagged.forEach(function (ex) { if (out.length < MAX_HEP && !cats[ex.cat]) { cats[ex.cat] = 1; out.push(ex); } });
    return { picks: out, pool: tagged.concat(untagged) };
  }
  function findEx(name) {
    var lib = window.CC_ENGINE_LIBRARY || [];
    return lib.filter(function (e) { return e.name === name; })[0] ||
      untaggedCatalog(Object.keys(REGION_MAP).reduce(function (a, k) { return a.concat(REGION_MAP[k]); }, ['General Neural'])).filter(function (e) { return e.name === name; })[0] || { name: name };
  }

  var PHASES = ['acute', 'early_subacute', 'subacute', 'chronic', 'flare'];
  var current = null;

  function render() {
    var c = current, panel = document.getElementById('p1PlanPanel');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'p1PlanPanel';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Draft plan');
      panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 8px';
      document.body.appendChild(panel);
    }
    var needs = !c.phase;
    var hep = needs ? { picks: [], pool: [] } : suggestHep(c.region, c.phase, c.noIcd);
    if (!c.hepTouched) c.hepSel = hep.picks.map(function (e) { return e.name; });
    var rows = hep.pool.map(function (ex) {
      var on = c.hepSel.indexOf(ex.name) >= 0;
      return '<label style="display:flex;gap:8px;padding:4px 0;font-size:13px"><input type="checkbox" data-ex="' + esc(ex.name) + '"' + (on ? ' checked' : '') +
        '><span><b>' + esc(ex.name) + '</b> <span style="color:var(--text3,#777)">· ' + esc(ex.cat) + ' · ' + esc(ex.rx) + '</span>' + (ex.untagged ? ' <span style="font-size:10px;background:#888;color:#fff;border-radius:8px;padding:1px 6px">phase not tagged</span>' : '') + '</span></label>';
    }).join('') || (needs ? '<div id="p1NeedPhaseMsg" style="font-size:13px;color:#a00">Enter the duration or pick a phase to see exercise suggestions.</div>' : '<div style="font-size:13px;color:#a00">No library exercises match this region + phase. Pick manually in Exercises.</div>');
    function ta(k, lbl) { return '<label style="display:block;font-weight:700;font-size:12px;margin-top:8px">' + lbl + '</label><textarea data-soap="' + k + '" rows="3" style="width:100%;box-sizing:border-box;font:inherit;font-size:13px">' + esc(c.soap[k]) + '</textarea>'; }
    panel.innerHTML = '<div style="background:var(--card,#fff);color:var(--text,#222);max-width:720px;width:100%;border-radius:12px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Draft plan — ' + esc(regionName(c.region)) + '</h3>' +
      '<span style="font-size:11px;background:#E67E22;color:#fff;border-radius:10px;padding:2px 8px">DRAFT · not saved</span></div>' +
      (c.noIcd ? '<div id="p1NoIcd" style="font-size:12px;background:#C0392B;color:#fff;border-radius:6px;padding:6px 8px;margin:6px 0">⚠ No ICD-10 code — suggestions by region only. Diagnosis is NOT confirmed; the save gate will still require ICD-10.</div>' : '') + '<div style="font-size:11px;color:#a05a00;margin:6px 0">Mapping rules: ' + RULES_STATUS + '. Review everything.</div>' +
      (needs ? '<div id="p1NeedPhase" style="font-size:12px;background:#FFF3CD;color:#7a5200;border-radius:6px;padding:6px 8px;margin:6px 0">No duration/onset found. Enter the duration (e.g. 3 weeks) or pick a phase. <input id="p1Duration" placeholder="e.g. 3 weeks" style="width:120px"> <button type="button" id="p1DurationSet" class="btn btn-secondary">Use duration</button></div>' : '') +
      (c.phaseNote ? '<div id="p1PhaseNote" style="font-size:12px;background:#E8F4F3;color:#1f4f4c;border-radius:6px;padding:6px 8px;margin:6px 0">' + esc(c.phaseNote) + '</div>' : '') +
      '<label style="font-weight:700;font-size:12px">Phase</label> <select id="p1Phase">' + (needs ? '<option value="" selected>— pick phase —</option>' : '') + PHASES.map(function (p) { return '<option value="' + p + '"' + (p === c.phase ? ' selected' : '') + '>' + p.replace('_', ' ') + '</option>'; }).join('') + '</select>' +
      ' <span style="font-size:11px;color:var(--text3,#777)">suggested: ' + esc(c.suggested || 'none — needs duration') + '</span>' +
      ta('S', 'S — Subjective') + ta('O', 'O — Objective') + ta('A', 'A — Assessment') + ta('P', 'P — Plan') +
      '<div style="font-weight:700;font-size:12px;margin-top:10px">Suggested HEP (' + c.hepSel.length + ' selected)</div><div id="p1HepList" style="max-height:220px;overflow:auto">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" id="p1Discard" class="btn btn-secondary">Discard draft</button>' +
      '<button type="button" id="p1Accept" class="btn btn-primary"' + (needs ? ' disabled title="Enter duration or pick a phase first"' : '') + '>Accept plan</button></div></div>';
    panel.querySelectorAll('textarea[data-soap]').forEach(function (t) { t.oninput = function () { c.soap[t.dataset.soap] = t.value; c.soapTouched = true; }; });
    panel.querySelector('#p1Phase').onchange = function () { if (!this.value) return; c.phase = this.value; c.phaseSource = 'clinician'; c.hepTouched = false; render(); };
    var dBtn = panel.querySelector('#p1DurationSet');
    if (dBtn) dBtn.onclick = function () {
      var t = panel.querySelector('#p1Duration').value, ph = suggestPhase(t);
      if (!ph) { toast('Could not read a duration — enter e.g. "3 weeks" or pick a phase'); return; }
      c.durationText = t; c.anchorWeeks = parseDuration(t).weeks; c.phase = ph; c.suggested = ph; c.phaseSource = 'duration'; c.hepTouched = false; render();
    };
    panel.querySelectorAll('input[data-ex]').forEach(function (cb) {
      cb.onchange = function () { c.hepTouched = true; var n = cb.dataset.ex; c.hepSel = c.hepSel.filter(function (x) { return x !== n; }); if (cb.checked) c.hepSel.push(n); };
    });
    panel.querySelector('#p1Discard').onclick = function () { close(); toast('Draft discarded — nothing saved'); };
    panel.querySelector('#p1Accept').onclick = accept;
  }
  function close() { var p = document.getElementById('p1PlanPanel'); if (p) p.remove(); current = null; }
  function toast(m) { try { showToast(m); } catch (e) {} }

  // ---- Multi-region merge: one section per region, re-accept replaces only that region ----
  function composeVisitSoap() {
    var plans = APP.p1Plan || {}, order = (APP.activeRegions || []).slice();
    Object.keys(plans).forEach(function (r) { if (order.indexOf(r) < 0) order.push(r); });
    var base = APP.p1SoapBase || { S: '', O: '', A: '', P: '' }, out = {};
    ['S', 'O', 'A', 'P'].forEach(function (k) {
      var parts = base[k] ? [base[k]] : [];
      order.forEach(function (r) { var p = plans[r]; if (p && p.soap && p.soap[k]) parts.push('[' + regionName(r) + ']\n' + p.soap[k]); });
      out[k] = parts.join('\n\n');
    });
    APP.visitSoap = out;
    return out;
  }
  // ---- Exercise ticks: persistent set on top of the existing DOM checkbox selection ----
  function tickSet() { APP.p1HepTicks = APP.p1HepTicks || {}; return APP.p1HepTicks; }
  function applyTicks() {
    var set = tickSet();
    document.querySelectorAll('#exerciseList .exercise-card[data-ex]').forEach(function (card) {
      var ex = {}; try { ex = JSON.parse(decodeURIComponent(card.dataset.ex || '')); } catch (e) {}
      var cb = card.querySelector('.ex-select'); if (!cb) return;
      if (set[ex.name]) cb.checked = true;
      if (!cb._p1) { cb._p1 = 1; cb.addEventListener('change', function () { if (!cb.checked) delete tickSet()[ex.name]; }); }
    });
  }
  function hookExercises() {
    if (typeof window.renderExercises === 'function' && !window.renderExercises._p1) {
      var rEx = window.renderExercises;
      window.renderExercises = function () { var r = rEx.apply(this, arguments); try { applyTicks(); } catch (e) {} return r; };
      window.renderExercises._p1 = 1;
    }
    if (typeof window.getSelectedExercises === 'function' && !window.getSelectedExercises._p1) {
      var gSel = window.getSelectedExercises;
      window.getSelectedExercises = function () {
        var sel = gSel.apply(this, arguments) || [], have = {};
        sel.forEach(function (e) { have[e.name] = 1; });
        var set = tickSet();
        Object.keys(set).forEach(function (n) { if (!have[n]) sel.push({ name: n, rx: set[n].rx || '', cat: set[n].cat || '', fromPlan: set[n].region }); });
        return sel;
      };
      window.getSelectedExercises._p1 = 1;
    }
  }

  function accept() {
    var c = current; if (!c) return;
    if (!c.phase) { toast('Enter duration or pick a phase first'); return; }
    hookExercises();
    var hep = c.hepSel.map(function (n) { var ex = findEx(n); return { name: n, exerciseId: n, cat: ex.cat || '', rx: ex.rx || '', phaseTagged: !ex.untagged }; });
    var planTxt = c.soap.P + (hep.length ? (c.soap.P ? '\n' : '') + 'HEP (' + c.phase.replace('_', ' ') + '): ' + hep.map(function (h) { return h.name + (h.rx ? ' — ' + h.rx : '') + (h.phaseTagged ? '' : ' [phase not tagged]'); }).join('; ') : '');
    APP.p1Plan = APP.p1Plan || {};
    if (!Object.keys(APP.p1Plan).length && !APP.p1SoapBase) APP.p1SoapBase = APP.visitSoap ? JSON.parse(JSON.stringify(APP.visitSoap)) : null;
    // replace only this region's ticks
    var set = tickSet(), prev = APP.p1Plan[c.region];
    if (prev) (prev.hep || []).forEach(function (h) { if (set[h.name] && set[h.name].region === c.region) delete set[h.name]; });
    hep.forEach(function (h) { set[h.name] = { rx: h.rx, cat: h.cat, region: c.region }; });
    APP.p1Plan[c.region] = { phase: c.phase, suggestedPhase: c.suggested, soap: { S: c.soap.S, O: c.soap.O, A: c.soap.A, P: planTxt }, hep: hep,
      icd10Missing: !!c.noIcd, rulesStatus: 'placeholder', phaseNote: c.phaseNote || null,
      condition: c.condition, icd10: c.icd, onsetAnchorDate: c.anchorDate, onsetAnchorWeeks: c.anchorWeeks, onsetAnchorText: c.durationText || null, acceptedAt: new Date().toISOString(), confirmedBy: 'clinician' };
    var D = examData(c.region); D.phase = c.phase;
    D.onsetAnchorDate = c.anchorDate; D.onsetAnchorWeeks = c.anchorWeeks; D.onsetAnchorText = c.durationText || null; D.anchorCondition = c.condition; D.anchorIcd10 = c.icd;
    composeVisitSoap();
    // Show ticks in Exercises tab using the existing renderer
    try { var exR = document.getElementById('exRegion'), lab = (REGION_MAP[c.region] || [])[0]; if (exR && lab) exR.value = lab; renderExercises(); } catch (e) {}
    close();
    toast('Plan accepted — ' + regionName(c.region) + ' section + ' + hep.length + ' HEP exercises ticked' + (c.noIcd ? ' (no ICD-10 — confirm before saving)' : ' (save visit to store)'));
  }

  function norm(x) { return String(x || '').trim().toLowerCase(); }
  function weeksBetween(fromIso, to) { return Math.max(0, ((to || new Date()) - new Date(fromIso)) / (7 * 864e5)); }
  function open(region, noIcd, now) {
    var D = examData(region);
    var cEl = document.getElementById('dxCond_' + region);
    var cond = (cEl && cEl.value.trim()) || D.formulatedCondition || D.primaryDx || '';
    var icd = noIcd ? '' : String(D.formulatedIcd10 || D.icd10 || '');
    var prev = (APP.p1Plan && APP.p1Plan[region]) || null;
    // stored anchor: from this visit's plan, else from exam data carried on the region
    var anc = prev && prev.onsetAnchorDate ? prev : (D.onsetAnchorDate ? { condition: D.anchorCondition, icd10: D.anchorIcd10, phase: D.phase,
      onsetAnchorDate: D.onsetAnchorDate, onsetAnchorWeeks: D.onsetAnchorWeeks, onsetAnchorText: D.onsetAnchorText } : null);
    var same = anc && norm(anc.condition) === norm(cond) && (!anc.icd10 || !icd || norm(anc.icd10) === norm(icd));
    var c = { noIcd: !!noIcd, region: region, condition: cond, icd: icd, soap: draftSoap(region), hepSel: [], hepTouched: false };
    var durTxt = durationText();
    if (same) {
      // Rule 6 (changed by Theunis 2026-10-15): recompute phase from the anchor + weeks elapsed.
      c.anchorDate = anc.onsetAnchorDate; c.anchorWeeks = anc.onsetAnchorWeeks; c.durationText = anc.onsetAnchorText;
      var elapsed = weeksBetween(anc.onsetAnchorDate, now), was = anc.phase || null;
      if (anc.onsetAnchorWeeks != null) {
        var y = phaseFromWeeks(anc.onsetAnchorWeeks + elapsed);
        c.suggested = y; c.phase = y; c.phaseSource = 'recomputed';
        c.phaseNote = (was && was !== y ? 'Phase updated from ' + was.replace('_', ' ') + ' to ' + y.replace('_', ' ') : 'Phase unchanged: ' + y.replace('_', ' ')) +
          ' (' + Math.round(elapsed) + ' weeks since first visit). You can override below.';
      } else {
        // anchor had no duration (phase was picked by hand, or flare): keep it, clinician confirms
        c.suggested = was; c.phase = was;
        c.phaseNote = was ? 'Phase kept as ' + was.replace('_', ' ') + ' (no duration recorded at first visit, ' + Math.round(elapsed) + ' weeks ago). You can override below.' : null;
      }
    } else {
      // new or changed condition: suggest fresh and set a new anchor at this confirmation
      c.suggested = suggestPhase(); c.phase = c.suggested; c.phaseSource = 'fresh';
      c.anchorDate = D.dxConfirmedAt || new Date().toISOString();
      var pd = parseDuration(durTxt); c.anchorWeeks = pd.flare ? null : pd.weeks; c.durationText = durTxt || null;
      if (anc) c.phaseNote = 'Condition changed since last plan — phase suggested fresh.';
    }
    current = c;
    render();
  }

  var orig = window.confirmFormulatedDx;
  if (typeof orig === 'function') {
    window.confirmFormulatedDx = function (region) {
      var r = orig.apply(this, arguments);
      try { var D = examData(region); var cEl = document.getElementById('dxCond_' + region);
        var cond = (cEl && cEl.value.trim()) || D.formulatedCondition || D.primaryDx;
        if (D.dxConfirmed && (D.formulatedIcd10 || D.icd10)) open(region, false);
        else if (cond && !(D.icd10 || D.formulatedIcd10)) open(region, true); } catch (e) { console.warn('[P1 item1]', e); }
      return r;
    };
  }
  var origGather = window.gatherAllData;
  if (typeof origGather === 'function') {
    window.gatherAllData = function () { var d = origGather.apply(this, arguments); try { d.p1Plan = APP.p1Plan || null; d.visitSoap = APP.visitSoap || null; d.p1HepTicks = APP.p1HepTicks || null; d.p1SoapBase = APP.p1SoapBase || null; } catch (e) {} return d; };
  }
  var origRestore = window.restoreData;
  if (typeof origRestore === 'function') {
    window.restoreData = function (data) { var r = origRestore.apply(this, arguments); try { if (data && data.p1Plan) APP.p1Plan = data.p1Plan; if (data && data.visitSoap) APP.visitSoap = data.visitSoap; if (data && data.p1HepTicks) APP.p1HepTicks = data.p1HepTicks; if (data && data.p1SoapBase) APP.p1SoapBase = data.p1SoapBase; } catch (e) {} return r; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookExercises); else hookExercises();
  window.addEventListener('load', hookExercises);
  window.P1Item1 = { composeVisitSoap: composeVisitSoap, parseDuration: parseDuration, phaseFromWeeks: phaseFromWeeks, open: open, draftSoap: draftSoap, suggestHep: suggestHep, suggestPhase: suggestPhase, RULES_STATUS: RULES_STATUS };
})();
