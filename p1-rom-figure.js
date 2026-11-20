/* P1 item 10 — ROM figure (rebuild 2026-10-22 of the v16 figure; see REBUILD_NOTES.md).
 * Owned MakeHuman-based figure (CC0) replaces the ROM tables on screen; the tables stay behind a toggle and write the same
 * APP.examData keys (p1-rom-data.js). three.js, the meshopt decoder, rom-anat.js and the model are vendored and precached by sw.js,
 * so the figure works offline. No WebGL -> the tables are shown instead.
 * v13: pelvis ROM dropped (hip range of motion is recorded under Hip); old pelvis values shown read-only with "Move to Hip".
 * v14: standard goniometric poses and views. v15: entry UX (pain where felt, pain score, Normal (WNL), auto-advance).
 * v16: arcs, highlight, spine line, compare strips, camera and layout fixes. */
(function (g) {
  'use strict';
  var REG = ['cs', 'ts', 'ls', 'hip', 'shoulder', 'elbow', 'wrist', 'knee', 'ankle']; // v13: no pelvis marker (15 zones)
  var RNAME = { cs: 'Cervical', ts: 'Thoracic', ls: 'Lumbar', pelvis: 'Pelvis / SIJ', hip: 'Hip', shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist', knee: 'Knee', ankle: 'Ankle' };
  // Tap zone anchors: bone (S = side) and an offset in figure-height units (x toward the model's left, y up, z forward).
  var ZONES = { cs: ['neck_lo', 0, 0.02, 0], ts: ['thoracic_hi', 0, 0, -0.03], ls: ['lumbar_lo', 0, 0.02, -0.04],
    hip: ['thigh_S', 0, 0, 0.02], shoulder: ['upperarm_S', 0, 0, 0], elbow: ['forearm_S', 0, 0, 0], wrist: ['hand_S', 0, 0, 0], knee: ['shin_S', 0, 0, 0.02], ankle: ['foot_S', 0, 0, 0] };
  var COL = { none: 0x9e9e9e, green: 0x2e7d32, amber: 0xf9a825, red: 0xc62828 };
  var EF = ['Bony', 'Capsular', 'Springy', 'Spasm', 'Empty'];
  var S = { region: null, side: 'L', i: -1, mode: 'A', draft: null, yaw: 0, spin: false, view: 'front', zoom: false, userView: false };
  var V = { status: 'idle', fallback: false, fallbackWhy: '', T: null, C: null, A: null, base: null, ghost: null, arcs: null, zones: {}, rings: {}, r: null, scene: null, cam: null, dl: null, H: 1, center: null, lastPose: null, readyP: null, holdCam: false };
  var HIT_PX = 34, TAP_PX = 56;
  (function css() { if (typeof document === 'undefined' || document.getElementById('p10Css')) return; var st = document.createElement('style'); st.id = 'p10Css';
    st.textContent = '#p10Panel{min-width:0;box-sizing:border-box}#p10Panel .chip{white-space:nowrap;margin:0}#p10Panel .p10-chips,#p10Panel>div>.p10-move{display:flex;flex-wrap:wrap;gap:4px}' +
      '#p10Panel .p10-chips{margin:2px 0 6px}#p10Panel .p10-entry{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-start}#p10Panel .p10-opts{flex:1 1 220px;min-width:200px;font-size:12px}' +
      '#p10Panel .p10-legend{font-size:11px;color:var(--text2,#555);margin-top:8px;line-height:1.5}#p10Panel .p10-auto{display:flex;align-items:center;gap:6px;font-size:12px;margin-top:6px}#p10Panel .p10-auto input{width:auto;margin:0;flex:0 0 auto}' +
      '#p10Panel .p10-cmp{margin-top:8px;font-size:12px;border:1px solid var(--border,#ddd);border-radius:6px;padding:4px 6px;background:#fbfdfc}#p10Panel .p10-cmp table{border-collapse:collapse;width:100%}#p10Panel .p10-cmp td,#p10Panel .p10-cmp th{padding:2px 4px;text-align:left;font-weight:400}' +
      '#p10Panel .p10-cmp .p10-hi{background:#fff3cd;font-weight:600}#p10Rom{contain:inline-size}#p10Jump{cursor:pointer}' +
      '.p10-loss{font-size:12px;margin:6px 0;color:var(--text2,#555)}.p10-pelvis{border:1px dashed var(--border,#ccc);border-radius:8px;padding:8px 10px;background:#fafcfb}' +
      '#p10FigWrap{flex-wrap:wrap}@media (max-width:900px){#p10Canvas{flex-basis:100% !important;height:420px !important}#p10Panel{flex-basis:100% !important}}';
    (document.head || document.documentElement).appendChild(st); })();
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function exam(region) { return typeof getExamData === 'function' ? getExamData(region) : ((APP.examData || (APP.examData = {}))[region] || (APP.examData[region] = {})); }
  function rows(region) { return (typeof REGIONS !== 'undefined' && REGIONS[region] && REGIONS[region].rom) || []; }
  function locked() { return !!(g.P1FollowUp && typeof g.P1FollowUp.isLocked === 'function' && g.P1FollowUp.isLocked()); }
  function pref() { try { return localStorage.getItem('p10_romView') || 'figure'; } catch (e) { return 'figure'; } }
  function setPref(v) { try { localStorage.setItem('p10_romView', v); } catch (e) {} }
  function webglOK() { try { if (g.__P10_FORCE_NO_WEBGL) return false; var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
  function now() { return (g.performance && performance.now) ? performance.now() : Date.now(); }
  function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

  // ---------- tables (always rendered; hidden in figure mode) ----------
  function sel(region, k, v, opts, w) {
    var extra = v && opts.indexOf(v) < 0 ? '<option selected>' + esc(v) + '</option>' : ''; // legacy Yes/No pain values stay visible
    return '<select style="width:' + (w || 64) + 'px" data-k="' + k + "\" data-cc-change=\"P1Rom.setKey('" + region + '\',this)"><option>—</option>' + extra +
      opts.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
  }
  function num(region, k, v, w) { return '<input type="number" style="width:' + (w || 60) + 'px" data-k="' + k + '" value="' + esc(v || '') + "\" data-cc-input=\"P1Rom.setKey('" + region + '\',this)" placeholder="°">'; }
  function sidesFor(region, D) {
    if (!ROMDATA.sided(region)) return [''];
    var out = ['R', 'L'], hasLegacy = Object.keys(D).some(function (k) { return /^rom[AP]_[a-z]+_\d+$/.test(k) && ROMDATA.filled(D[k]); });
    if (hasLegacy) out.push('U'); return out;
  }
  function sideLabel(region, D, s) { return s === 'R' ? ' — R' : s === 'L' ? ' — L' : s === 'U' ? ' — ' + (ROMDATA.legacySide(D) ? ROMDATA.legacySide(D) + ' (pre-item-10 value)' : 'side not recorded') : ''; }
  function srcTag(n) { var s = ROMDATA.SRC[n.src]; return s && s.tag ? s.tag : n.src; }
  function lossCell(region, i, deg, ctx) { var l = ROMDATA.loss({ region: region, i: i, deg: deg }, ctx); return l ? l.pct + '%' : '<span style="color:#999">—</span>'; }
  function lossSummaryHtml(region, D, ctx) { var sides = ROMDATA.sided(region) ? ['R', 'L'] : [''], parts = [];
    sides.forEach(function (s) { var x = ROMDATA.lossSummary(region, D, 'A', s, ctx); if (x) parts.push((s ? (s === 'R' ? 'Right ' : 'Left ') : '') + '<b>' + x.pct + '%</b> over ' + x.n + ' movement' + (x.n === 1 ? '' : 's')); });
    return '<div class="p10-loss" id="p10LossSum">Active range loss: ' + (parts.length ? parts.join(' · ') : 'no degrees recorded yet') + '. <span title="' + esc(ROMDATA.LOSS_NOTE) + '">' + esc(ROMDATA.LOSS_NOTE) + '</span></div>'; }
  var SRC_NOTE = 'Normal values: CDC normal joint ROM study (Soucie 2011) by age and sex where it measured the movement, otherwise AAOS 1965. Cervical and hip: AAOS (Jones &amp; Bartlett Tables 3-13/3-14). Lumbar flexion, extension and side bending: AMA Guides 5th (dual inclinometer). Lumbar rotation and thoracic: clinic guide (Theunis), no published source; thoracic side bending has no reference value. Colours: green ≥90% of normal, amber 70–89% or pain/limitation, red &lt;70% or severe limitation (clinic default, unsourced).';
  function tablesHtml(region, D, prevD) {
    if (region === 'pelvis') return pelvisHtml(D);
    var ctx = ROMDATA.patientCtx(), R = rows(region), sides = sidesFor(region, D);
    function k(m, f, i, s) { return ROMDATA.key(m, f, i, s === 'U' ? '' : s); }
    function prev(m, i, s) { var v = prevD && prevD[k(m, 'deg', i, s)]; return v ? '<span class="prev-val"> ' + esc(v) + '°</span>' : ''; }
    var h = lossSummaryHtml(region, D, ctx) + '<div class="section-label">ROM — ACTIVE</div><table class="rom-table p10-tbl" data-mode="A"><tr><th>Movement (normal°, source)</th><th>Degrees</th><th>Loss</th><th>Pain</th><th>Score</th><th>Restricted</th><th>Grade</th></tr>';
    R.forEach(function (r, i) { var n = ROMDATA.norm(region, i, ctx);
      sides.forEach(function (s) { var dv = D[k('A', 'deg', i, s)]; h += '<tr><td>' + esc(r.name) + sideLabel(region, D, s) + ' <span class="p10-norm" title="' + esc(n.label + (n.note ? ' — ' + n.note : '')) + '">(' + (n.deg == null ? '—' : n.deg) + '°, ' + esc(srcTag(n)) + ')</span></td>' +
        '<td>' + num(region, k('A', 'deg', i, s), dv) + prev('A', i, s) + '</td><td class="p10-losscell">' + lossCell(region, i, dv, ctx) + '</td><td>' + sel(region, k('A', 'pain', i, s), D[k('A', 'pain', i, s)], ROMDATA.PAIN, 112) +
        '</td><td>' + num(region, k('A', 'pscore', i, s), D[k('A', 'pscore', i, s)], 48) + '</td><td>' + sel(region, k('A', 'rest', i, s), D[k('A', 'rest', i, s)], ['Yes', 'No']) +
        '</td><td>' + sel(region, k('A', 'grade', i, s), D[k('A', 'grade', i, s)], ROMDATA.GRADES, 110) + '</td></tr>'; }); });
    h += '</table><div class="section-label" style="margin-top:16px">ROM — PASSIVE</div><table class="rom-table p10-tbl" data-mode="P"><tr><th>Movement</th><th>Degrees</th><th>Loss</th><th>Pain</th><th>Score</th><th>End Feel</th><th>Grade</th></tr>';
    R.forEach(function (r, i) { sides.forEach(function (s) { var dv = D[k('P', 'deg', i, s)]; h += '<tr><td>' + esc(r.name) + sideLabel(region, D, s) + '</td><td>' + num(region, k('P', 'deg', i, s), dv) + prev('P', i, s) + '</td><td class="p10-losscell">' + lossCell(region, i, dv, ctx) + '</td><td>' + sel(region, k('P', 'pain', i, s), D[k('P', 'pain', i, s)], ROMDATA.PAIN, 112) +
      '</td><td>' + num(region, k('P', 'pscore', i, s), D[k('P', 'pscore', i, s)], 48) + '</td><td>' + sel(region, k('P', 'ef', i, s), D[k('P', 'ef', i, s)], EF, 84) + '</td><td>' + sel(region, k('P', 'grade', i, s), D[k('P', 'grade', i, s)], ROMDATA.GRADES, 110) + '</td></tr>'; }); });
    h += '</table><div class="p7-src" id="p10Src" style="font-size:11px;color:var(--text2)">' + SRC_NOTE + '</div>';
    return h;
  }
  // ---------- v13: pelvis ----------
  function pelvisOld(D) { var out = []; D = D || {}; Object.keys(D).forEach(function (k) { var m = /^rom([AP])_(deg|pain|rest|ef|grade|pscore)_(\d+)(?:_([RLU]))?$/.exec(k); if (m && ROMDATA.filled(D[k])) out.push(k); }); return out.sort(); }
  function pelvisHtml(D) { var old = pelvisOld(D);
    return '<div class="p10-rom p10-pelvis" id="p10Rom" data-region="pelvis"><div class="section-label">RANGE OF MOTION</div>' +
      '<div id="p10PelvisNote" style="font-size:13px;margin:4px 0 8px">Hip range of motion is recorded under the Hip tab. Pelvis / SIJ no longer has its own range of motion.</div>' +
      "<button type=\"button\" class=\"btn btn-secondary\" id=\"p10GoHip\" data-cc-click=\"P1Rom.openRegion('hip')\">Go to Hip range of motion</button>" +
      (old.length ? '<div style="margin-top:10px;font-size:12px"><b>Values recorded here before (read-only):</b><ul id="p10PelvisOld" style="margin:4px 0 6px 18px;padding:0">' +
        old.map(function (k) { return '<li>' + esc(ROMDATA.keyLabel('pelvis', k)) + ': ' + esc(D[k]) + (/_deg_/.test(k) ? '°' : '') + '</li>'; }).join('') + '</ul>' +
        (locked() ? '<div style="color:#8a5a00">This visit is signed: values stay where they are.</div>' : '<button type="button" class="btn btn-secondary" id="p10MoveHip" data-cc-click="P1Rom.movePelvisToHip()">Move to Hip</button> <span style="font-size:11px;color:var(--text2)">Copies each value into the same Hip movement where Hip is still empty, then removes it here. Hip values already recorded are kept.</span>') + '</div>' : '') + '</div>';
  }
  function movePelvisToHip() { if (locked()) return null; var P = exam('pelvis'), Hd = exam('hip'), moved = 0, kept = 0, pr = rows('pelvis'), hr = rows('hip');
    pelvisOld(P).forEach(function (k) { var m = /^rom([AP])_(\w+?)_(\d+)(?:_([RLU]))?$/.exec(k); if (!m) return; var nm = ((pr[+m[3]] || {}).name || '').replace(/^Hip /, ''), hi = -1;
      hr.forEach(function (r, i) { if (r.name === nm) hi = i; }); if (hi < 0) { kept++; return; }
      var side = m[4] && m[4] !== 'U' ? m[4] : (ROMDATA.legacySide(P) || ''), hk = ROMDATA.key(m[1], m[2], hi, side);
      if (ROMDATA.filled(Hd[hk])) { kept++; return; } /* Hip already has a value: both stay, nothing is overwritten */ Hd[hk] = P[k]; delete P[k]; moved++; });
    if (moved) { if (!APP.activeRegions) APP.activeRegions = []; if (APP.activeRegions.indexOf('hip') < 0) APP.activeRegions.push('hip'); }
    if (typeof markDirty === 'function') try { markDirty(); } catch (e) {}
    var w = $('p10Rom'); if (w && w.getAttribute('data-region') === 'pelvis') { var nw = document.createElement('div'); nw.innerHTML = pelvisHtml(P); w.replaceWith(nw.firstChild); var nn = $('p10PelvisNote'); if (nn) nn.textContent += ' Moved ' + moved + ' value' + (moved === 1 ? '' : 's') + ' to Hip' + (kept ? '; ' + kept + ' kept here because Hip already had a value.' : '.'); }
    try { document.dispatchEvent(new CustomEvent('p10:romchange', { detail: { region: 'hip' } })); } catch (e) {}
    return { moved: moved, kept: kept }; }
  function sectionHtml(region, D, prevD) {
    if (region === 'pelvis') { setTimeout(jumpLink, 0); return pelvisHtml(D); }
    var fig = pref() === 'figure' && !V.fallback;
    // v19: keep the ROM block where it was on screen when the exam re-renders (region switch after a Save used to leave the page
    // scrolled down to the dermatome / special-test tables because the new region's content above the ROM block is shorter)
    var keep = null, o0 = $('p10Rom'); if (o0 && g.innerHeight) { var r0 = o0.getBoundingClientRect(); if (r0.bottom > 0 && r0.top < g.innerHeight) keep = r0.top; }
    function hold() { var n = $('p10Rom'); if (keep == null || !n) return; var d = n.getBoundingClientRect().top - keep; if (Math.abs(d) > 2) g.scrollBy({ left: 0, top: d, behavior: 'instant' }); }
    // v16d: re-render the panel and the figure as soon as the new markup is in the document (no blank frame), then mount
    (g.queueMicrotask || function (f) { Promise.resolve().then(f); })(function () { if ($('p10Rom')) { panel(); if (V.r && fig) { attach(); render(); } hold(); } });
    setTimeout(function () { mount(region); hold(); }, 0);
    return '<div class="p10-rom" id="p10Rom" data-region="' + region + '">' +
      '<div class="section-label">RANGE OF MOTION</div>' +
      '<div class="p10-bar p10-view" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">' +
        '<span class="chip p10-view' + (fig ? ' active' : '') + "\" id=\"p10BtnFig\" data-cc-click=\"P1Rom.show('figure')\">Figure</span><span class=\"chip p10-view" + (fig ? '' : ' active') + "\" id=\"p10BtnTbl\" data-cc-click=\"P1Rom.show('table')\">Table</span>" +
        "<span style=\"width:10px\"></span><span class=\"chip p10-view\" id=\"p10VFront\" data-cc-click=\"P1Rom.view('front')\">Front</span><span class=\"chip p10-view\" id=\"p10VBack\" data-cc-click=\"P1Rom.view('back')\">Back</span><span class=\"chip p10-view\" id=\"p10VSide\" data-cc-click=\"P1Rom.view('side')\">Side</span><span class=\"chip p10-view\" id=\"p10Spin\" data-cc-click=\"P1Rom.spin()\">⟳ Rotate</span>" +
        "<span style=\"flex:1\"></span><span class=\"chip p10-view\" id=\"p10CreditsBtn\" data-cc-click=\"P1Rom.showCredits()\">ⓘ Credits</span></div>" +
      '<div id="p10Note" class="p10-note" style="font-size:12px;color:#8a5a00;margin:4px 0"' + (V.fallback ? '>' + esc(fbMsg()) : ' hidden>') + '</div>' +
      '<div id="p10FigWrap" style="display:' + (fig ? 'flex' : 'none') + ';gap:10px;flex-wrap:wrap">' +
        '<div id="p10Canvas" class="p10-view" style="position:relative;flex:1 1 320px;min-width:280px;height:460px;background:#eef5f4;border:1px solid var(--border,#ddd);border-radius:8px;touch-action:none;overflow:hidden">' + (V.r ? '' : '<div id="p10Loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#666">Loading figure…</div>') + '</div>' +
        '<div id="p10Panel" style="flex:1 1 260px;min-width:240px;font-size:13px"></div></div>' +
      '<div id="p10Tables" style="display:' + (fig ? 'none' : 'block') + '">' + tablesHtml(region, D, prevD) + '</div></div>';
  }
  function refreshTables() { var t = $('p10Tables'), w = $('p10Rom'); if (!t || !w) return; var r = w.getAttribute('data-region'); t.innerHTML = tablesHtml(r, exam(r), (APP.previousVisit && APP.previousVisit.examData || {})[r]); }
  function setKey(region, el) { if (locked()) return; var D = exam(region), k = el.getAttribute('data-k'), v = el.value === '—' ? '' : el.value;
    if (v === '') delete D[k]; else D[k] = v; var tr = el.closest && el.closest('tr'); if (tr && /_deg_/.test(k)) { var c = tr.querySelector('.p10-losscell'), m = /_deg_(\d+)/.exec(k); if (c && m) c.innerHTML = lossCell(region, +m[1], v, ROMDATA.patientCtx()); var ls = $('p10LossSum'); if (ls) ls.outerHTML = lossSummaryHtml(region, D, ROMDATA.patientCtx()); }
    if (typeof markDirty === 'function') try { markDirty(); } catch (e) {}
    colourZones(); if (S.i >= 0) panel(); try { document.dispatchEvent(new CustomEvent('p10:romchange', { detail: { region: region, key: k } })); } catch (e) {} }
  function show(mode) { if (mode === 'figure' && V.fallback) mode = 'table'; setPref(mode); var f = $('p10FigWrap'), t = $('p10Tables'); if (!f || !t) return;
    f.style.display = mode === 'figure' ? 'flex' : 'none'; t.style.display = mode === 'figure' ? 'none' : 'block';
    if ($('p10BtnFig')) $('p10BtnFig').classList.toggle('active', mode === 'figure'); if ($('p10BtnTbl')) $('p10BtnTbl').classList.toggle('active', mode !== 'figure');
    if (mode === 'table') refreshTables(); else { fit(); render(true); } }
  function note(msg) { var n = $('p10Note'); if (!n) return; n.hidden = !msg; n.textContent = msg || ''; }

  // ---------- 3D ----------
  function loadScript(src) { return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('load ' + src)); }; document.head.appendChild(s); }); }
  function fallback(why) { V.fallback = true; V.fallbackWhy = why; V.status = 'fallback'; show('table'); note(fbMsg());
    if ($('p10BtnFig')) $('p10BtnFig').style.opacity = '.4'; }
  function fbMsg() { return '3D figure unavailable (' + V.fallbackWhy + '): the ROM tables are shown instead. All values are recorded the same way.'; }
  var HIDE = /^(hair|eyes|eyebrows|eyelashes)/i;
  // Geometry helpers (our code): the vendored three.js bundle exports BufferGeometry but not the Tube/Ring/Plane geometries or the attribute classes
  var GEO = { Attr: null,
    init: function (T) { if (!GEO.Attr) GEO.Attr = new T.BufferGeometry().setFromPoints([new T.Vector3()]).attributes.position.constructor; },
    make: function (pos, idx) { var g0 = new V.T.BufferGeometry(); g0.setAttribute('position', new GEO.Attr(pos instanceof Float32Array ? pos : new Float32Array(pos), 3)); if (idx) g0.setIndex(idx); return g0; },
    ring: function (r0, r1, n) { var pos = [], idx = []; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(r0 * c, r0 * s, 0, r1 * c, r1 * s, 0); var j = (i + 1) % n; idx.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1); } return GEO.make(pos, idx); },
    // tube along a polyline (parallel-transport frames). tubeFill writes into an existing position array so arcs can follow the pose every frame without new allocations.
    tubeIdx: function (np, rad) { var idx = []; for (var i = 0; i < np - 1; i++) for (var k = 0; k < rad; k++) { var a = i * rad + k, b = i * rad + (k + 1) % rad, c = a + rad, d = b + rad; idx.push(a, c, b, b, c, d); } return idx; },
    tubeFill: function (arr, pts, r, rad) { var T = V.T, n = pts.length, t = GEO._t || (GEO._t = [new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3(), new T.Vector3()]), tg = t[0], nm = t[1], bn = t[2], q = t[3], tmp = t[4];
      for (var i = 0; i < n; i++) { if (i < n - 1) tg.copy(pts[i + 1]).sub(pts[i]); else tg.copy(pts[i]).sub(pts[i - 1]); if (tg.lengthSq() < 1e-14) tg.set(0, 1, 0); tg.normalize();
        if (i === 0) { tmp.set(Math.abs(tg.x) < 0.9 ? 1 : 0, Math.abs(tg.x) < 0.9 ? 0 : 1, 0); nm.crossVectors(tg, tmp).normalize(); } else { nm.sub(q.copy(tg).multiplyScalar(nm.dot(tg))); if (nm.lengthSq() < 1e-12) { tmp.set(0, 0, 1); nm.crossVectors(tg, tmp); } nm.normalize(); }
        bn.crossVectors(tg, nm).normalize();
        for (var k = 0; k < rad; k++) { var a = k / rad * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r, o = (i * rad + k) * 3; arr[o] = pts[i].x + nm.x * c + bn.x * s; arr[o + 1] = pts[i].y + nm.y * c + bn.y * s; arr[o + 2] = pts[i].z + nm.z * c + bn.z * s; } }
      return arr; },
    tube: function (pts, r, rad) { rad = rad || 6; if (pts.length < 2) return null; var arr = new Float32Array(pts.length * rad * 3); GEO.tubeFill(arr, pts, r, rad); var g0 = GEO.make(arr, GEO.tubeIdx(pts.length, rad)); g0.userData = { np: pts.length, rad: rad, r: r }; return g0; } };
  function boot() {
    if (V.readyP) return V.readyP;
    if (!webglOK()) { fallback('WebGL not available on this device'); return (V.readyP = Promise.resolve(false)); }
    V.status = 'loading';
    V.readyP = (g.ROM3D ? Promise.resolve() : loadScript('./vendor/three-rom.min.js')).then(function () { return g.ROMPoseCore ? null : loadScript('./rom-pose-core.js'); })
      .then(function () { return g.ROMAnat ? null : loadScript('./rom-anat.js'); }).then(function () {
      var T = V.T = g.ROM3D.THREE; GEO.init(T); V.C = g.ROMPoseCore(T); if (V.C.setEnd) V.C.setEnd(endPoint); V.A = g.ROMAnat ? g.ROMAnat(T) : null;
      return new Promise(function (ok, bad) { new g.ROM3D.GLTFLoader().setMeshoptDecoder(g.ROM3D.MeshoptDecoder).load('./rom/rom_figure.glb', ok, undefined, bad); });
    }).then(function (gl) {
      var T = V.T; V.base = gl.scene; V.base.traverse(function (o) { if (o.isMesh) o.frustumCulled = false; });
      V.ghost = g.ROM3D.cloneSkinned(V.base);
      // green ghost = normal range; stencil-masked so it only shows where it leaves the body outline (not as a film over the figure)
      V.ghost.traverse(function (o) { if (!o.isMesh) return; if (HIDE.test(o.name) || HIDE.test((o.material && o.material.name) || '')) { o.visible = false; return; }
        o.material = new T.MeshBasicMaterial({ color: 0x2e7d32, transparent: true, opacity: 0.24, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: 517 /* NotEqual */, stencilZPass: 7681 /* Replace */, stencilFail: 7680 /* Keep */, stencilZFail: 7680 }); o.renderOrder = 3; });
      V.ghost.visible = false;
      try { V.r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, stencil: true }); } catch (e) { throw new Error('WebGL context could not be created'); }
      V.r.outputColorSpace = T.SRGBColorSpace; V.r.setClearColor(0xeef5f4); V.r.setPixelRatio(Math.min(2, g.devicePixelRatio || 1));
      V.r.toneMapping = 7; V.r.toneMappingExposure = 1.05; // 7 = NeutralToneMapping (the vendored bundle exports few constants; values are three.js r170 enum numbers)
      V.scene = new T.Scene(); V.scene.add(new T.HemisphereLight(0xfffaf4, 0x8a7f76, 1.15)); V.dl = new T.DirectionalLight(0xffffff, 0.6); V.scene.add(V.dl);
      var key = new T.DirectionalLight(0xfff7ef, 2.3); key.position.set(1.1, 4.2, 2.2); V.scene.add(key); V.scene.add(key.target);
      [[-2.5, 1.6, 1.5, 0.55], [0, 1.4, -3, 0.5], [2.4, 0.8, -1.2, 0.35]].forEach(function (f) { var l = new T.DirectionalLight(0xf4f6ff, f[3]); l.position.set(f[0], f[1], f[2]); V.scene.add(l); });
      V.rig = new T.Group(); V.scene.add(V.rig); V.rig.add(V.base); V.rig.add(V.ghost); V.arcs = new T.Group(); V.rig.add(V.arcs);
      var aniso = Math.min(8, V.r.capabilities.getMaxAnisotropy ? V.r.capabilities.getMaxAnisotropy() : 1);
      V.base.traverse(function (o) { if (!o.isMesh || !o.material) return; var m = o.material; m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = 519; /* Always */ m.stencilZPass = 7681; /* Replace */
        ['map', 'normalMap', 'roughnessMap'].forEach(function (k) { if (m[k]) m[k].anisotropy = aniso; }); if (/hair|eyebrow|eyelash/i.test(m.name || o.name)) m.alphaTest = 0.04; o.renderOrder = 1; });
      V.cam = new T.PerspectiveCamera(30, 1, 0.01, 100);
      V.C.neutral(V.base); V.C.neutral(V.ghost);
      var b = new T.Box3(); V.base.traverse(function (o) { if (o.isBone) b.expandByPoint(o.getWorldPosition(new T.Vector3())); });
      V.H = b.getSize(new T.Vector3()).y; V.center = b.getCenter(new T.Vector3()); V.bot = b.min.y;
      var mb = new T.Box3().setFromObject(V.base); if (isFinite(mb.min.y)) V.bot = Math.min(V.bot, mb.min.y);
      shadowFloor(); initAnat(); buildZones(); initSpine(); twInit(); V.status = 'ready'; return true;
    }).catch(function (e) { fallback(String(e && e.message || e)); return false; });
    return V.readyP;
  }
  // soft contact shadow under the feet: a flat disc whose vertex alpha fades out (the vendored three.js bundle has no shadow material)
  function shadowFloor() { var T = V.T, R = V.H * 0.34, N = 40, K = 6, pos = [], col = [], idx = [];
    for (var k = 0; k <= K; k++) for (var i = 0; i < N; i++) { var r = R * k / K, a = i / N * Math.PI * 2; pos.push(r * Math.cos(a), 0, r * Math.sin(a) * 0.55); var al = 0.22 * Math.pow(1 - k / K, 1.6); col.push(0.18, 0.2, 0.2, al); }
    for (k = 0; k < K; k++) for (i = 0; i < N; i++) { var a0 = k * N + i, a1 = k * N + (i + 1) % N, b0 = a0 + N, b1 = a1 + N; idx.push(a0, b0, a1, a1, b0, b1); }
    var geo = GEO.make(pos, idx); geo.setAttribute('color', new GEO.Attr(new Float32Array(col), 4));
    var f = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })); f.position.y = V.bot - 0.002; f.renderOrder = 0; V.floor = f; V.scene.add(f); }
  // rom-anat.js: soft amber patch on the skin around the chosen joint (rides on the skin weights)
  function initAnat() { V.anat = null; if (!V.A) return; try { var meshes = []; V.base.traverse(function (o) { if (o.isSkinnedMesh && (o.name === 'body' || o.name === 'shorts')) meshes.push(o); });
    V.anat = meshes.map(function (m) { V.A.installTint(m); var P = V.A.skinnedPositions(m); return { mesh: m, P: P, mask: new Float32Array(P.length), cache: {} }; }); } catch (e) { V.anat = null; } }
  function regionHighlight(region, side) { if (!V.anat) return; var k = region ? region + '|' + (ROMDATA.sided(region) ? side : '') : '';
    if (V.hlKey === k) return; V.hlKey = k;
    V.anat.forEach(function (a) { var m = a.cache[k]; if (!m) { m = new Float32Array(a.P.length); if (region) V.A.jointMask(V.base, a.mesh, a.P, region, side, m); a.cache[k] = m; } V.A.applyMask(a.mesh, m); }); }
  function buildZones() {
    var T = V.T, geo = new T.SphereGeometry(V.H * 0.026, 18, 14), rgeo = GEO.ring(V.H * 0.036, V.H * 0.05, 32);
    REG.forEach(function (r) { (ROMDATA.sided(r) ? ['L', 'R'] : ['']).forEach(function (s) {
      var z = ZONES[r], bn = z[0].replace(/_S$/, s === 'R' ? '_R' : '_L'), bone = V.base.getObjectByName(bn); if (!bone) return;
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: COL.none, transparent: true, opacity: 0.8, depthTest: false })); m.renderOrder = 10;
      var off = new T.Vector3(z[1] * (s === 'R' ? -1 : 1) * V.H, z[2] * V.H, z[3] * V.H); // world offset -> bone local
      bone.updateMatrixWorld(true); var wp = bone.getWorldPosition(new T.Vector3()).add(off); bone.worldToLocal(wp); m.position.copy(wp);
      m.userData = { region: r, side: s }; bone.add(m); var key = r + (s ? '_' + s : ''); V.zones[key] = m;
      var ring = new T.Mesh(rgeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, side: 2 /* DoubleSide */ })); ring.renderOrder = 11; ring.visible = false; V.scene.add(ring); V.rings[key] = ring; }); });
    buildIndicators(); colourZones();
  }
  var _fr = null;
  function faceRings() { if (!_fr) _fr = { p: new V.T.Vector3(), q: new V.T.Quaternion() }; Object.keys(V.rings).forEach(function (k) { var r = V.rings[k], z = V.zones[k]; if (!r.visible) return; z.getWorldPosition(_fr.p); r.position.copy(_fr.p); r.quaternion.copy(V.cam.quaternion); }); }
  function isRot() { var d = def(); return !!(d && d.view === 'top'); }
  function arrow(dir, origin, len, col) { var a = new V.T.ArrowHelper(dir, origin, len, col, len * 0.35, len * 0.22); a.traverse(function (o) { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } o.renderOrder = 11; }); a.visible = false; return a; }
  function buildIndicators() {
    var T = V.T; V.ind = {};
    [['cs', 'head', 0.075, 0.05], ['ts', 'thoracic_hi', 0.11, 0.09], ['ls', 'lumbar_hi', 0.11, 0.09]].forEach(function (x) {
      var b = V.base.getObjectByName(x[1]); if (!b) return; b.updateMatrixWorld(true);
      var wo = b.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, x[0] === 'cs' ? 0.02 * V.H : 0.03 * V.H, x[3] * V.H)), wq = b.getWorldQuaternion(new T.Quaternion()).invert();
      var ws = b.getWorldScale(new T.Vector3()).x || 1, mv = arrow(new T.Vector3(0, 0, 1).applyQuaternion(wq).normalize(), b.worldToLocal(wo.clone()), x[2] * V.H / ws, 0x1565c0); b.add(mv);
      var n0 = arrow(new T.Vector3(0, 0, 1), wo.clone(), x[2] * V.H, 0x757575); V.rig.add(n0); V.ind[x[0]] = [mv, n0]; });
  }
  function indicators() {
    if (!V.ind) return; Object.keys(V.ind).forEach(function (k) { V.ind[k].forEach(function (a) { a.visible = false; }); });
    var on = isRot() && V.ind[S.region]; if (on) on.forEach(function (a) { a.visible = true; });
    var h = host(), ov = $('p10Orient'); if (h && !ov) { ov = document.createElement('div'); ov.id = 'p10Orient'; ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:600 12px system-ui,sans-serif;color:#1565c0';
      ov.innerHTML = '<div style="position:absolute;top:6px;left:0;right:0;text-align:center">▲ Front (face forward)</div><div style="position:absolute;left:8px;top:50%">L</div><div style="position:absolute;right:8px;top:50%">R</div><div style="position:absolute;bottom:6px;left:8px;right:8px;text-align:center;color:#555;font-weight:400">Viewed from above. <span style="color:#1565c0">Blue arrow</span>: where the body part faces now · <span style="color:#757575">grey arrow</span>: start position</div>'; h.appendChild(ov); }
    if (ov) ov.hidden = !isRot();
  }
  function colourZones() { if (!V.T) return; var ctx = ROMDATA.patientCtx();
    Object.keys(V.zones).forEach(function (k) { var z = V.zones[k], r = z.userData.region, s = z.userData.side, st = ROMDATA.jointStatus(r, (APP.examData || {})[r] || {}, s, ctx);
      z.material.color.setHex(COL[st]); z.userData.status = st; var on = S.region === r && (!s || S.side === s); z.scale.setScalar(S.i >= 0 ? (on ? 0.6 : 0.45) : (on ? 1.3 : 1)); z.material.opacity = S.i >= 0 ? (on ? 0.8 : 0.25) : 0.8; z.visible = !isRot(); // close-up views: small, faint markers so they do not cover the limb
      var ring = V.rings[k]; if (ring) { ring.visible = on && z.visible && S.i < 0; ring.material.color.setHex(st === 'none' ? 0xffffff : COL[st]); } });
    regionHighlight(S.region, sideOf());
    render(); }
  function host() { return $('p10Canvas'); }
  function attach() { var h = host(); if (!h || !V.r) return false; if (V.r.domElement.parentNode !== h) { h.appendChild(V.r.domElement); var l = $('p10Loading'); if (l) l.remove(); V.lastSize = null; fit(); observe(); } return true; }
  function fit() { var h = host(); if (!h || !V.r) return; var w = h.clientWidth || 320, ht = h.clientHeight || 460; if (V.lastSize === w + 'x' + ht) return; V.lastSize = w + 'x' + ht; V.r.setSize(w, ht, false); V.r.domElement.style.width = '100%'; V.r.domElement.style.height = '100%'; V.r.domElement.style.display = 'block'; V.cam.aspect = w / ht; V.cam.updateProjectionMatrix(); }
  function observe() { var h = host(); if (!h || !g.ResizeObserver || h._p10ro) return; h._p10ro = new ResizeObserver(function () { var s = (h.clientWidth || 0) + 'x' + (h.clientHeight || 0); if (s !== V.lastSize && h.clientWidth) { fit(); render(); } }); h._p10ro.observe(h); }
  // ---------- automatic view per movement (docs/P1_ITEM10_ROM_RULES.md, "View table") ----------
  // The camera orbits the figure. S.yaw = viewing azimuth: 0 front, PI back, +PI/2 right side, -PI/2 left side.
  var CTX = { cs: ['head', 'neck_hi', 'neck_lo', 'thoracic_hi'], ts: ['neck_lo', 'thoracic_hi', 'thoracic_lo', 'lumbar_hi'], ls: ['thoracic_hi', 'thoracic_lo', 'lumbar_hi', 'lumbar_lo', 'pelvis'],
    hip: ['pelvis', 'thigh_S', 'shin_S', 'foot_S'], shoulder: ['thoracic_hi', 'upperarm_S', 'forearm_S', 'hand_S'], elbow: ['upperarm_S', 'forearm_S', 'hand_S'],
    wrist: ['forearm_S', 'hand_S'], knee: ['thigh_S', 'shin_S', 'foot_S'], ankle: ['shin_S', 'foot_S'] };
  var VIEWS = { // name: [label, plane, dir (x,y,z in the front frame), up]
    side: ['Side-on, from the side being tested', 'sagittal', [0, 0.1, 1], [0, 1, 0]],
    front: ['Front-on', 'frontal', [0, 0.12, 1], [0, 1, 0]],
    back: ['Back-on', 'frontal', [0, 0.12, 1], [0, 1, 0]],
    endon: ['Front-on, along the forearm axis (slightly above)', 'transverse about the limb axis', [0, 0.3, 1], [0, 1, 0]],
    shoulderRot: ['Side-on: shoulder abducted 90°, elbow 90°; forearm arc', 'sagittal (humeral rotation)', [0, 0.1, 1], [0, 1, 0]],
    frontOblique: ['Front, turned 35° towards the tested side so the thigh does not hide the hand', 'frontal', [0, 0.15, 1], [0, 1, 0]],
    sideTrunk: ['Side-on from the left, turned 25° towards the back so the arm does not hide the back outline', 'sagittal', [0, 0.15, 1], [0, 1, 0]],
    hipRot: ['Front, slightly above: hip and knee at 90°, shank arc', 'transverse (femoral rotation)', [0, 0.35, 1], [0, 1, 0]],
    top: ['Top-down, front of the body at the top', 'transverse', [0, 1, 0.08], [0, 0, 1]],
    heel: ['From behind at heel level: inversion/eversion of the heel', 'frontal (subtalar)', [0, 0.18, 1], [0, 1, 0]],
    wristTop: ['From above the hand (dorsum), elbow 90° and forearm pronated', 'transverse', [0, 1, 0.2], [0, 0, 1]],
    kneeSide: ['Side-on, turned 60° from the front so the other leg does not hide the knee', 'sagittal', [0, 0.1, 1], [0, 1, 0]] };
  function viewKey(region, move) { var d = V.C && V.C.def(region, move); if (!d) return null;
    if (d.view === 'top') return 'top';
    if (region === 'shoulder' && /Rotation/.test(move)) return 'shoulderRot';
    if ((region === 'ts' || region === 'ls') && d.view === 'side') return 'sideTrunk';
    if (region === 'wrist' && /Deviation/.test(move)) return 'wristTop';
    if (region === 'hip' && /Rotation/.test(move)) return 'hipRot';
    if (region === 'elbow' && /nation/.test(move)) return 'endon';
    if (region === 'ankle' && /version/.test(move)) return 'heel';
    if (region === 'knee') return 'kneeSide';
    return d.view; }
  function viewYaw(key, side) { var R = side === 'R'; return key === 'back' || key === 'heel' ? Math.PI : key === 'side' || key === 'shoulderRot' ? (R ? Math.PI / 2 : -Math.PI / 2) : key === 'sideTrunk' ? -(Math.PI / 2 + 25 * Math.PI / 180) : key === 'frontOblique' ? (R ? 1 : -1) * 35 * Math.PI / 180 : key === 'kneeSide' ? (R ? 1 : -1) * 60 * Math.PI / 180 : 0; }
  function fromWord(k, sd) { var R = (sd || 'L') === 'R'; return { top: 'above', wristTop: 'above the hand', hipRot: 'front, above', back: 'behind', heel: 'behind, heel level', sideTrunk: 'left side, 25° behind', frontOblique: R ? 'front, 35° to the right' : 'front, 35° to the left', kneeSide: R ? 'right, 60° from the front' : 'left, 60° from the front', side: R ? 'right side' : 'left side', shoulderRot: R ? 'right side' : 'left side' }[k] || 'front'; }
  function viewTable() { var out = []; REG.forEach(function (r) { rows(r).forEach(function (row) { var k = viewKey(r, row.name); if (!k) return;
    (ROMDATA.sided(r) ? ['L', 'R'] : ['']).forEach(function (sd) { var y = viewYaw(k, sd || 'L'); out.push({ region: r, move: row.name, side: sd, view: k, label: VIEWS[k][0], plane: VIEWS[k][1], from: fromWord(k, sd), yaw: +(y * 180 / Math.PI).toFixed(0) }); }); }); }); return out; }
  function azDir(arr, az) { var v = new V.T.Vector3(arr[0], arr[1], arr[2]).normalize(); var c = Math.cos(-az), s = Math.sin(-az); return new V.T.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c).normalize(); }
  function bonePos(root, n) { var b = root.getObjectByName(n.replace(/_S$/, sideOf() === 'R' ? '_R' : '_L')); return b ? b.getWorldPosition(new V.T.Vector3()) : null; }
  // End segments have no child bone: far end along the bone axis using body-segment proportions of standing height H
  // (Drillis & Contini 1966 as tabulated in Winter, Biomechanics and Motor Control of Human Movement: foot 0.152H, hand 0.108H, head 0.130H).
  // Ankle joint to toe tip = 0.12H: clinic default (unsourced). Display/framing only.
  var END_LEN = { foot: 0.12, hand: 0.108, head: 0.13 };
  function endPoint(b) { var k = String(b.name || '').replace(/_[LR]$/, ''), f = END_LEN[k]; if (!f || !V.H) return null; b.updateMatrixWorld(true);
    var q = b.getWorldQuaternion(new V.T.Quaternion()); return b.getWorldPosition(new V.T.Vector3()).add(new V.T.Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(f * V.H)); }
  function tipOf(root, n) { var b = root.getObjectByName(n.replace(/_S$/, sideOf() === 'R' ? '_R' : '_L')); if (!b) return null; var t = b.children.find(function (c) { return c.isBone; });
    return t ? t.getWorldPosition(new V.T.Vector3()) : (endPoint(b) || b.getWorldPosition(new V.T.Vector3())); }
  function collectPoi(a1, a2) { var d = def(); V.poi = null; V.probe = null; if (!d) return; var pts = [], T = V.T;
    [V.base].concat(V.ghost.visible ? [V.ghost] : []).forEach(function (root) { root.updateMatrixWorld(true);
      var nm0 = (rows(S.region)[S.i] || {}).name, ctxL = S.region === 'ankle' && /version/.test(nm0 || '') ? ['foot_S'] : (CTX[S.region] || []); // heel view: frame the foot and the heel fan, not the whole shank
      ctxL.forEach(function (n) { var p = bonePos(root, n); if (p) pts.push(p); if (/^(foot|hand|head)/.test(n)) { var e = tipOf(root, n); if (e) pts.push(e); } });
      d.b.forEach(function (x) { var p = bonePos(root, x[0]); if (p) pts.push(p); }); var tp = tipOf(root, d.b[d.b.length - 1][0]); if (tp) pts.push(tp); });
    (a1 || []).concat(a2 || []).forEach(function (p) { pts.push(p.clone()); });
    var bl = d.arcTip ? tipOf(V.base, d.b[d.b.length - 1][0]) : bonePos(V.base, d.b[d.b.length - 1][0]), tip = d.arcTip ? bonePos(V.base, d.arcTip) : tipOf(V.base, d.b[d.b.length - 1][0]), spine = /^(cs|ts|ls)$/.test(S.region), surf = null;
    if (spine && tip) {
      var back = new T.Vector3().crossVectors(tip.clone().sub(bl).normalize(), new T.Vector3(1, 0, 0)).normalize();
      var mid0 = bl.clone().add(tip).multiplyScalar(0.5), rc = new T.Raycaster(mid0.clone().add(back.clone().multiplyScalar(V.H * 0.5)), back.clone().negate(), 0, V.H * 0.5), ms = [];
      V.base.traverse(function (o) { if (o.isMesh && o.visible && o.isSkinnedMesh) ms.push(o); }); var h = rc.intersectObjects(ms, false)[0]; surf = h ? h.point.clone().add(back.multiplyScalar(V.H * 0.005)) : null; }
    V.poi = pts; V.probe = { tip: spine ? null : tip, mid: spine ? surf : (bl && tip ? bl.clone().add(tip).multiplyScalar(0.5) : null), spineSurface: spine, arcEnd: a2 && a2.length > 2 ? a2[a2.length - 2].clone() : null, ghostEnd: a1 && a1.length > 2 ? a1[a1.length - 2].clone() : null }; }
  function goal() {
    var T = V.T, d = def(), az = S.yaw, name = (rows(S.region)[S.i] || {}).name, key = S.zoom && d ? viewKey(S.region, name) : null;
    if (!key) { var t0 = V.center.clone().add(new T.Vector3(0, V.H * 0.04, 0)), dir0 = azDir([0, 0, 1], az); return { pos: t0.clone().add(dir0.multiplyScalar(V.H * 2.35)), tgt: t0, up: new T.Vector3(0, 1, 0), key: 'whole' }; }
    var vw = VIEWS[key], dir = azDir(vw[2], az), up = azDir(vw[3], az);
    if (key === 'top') {
      var hb = V.base.getObjectByName(S.region === 'cs' ? 'head' : S.region === 'ts' ? 'thoracic_hi' : 'lumbar_hi'), tg = hb ? hb.getWorldPosition(new T.Vector3()) : V.center.clone(), ds = V.H * (S.region === 'cs' ? 0.6 : 1.0);
      if (V.cam.aspect > 1.4) ds *= 0.8; var off = azDir([0, 1, 0.08], az); return { pos: tg.clone().add(new T.Vector3(off.x * ds, ds, off.z * ds)), tgt: tg, up: up, key: key }; }
    var pts = V.poi && V.poi.length ? V.poi : [V.center.clone()];
    var r = new T.Vector3().crossVectors(up, dir).normalize(), u = new T.Vector3().crossVectors(dir, r).normalize(), c0 = new T.Vector3();
    pts.forEach(function (p) { c0.add(p); }); c0.multiplyScalar(1 / pts.length);
    var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9; pts.forEach(function (p) { var q = p.clone().sub(c0), x = q.dot(r), y = q.dot(u); mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); });
    var c = c0.clone().add(r.clone().multiplyScalar((mnx + mxx) / 2)).add(u.clone().multiplyScalar((mny + mxy) / 2));
    var tv = Math.tan(V.cam.fov * Math.PI / 360), th = tv * (V.cam.aspect || 1), k = 0.78, dist = V.H * (key === 'heel' ? 0.3 : 0.5);
    pts.forEach(function (p) { var q = p.clone().sub(c), z = q.dot(dir); dist = Math.max(dist, z + Math.abs(q.dot(r)) / (th * k), z + Math.abs(q.dot(u)) / (tv * k), z + V.H * 0.15); });
    for (var it = 0; it < 2; it++) { var pc = c.clone().add(dir.clone().multiplyScalar(dist)), ax = 1e9, bx = -1e9, ay = 1e9, by = -1e9;
      pts.forEach(function (p) { var q = p.clone().sub(pc), z = -q.dot(dir); if (z <= 1e-6) return; var x = q.dot(r) / (z * th), y = q.dot(u) / (z * tv); ax = Math.min(ax, x); bx = Math.max(bx, x); ay = Math.min(ay, y); by = Math.max(by, y); });
      if (ax > bx) break; var zc = c.clone().sub(pc).dot(dir) * -1; c.add(r.clone().multiplyScalar((ax + bx) / 2 * zc * th)).add(u.clone().multiplyScalar((ay + by) / 2 * zc * tv)); }
    return { pos: c.clone().add(dir.clone().multiplyScalar(dist)), tgt: c, up: u, key: key }; }
  var ANIM_MS = 600;
  // v16c: the camera only glides when the view itself changes (view key or azimuth); a new pose in the same view re-frames at once (no drifting)
  function placeCamera(snap) { var T = V.T, t = now();
    if (V.holdCam && V.camNow) { V.cam.position.copy(V.camNow.pos); V.cam.up.copy(V.camNow.up); V.cam.lookAt(V.camNow.tgt); V.cam.updateMatrixWorld(true); return false; }
    var G = goal(), vk = G.key + '|' + S.yaw.toFixed(4);
    if (!V.camNow || snap) { V.camNow = { pos: G.pos.clone(), tgt: G.tgt.clone(), up: G.up.clone() }; V.anim = null; }
    else if (vk !== V.camVK || V.forceAnim) { if (!V.camGoal || G.pos.distanceTo(V.camGoal.pos) > 1e-4 || G.tgt.distanceTo(V.camGoal.tgt) > 1e-4) V.anim = { from: { pos: V.camNow.pos.clone(), tgt: V.camNow.tgt.clone(), up: V.camNow.up.clone() }, t0: t }; }
    else if (!V.anim) { V.camNow.pos.copy(G.pos); V.camNow.tgt.copy(G.tgt); V.camNow.up.copy(G.up); }
    V.forceAnim = false; V.camGoal = G; V.camVK = vk; V.viewKey = G.key;
    if (V.anim) { var a = Math.min(1, (t - V.anim.t0) / ANIM_MS), e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2, f = V.anim.from;
      V.camNow.pos.copy(f.pos).lerp(G.pos, e); V.camNow.tgt.copy(f.tgt).lerp(G.tgt, e); V.camNow.up.copy(f.up).lerp(G.up, e).normalize(); if (a >= 1) V.anim = null; }
    V.cam.position.copy(V.camNow.pos); V.cam.up.copy(V.camNow.up); V.cam.lookAt(V.camNow.tgt); V.cam.updateMatrixWorld(true);
    V.dl.position.copy(V.cam.position).add(new T.Vector3(0.3, 0.5, 0));
    return !!V.anim; }
  var rafOn = false, animRaf = false;
  function render(snap) { if (!V.r || !host()) { if (V) V.anim = null; return; } attach();
    V.rig.rotation.y = 0; var moving = placeCamera(snap === true); faceRings(); V.r.render(V.scene, V.cam); V.frames = (V.frames || 0) + 1;
    if (moving && !animRaf) { animRaf = true; var tok = {}, step = function () { if (tok.done) return; tok.done = true; animRaf = false; render(); };
      if (g.requestAnimationFrame) requestAnimationFrame(step); setTimeout(step, 40); } }
  function settle() { twFinish(true); V.anim = null; render(true); return V.viewKey; }
  function viewCheck() { if (!V.r || !V.poi) return null; settle(); var T = V.T, cam = V.cam, H = V.H, out = { view: V.viewKey, yaw: S.yaw };
    function ndc(p) { var q = p.clone().project(cam); return { x: q.x, y: q.y, z: q.z }; } function inside(n, m) { m = m || 0; return n.z < 1 && Math.abs(n.x) <= 1 - m && Math.abs(n.y) <= 1 - m; }
    out.allOnScreen = V.poi.every(function (p) { return inside(ndc(p), 0.02); });
    var mn = [1e9, 1e9], mx = [-1e9, -1e9]; V.poi.forEach(function (p) { var n = ndc(p); mn[0] = Math.min(mn[0], n.x); mn[1] = Math.min(mn[1], n.y); mx[0] = Math.max(mx[0], n.x); mx[1] = Math.max(mx[1], n.y); });
    out.fill = Math.max((mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2); out.center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2];
    var meshes = []; V.base.traverse(function (o) { if (o.isSkinnedMesh && o.visible && !HIDE.test(o.name)) { o.boundingSphere = null; o.boundingBox = null; meshes.push(o); } });
    var ray = new T.Raycaster(); function occluded(p) { var dirv = p.clone().sub(cam.position), dd = dirv.length(); ray.set(cam.position, dirv.normalize()); ray.near = 0; ray.far = dd; var h = ray.intersectObjects(meshes, false)[0]; return { hit: h ? +(h.distance / H).toFixed(3) : null, depth: +(dd / H).toFixed(3), blocked: !!h && h.distance < dd - H * 0.07 }; }
    out.probes = {}; ['tip', 'mid', 'arcEnd', 'ghostEnd'].forEach(function (k) { var p = V.probe && V.probe[k]; if (!p) return; var n = ndc(p); out.probes[k] = { onScreen: inside(n, 0.02), ndc: [+n.x.toFixed(3), +n.y.toFixed(3)] }; });
    ['tip', 'mid'].forEach(function (k) { if (out.probes[k]) Object.assign(out.probes[k], occluded(V.probe[k])); });
    if (V.viewKey === 'top' && V.ind && V.ind[S.region]) { var arrOk = V.ind[S.region].every(function (a) { a.updateMatrixWorld(true); var tipW = (a.cone || a).getWorldPosition(new T.Vector3()), o0 = a.getWorldPosition(new T.Vector3()); return inside(ndc(tipW), 0.02) && inside(ndc(o0), 0.02); }); out.probes.facingArrow = { onScreen: arrOk, overlay: true }; }
    return out; }
  function loop() { if (!S.spin || !host()) { rafOn = false; return; } S.yaw += 0.01; render(true); requestAnimationFrame(loop); }
  function spin() { S.spin = !S.spin; if ($('p10Spin')) $('p10Spin').classList.toggle('active', S.spin); if (S.spin && !rafOn) { rafOn = true; requestAnimationFrame(loop); } }
  function yawFor(v, side) { return v === 'back' ? Math.PI : v === 'side' ? (side === 'R' ? Math.PI / 2 : -Math.PI / 2) : 0; }
  // v16d: Front/Back/Side keep the chosen movement in view (user view) until another movement or joint is chosen
  function view(v) { S.view = v; S.spin = false; S.userView = true; if ($('p10Spin')) $('p10Spin').classList.remove('active'); S.yaw = yawFor(v, sideOf()); if (S.i < 0) S.zoom = false; render(); }
  function sideOf() { return ROMDATA.sided(S.region) ? S.side : 'L'; }
  function def() { return S.i >= 0 && V.C ? V.C.def(S.region, (rows(S.region)[S.i] || {}).name) : null; }
  // ---------- spine line (v16): amber line along the back of the spine, follows the pose ----------
  var SPINE_CH = ['pelvis', 'lumbar_lo', 'lumbar_hi', 'thoracic_lo', 'thoracic_hi', 'neck_lo', 'neck_hi', 'head'];
  function initSpine() { var T = V.T, ms = []; V.spine = null; V.base.traverse(function (o) { if (o.isSkinnedMesh && o.name === 'body') ms.push(o); }); if (!ms.length) return;
    V.base.updateMatrixWorld(true); var rc = new T.Raycaster(), off = [];
    SPINE_CH.forEach(function (n) { var b = V.base.getObjectByName(n); if (!b) return; var p = b.getWorldPosition(new T.Vector3()); if (n === 'head') p.y += V.H * 0.03;
      rc.set(p.clone().add(new T.Vector3(0, 0, -V.H * 0.4)), new T.Vector3(0, 0, 1)); rc.near = 0; rc.far = V.H * 0.4; var h = rc.intersectObjects(ms, false)[0];
      var w = h ? h.point.clone().add(new T.Vector3(0, 0, -V.H * 0.006)) : p.clone().add(new T.Vector3(0, 0, -V.H * 0.05)); off.push({ b: b, l: b.worldToLocal(w.clone()) }); });
    V.spine = { off: off, mat: new T.MeshBasicMaterial({ color: 0xe0a040, transparent: true, opacity: 0.95, depthTest: false }), mesh: null, tmp: off.map(function () { return new T.Vector3(); }) }; }
  function chaikin(p, it) { for (var k = 0; k < it; k++) { var o = [p[0]]; for (var i = 0; i < p.length - 1; i++) { o.push(p[i].clone().lerp(p[i + 1], 0.25), p[i].clone().lerp(p[i + 1], 0.75)); } o.push(p[p.length - 1]); p = o; } return p; }
  function spineOn() { var d = def(); return !!(V.spine && /^(cs|ts|ls)$/.test(S.region || '') && !(d && d.view === 'top')); } // not in the top-down rotation view, where the line would cross the head/shoulders
  function spineLine() { var T = V.T, sp = V.spine; if (!sp) return; if (sp.mesh) { sp.mesh.parent && sp.mesh.parent.remove(sp.mesh); sp.mesh.geometry.dispose(); sp.mesh = null; } if (!spineOn()) return;
    V.base.updateMatrixWorld(true); var pts = sp.off.map(function (o, i) { return o.b.localToWorld(sp.tmp[i].copy(o.l)).clone(); }), sm = chaikin(pts, 2);
    var m = new T.Mesh(GEO.tube(sm, V.H * 0.0032, 6), sp.mat); m.renderOrder = 12; m.name = 'p10Spine'; V.rig.add(m); sp.mesh = m; }
  // ---------- picking ----------
  function zoneScreen(k) { var z = V.zones[k], h = host(); if (!z || !h || !V.cam) return null; V.rig.updateMatrixWorld(true); var p = z.getWorldPosition(new V.T.Vector3()).project(V.cam), rc = h.getBoundingClientRect();
    return { x: rc.left + (p.x + 1) / 2 * rc.width, y: rc.top + (1 - p.y) / 2 * rc.height }; }
  function pick(ev) {
    var h = host(); if (!h || !V.r) return null; var T = V.T, best = null, bd = HIT_PX;
    Object.keys(V.zones).forEach(function (k) { if (!V.zones[k].visible) return; var s = zoneScreen(k); if (!s) return; var dd = Math.hypot(s.x - ev.clientX, s.y - ev.clientY); if (dd < bd) { bd = dd; best = V.zones[k].userData; } });
    if (best) return best;
    // tap on the body: nearest zone (3D) to the point that was hit
    var rc = h.getBoundingClientRect(), p = new T.Vector2(((ev.clientX - rc.left) / rc.width) * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1), ray = new T.Raycaster(); ray.setFromCamera(p, V.cam);
    var ms = []; V.base.traverse(function (o) { if (o.isSkinnedMesh && o.visible && !HIDE.test(o.name)) ms.push(o); }); var hit = ray.intersectObjects(ms, false)[0];
    if (hit) { var bz = null, bdz = V.H * 0.12; Object.keys(V.zones).forEach(function (k) { var z = V.zones[k]; if (!z.visible) return; var d = z.getWorldPosition(new T.Vector3()).distanceTo(hit.point); if (d < bdz) { bdz = d; bz = z.userData; } }); if (bz) return bz; }
    bd = TAP_PX; Object.keys(V.zones).forEach(function (k) { if (!V.zones[k].visible) return; var s = zoneScreen(k); if (!s) return; var dd = Math.hypot(s.x - ev.clientX, s.y - ev.clientY); if (dd < bd) { bd = dd; best = V.zones[k].userData; } });
    return best;
  }
  function hoverLabel(ev) { var h = host(); if (!h) return; var lb = $('p10Hover'); var z = null, bd = HIT_PX;
    if (ev) Object.keys(V.zones).forEach(function (k) { if (!V.zones[k].visible) return; var s = zoneScreen(k); if (!s) return; var dd = Math.hypot(s.x - ev.clientX, s.y - ev.clientY); if (dd < bd) { bd = dd; z = V.zones[k].userData; } });
    if (!z) { if (lb) lb.hidden = true; return z; }
    if (!lb) { lb = document.createElement('div'); lb.id = 'p10Hover'; lb.style.cssText = 'position:absolute;pointer-events:none;background:rgba(30,71,68,.9);color:#fff;font:600 11px system-ui,sans-serif;padding:2px 6px;border-radius:4px;z-index:3'; h.appendChild(lb); }
    var rc = h.getBoundingClientRect(); lb.hidden = false; lb.textContent = RNAME[z.region] + (z.side ? ' ' + (z.side === 'R' ? 'R' : 'L') : ''); lb.style.left = (ev.clientX - rc.left + 12) + 'px'; lb.style.top = (ev.clientY - rc.top - 8) + 'px'; return z; }
  // ---------- jump chip (v15): "↓ Range of motion" next to the SOAP tabs ----------
  function jumpLink() { var tabs = document.querySelector('#sec-exam .soap-tabs'); if (!tabs || $('p10Jump')) return; var c = document.createElement('span'); c.id = 'p10Jump'; c.className = 'chip'; c.setAttribute('data-cc-click', 'P1Rom.jump()');
    c.style.cssText = 'display:inline-block;margin:6px 0 4px;font-size:12px'; c.textContent = '↓ Range of motion'; tabs.parentNode.insertBefore(c, tabs.nextSibling); }
  function stickyH() { var hh = 0; document.querySelectorAll('.header,.sticky-bar,[data-sticky]').forEach(function (x) { var cs = getComputedStyle(x); if (cs.position === 'sticky' || cs.position === 'fixed') hh = Math.max(hh, x.getBoundingClientRect().bottom); }); return Math.max(0, hh); }
  function jump() { var ot = document.querySelector('#sec-exam .soap-tab:nth-child(2)'); if (ot && !ot.classList.contains('active')) ot.click();
    setTimeout(function () { var w = $('p10Rom'); if (!w) return; var y = w.getBoundingClientRect().top + (g.scrollY || 0) - stickyH() - 8; g.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }, 0); return true; }
  function mount(region) {
    var wrap = $('p10Rom'); if (!wrap) return; jumpLink();
    boot().then(function (ok) { if (!ok || !$('p10Rom')) return; attach(); bindPointer(); if (pref() === 'figure') fit(); colourZones(); panel(); applyPose();
      if (V.pendingJump) { V.pendingJump = false; jump(); } });
    panel();
  }

  // ---------- flow: tap -> movement -> active/passive -> degrees (+grade, pain, end feel) ----------
  function tapZone(region, side) { var keep = S.region === region && S.i >= 0 && side && side !== S.side ? S.i : -1; S.region = region; S.side = side || S.side; S.i = -1; S.draft = null; S.zoom = false; S.userView = false; colourZones(); panel(); applyPose(); if (keep >= 0 && side) chooseMove(keep); }
  function openRegion(region) {
    if (!APP.activeRegions) APP.activeRegions = []; if (APP.activeRegions.indexOf(region) < 0) APP.activeRegions.push(region);
    document.querySelectorAll('#examRegionSelect .chip').forEach(function (c) { if (c.dataset.region === region) c.classList.add('active'); });
    APP.currentRegion = region; V.pendingJump = true; if (typeof renderRegionTabs === 'function') renderRegionTabs(); var ot = document.querySelector('#sec-exam .soap-tab:nth-child(2)'); if (ot) ot.click();
    if (S.region === region) { panel(); }
  }
  function current(field) { var k = ROMDATA.key(S.mode, field, S.i, ROMDATA.sided(S.region) ? S.side : ''); return exam(S.region)[k]; }
  function draft() { if (!S.draft) S.draft = { deg: current('deg') || '', grade: current('grade') || '', pain: current('pain') || '', pscore: current('pscore') || '', ef: S.mode === 'P' ? (current('ef') || '') : '' }; return S.draft; }
  function chooseMove(i, auto) { var prevKey = V.viewKey; S.i = i; S.draft = null; S.zoom = i >= 0; colourZones(); var d = def();
    if (d) { var vk = viewKey(S.region, (rows(S.region)[S.i] || {}).name); if (!(auto && S.userView)) { S.userView = false; S.yaw = viewYaw(vk, sideOf()); } V.holdCam = !!(auto && vk === prevKey && S.userView); }
    panel(); applyPose(); V.holdCam = false; }
  function chooseMode(m) { S.mode = m; S.draft = null; panel(); applyPose(); }
  function padKey(k) { if (locked()) return; var d = draft(); if (k === 'C') d.deg = ''; else if (k === '<') d.deg = String(d.deg).slice(0, -1); else if (k === '-') d.deg = String(d.deg).charAt(0) === '-' ? String(d.deg).slice(1) : '-' + d.deg; else if (String(d.deg).replace('-', '').length < 3) d.deg = String(d.deg) + k;
    var o = $('p10Deg'); if (o) o.value = d.deg; applyPose(); clampNote(); }
  function setDraft(f, v) { if (locked()) return; var d = draft(); d[f] = d[f] === v ? '' : v; panel(); applyPose(); }
  function degInput(el) { if (locked()) return; draft().deg = el.value.replace(/[^0-9-]/g, '').slice(0, 4); applyPose(); clampNote(); }
  function pscore(v) { if (locked()) return; var s = String(v == null ? '' : v).replace(/[^0-9]/g, '').slice(0, 2); if (s !== '' && +s > 10) s = '10'; draft().pscore = s; var el = $('p10Pscore'); if (el && el.value !== s) el.value = s; }
  function save(noAdvance) {
    if (locked()) { panel('This visit is signed: ROM is read-only. Use a dated addendum for corrections.'); return false; }
    if (S.i < 0 || !S.region) return false;
    var D = exam(S.region), d = draft(), side = ROMDATA.sided(S.region) ? S.side : '';
    if (d.deg !== '' && isNaN(parseFloat(d.deg))) { panel('Degrees must be a number.'); return false; }
    ['deg', 'grade', 'pain', 'pscore'].concat(S.mode === 'P' ? ['ef'] : []).forEach(function (f) { var k = ROMDATA.key(S.mode, f, S.i, side); if (d[f] === '' || d[f] == null) delete D[k]; else D[k] = String(d[f]); });
    if (S.mode === 'A' && d.grade) D[ROMDATA.key('A', 'rest', S.i, side)] = d.grade === 'Full' ? 'No' : 'Yes';
    if (typeof markDirty === 'function') try { markDirty(); } catch (e) {}
    S.draft = null; refreshTables(); colourZones();
    try { document.dispatchEvent(new CustomEvent('p10:romchange', { detail: { region: S.region } })); } catch (e) {}
    if (noAdvance !== true && autoOn()) { var nx = nextIndex(); if (nx >= 0) { chooseMove(nx, true); panel('Saved. Next: ' + rows(S.region)[nx].name + '.'); return true; } }
    panel('Saved.'); applyPose(); return true;
  }
  function clearMove() { if (locked()) return; S.draft = { deg: '', grade: '', pain: '', pscore: '', ef: '' }; save(true); }
  // v15: Normal (WNL) = the movement reaches the normal value shown; enters that value (rounded), grade Full, no pain
  function normal() { if (locked()) { panel('This visit is signed: ROM is read-only.'); return false; } var n = ROMDATA.norm(S.region, S.i, ROMDATA.patientCtx());
    if (n.deg == null) { panel('No reference value for this movement: enter the degrees.'); return false; }
    var d = draft(); d.deg = String(Math.round(n.deg)); d.grade = 'Full'; d.pain = 'None'; return save(); }
  function autoOn() { try { return localStorage.getItem('p10_autoNext') === '1'; } catch (e) { return false; } }
  function setAuto(on) { try { localStorage.setItem('p10_autoNext', on ? '1' : '0'); } catch (e) {} var c = $('p10Auto'); if (c) c.checked = !!on; }
  function nextIndex() { var R = rows(S.region), D = exam(S.region), side = ROMDATA.sided(S.region) ? S.side : '';
    for (var k = 1; k <= R.length; k++) { var j = (S.i + k) % R.length; if (j === S.i) break; if (!ROMDATA.filled(D[ROMDATA.key(S.mode, 'deg', j, side)])) return j; } return -1; }
  function advance() { var nx = nextIndex(); if (nx < 0) { panel('All ' + RNAME[S.region] + ' movements have degrees for this side.'); return false; } chooseMove(nx, true); return true; }
  function saveNext() { var ok = save(true); if (ok) advance(); return ok; }
  function clampNote() { var el = $('p10Clamp'); if (!el) return; var lp = V.lastPose; el.textContent = lp && lp.clamped ? 'Display clamped at ' + lp.clampMax + '° so the figure does not pass through itself. The recorded value (' + lp.value + '°) is kept unchanged.' : ''; el.hidden = !(lp && lp.clamped); }
  // ---------- arcs (v16: tubes, end dot; display only) ----------
  var MATS = {};
  function arcMat(col, op) { var k = col + '|' + (op || 1); if (!MATS[k]) MATS[k] = new V.T.MeshBasicMaterial({ color: col, transparent: true, opacity: op || 1, depthTest: false }); return MATS[k]; }
  function tubeGeo(pts, r) { return GEO.tube(pts, r, 6); }
  function line(pts, col, r, op) { var g0 = tubeGeo(pts, r || V.H * 0.0035); if (!g0) return null; var m = new V.T.Mesh(g0, arcMat(col, op)); m.renderOrder = 9; V.arcs.add(m); return m; }
  function dot(p, col, r) { var m = new V.T.Mesh(new V.T.SphereGeometry(r || V.H * 0.009, 12, 10), arcMat(col)); m.position.copy(p); m.renderOrder = 10; V.arcs.add(m); return m; }
  function clearArcs() { V.arcs.children.slice().forEach(function (o) { V.arcs.remove(o); if (o.geometry) o.geometry.dispose(); }); }
  function arcR(region, move) { return region === 'knee' ? 0.8 : region === 'wrist' && /Deviation/.test(move) ? 0.8 : 1; }
  // arcFor (v17): arc frame from rom-pose-core arcGeom (degenerate segments such as the foot in inversion/eversion get a heel fan there),
  // scaled per movement and shifted where the arc would hide inside the body. ptsFor() turns a frame and an angle into points (no re-posing).
  function arcFor(root, region, name, side, scale) { var G = V.C.arcGeom(root, region, name, side); if (!G) return null; var k = (scale || 1) * arcR(region, name), sh = arcShift(region, name, side);
    if (region === 'ankle' && /version/.test(name)) G.v.setLength(V.H * 0.085);
    return { pv: sh ? G.pv.clone().add(sh) : G.pv.clone(), v: G.v.clone().multiplyScalar(k), axis: G.axis.clone(), sg: G.sg, d: G.d, last: G.last }; }
  var ARC_N = 40;
  function ptsFor(A, deg, out) { var a = V.C.shown(A.d, deg).deg * Math.PI / 180 * A.sg, pts = out || []; for (var i = 0; i <= ARC_N; i++) { var p = pts[i] || (pts[i] = new V.T.Vector3()); p.copy(A.v).applyAxisAngle(A.axis, a * i / ARC_N).add(A.pv); } pts.length = ARC_N + 1; return pts; }
  function arcShift(region, move, side) { if (region === 'hip' && move === 'Extension') return new V.T.Vector3((side === 'R' ? -1 : 1) * V.H * 0.03, 0, -V.H * 0.02); return null; }
  // v16: trunk/neck reference line (start position) from the pivot, grey
  function trunkLines(name) { if (!/^(cs|ts|ls)$/.test(S.region) || !/Flexion|Extension|Lat Flex/.test(name)) return; var d = def(), b0 = bonePos(V.base, d.b[0][0]); if (!b0) return; var len = V.H * (S.region === 'cs' ? 0.16 : 0.3);
    line([b0, b0.clone().add(new V.T.Vector3(0, len, 0))], 0x757575, V.H * 0.002, 0.8); }
  function applyPose(opt) {
    if (!V.base) return; opt = opt || {}; var yw = V.rig.rotation.y; V.rig.rotation.y = 0; V.rig.updateMatrixWorld(true);
    var tw = twEnabled() && !opt.noTween && !V.noTween; twSnap(V.twF); // v17: displayed pose before the change (start of the tween)
    var prevArc = V.arcShownKey, prevDeg = V.arcShown;
    try { applyPose0(); } finally { V.rig.rotation.y = yw; }
    if (tw) twStart(prevArc, prevDeg); else twFinish(true);
    colourZones(); indicators(); render(); clampNote(); }
  function applyPose0() {
    clearArcs(); V.arcO = null; var name = (rows(S.region)[S.i] || {}).name, d = def();
    if (!d) { V.C.neutral(V.base); V.ghost.visible = false; V.lastPose = null; V.poi = null; V.probe = null; V.arcShownKey = null; spineLine(); return; }
    var side = sideOf(), n = ROMDATA.norm(S.region, S.i).deg, dv = draft().deg, deg = dv === '' || isNaN(parseFloat(dv)) ? 0 : parseFloat(dv);
    var A = arcFor(V.base, S.region, name, side, 1), a1 = null, a2 = null;
    if (n != null) { var An = arcFor(V.base, S.region, name, side, 1.15); a1 = [An.pv.clone()].concat(ptsFor(An, n).map(function (p) { return p.clone(); })).concat([An.pv.clone()]); line(a1.slice(1, -1), 0x2e7d32, V.H * 0.003, 0.9); }
    if (A) { var pts = ptsFor(A, deg).map(function (p) { return p.clone(); }); a2 = [A.pv.clone()].concat(pts).concat([A.pv.clone()]);
      V.arcO = { A: A, tube: line(pts, 0xe65100, V.H * 0.0045), s1: line([A.pv, pts[0]], 0xe65100, V.H * 0.002, 0.6), s2: line([A.pv, pts[ARC_N]], 0xe65100, V.H * 0.002, 0.6), dot: dot(pts[ARC_N], 0xe65100), buf: [], deg: deg }; }
    V.arcPts = { a1: a1, a2: a2 }; V.arcShownKey = S.region + '|' + name + '|' + side; V.arcShown = deg;
    var res = V.C.pose(V.base, S.region, name, deg, side); if (n != null) { V.C.pose(V.ghost, S.region, name, n, side); V.ghost.visible = true; } else { V.C.neutral(V.ghost); V.ghost.visible = false; }
    trunkLines(name); spineLine();
    collectPoi(n != null ? a1 : null, a2);
    V.lastPose = { region: S.region, move: name, side: side, value: deg, shown: res.shown, clamped: res.clamped, clampMax: res.clampMax, norm: n, mode: S.mode };
  }
  // ---------- v17: smooth motion between poses (display only) ----------
  // Every bone of the figure and the ghost is eased from the pose on screen to the new pose over TWEEN_MS (ease-in-out cubic, quaternion slerp).
  // Values are written at once; only the drawing is eased. Skipped while dragging, when the page is hidden, or when V.noTween / __P10_NO_TWEEN is set.
  var TWEEN_MS = 420, FOLLOW = true; // v18: arcs and spine line follow the eased angle every frame; the spine line stays visible
  var TW = { b: null, on: false, t0: 0, n: 0, tok: 0 }, twStats = { frames: 0, maxStepMs: 0, sumStepMs: 0, gaps: 0, last: 0 };
  function twEnabled() { return !g.__P10_NO_TWEEN && !(typeof document !== 'undefined' && document.hidden) && !!V.r; }
  function twInit() { var b = []; [V.base, V.ghost].forEach(function (r) { r.traverse(function (o) { if (o.isBone) b.push(o); }); }); TW.b = b; TW.n = b.length;
    V.twF = new Float32Array(b.length * 4); V.twT = new Float32Array(b.length * 4); V.twS = new Float32Array(b.length * 4); V.twI = new Int32Array(b.length); TW.qa = new V.T.Quaternion(); TW.qb = new V.T.Quaternion(); }
  function twSnap(arr) { if (!TW.b) return; for (var i = 0; i < TW.n; i++) TW.b[i].quaternion.toArray(arr, i * 4); }
  function twLoad(arr) { for (var i = 0; i < TW.n; i++) TW.b[i].quaternion.fromArray(arr, i * 4); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function twStart(prevKey, prevDeg) { if (!TW.b) return; twSnap(V.twT); var k = 0, F = V.twF, Tt = V.twT;
    for (var i = 0; i < TW.n; i++) { var j = i * 4, dt = F[j] * Tt[j] + F[j + 1] * Tt[j + 1] + F[j + 2] * Tt[j + 2] + F[j + 3] * Tt[j + 3]; if (1 - Math.abs(dt) > 1e-9) V.twI[k++] = i; }
    TW.k = k; if (!k) { twFinish(true); return; }
    TW.arc0 = V.arcO && prevKey === V.arcShownKey && prevDeg != null ? prevDeg : null; TW.arc1 = V.arcShown;
    twLoad(F); V.base.updateMatrixWorld(true); V.ghost.updateMatrixWorld(true); TW.on = true; TW.t0 = now(); twStats.last = TW.t0;
    if (!FOLLOW && V.spine && V.spine.mesh) V.spine.mesh.visible = false; // v17: the spine line is redrawn at the end of the motion
    followFrame(0); twSched(); }
  function twApply(e) { var F = V.twF, Tt = V.twT; for (var m = 0; m < TW.k; m++) { var i = V.twI[m]; TW.qa.fromArray(F, i * 4); TW.qb.fromArray(Tt, i * 4); TW.b[i].quaternion.slerpQuaternions(TW.qa, TW.qb, e); } V.base.updateMatrixWorld(true); V.ghost.updateMatrixWorld(true); }
  function twSched() { var tok = ++TW.tok, run = function () { if (tok !== TW.tok) return; TW.tok++; twStep(); }; if (g.requestAnimationFrame) requestAnimationFrame(run); setTimeout(run, 60); } // watchdog: frames still come where rAF is throttled
  function twStep() { if (!TW.on) return; var t = now(), x = Math.min(1, (t - TW.t0) / TWEEN_MS), e = ease(x); twApply(e); followFrame(e);
    var gap = t - twStats.last; twStats.last = t; if (gap > 50) twStats.gaps++;
    var s0 = now(); if (V.anim) render(); else if (V.r && host()) { faceRings(); V.r.render(V.scene, V.cam); } var st = now() - s0; twStats.frames++; twStats.sumStepMs += st; twStats.maxStepMs = Math.max(twStats.maxStepMs, st);
    if (x >= 1) twFinish(); else twSched(); }
  function twFinish(silent) { if (!TW.b) return; var was = TW.on; TW.on = false; TW.tok++; if (was) { twLoad(V.twT); V.base.updateMatrixWorld(true); V.ghost.updateMatrixWorld(true); followFrame(1); }
    if (V.spine && V.spine.mesh) V.spine.mesh.visible = true; if (was && !silent) render(); }
  // v18 hook: arcs and spine line follow the eased angle (no-op in v17)
  function followFrame(e) { if (!FOLLOW) return; followArc(e); followSpine(); }
  function refill(m, pts) { if (!m || !m.geometry) return; var ud = m.geometry.userData || {}, at = m.geometry.attributes.position; if (!ud.np || ud.np !== pts.length) return; GEO.tubeFill(at.array, pts, ud.r, ud.rad); at.needsUpdate = true; m.frustumCulled = false; }
  function followArc(e) { var O = V.arcO; if (!O || !O.tube) return; var a1 = TW.arc1 == null ? O.deg : TW.arc1, a = TW.arc0 == null ? a1 : TW.arc0 + (a1 - TW.arc0) * e;
    var pts = ptsFor(O.A, a, O.buf); refill(O.tube, pts); refill(O.s2, [O.A.pv, pts[ARC_N]]); if (O.dot) O.dot.position.copy(pts[ARC_N]); O.shownNow = a; }
  function followSpine() { var sp = V.spine; if (!sp || !sp.mesh) return; var pts = sp.off.map(function (o, i) { return o.b.localToWorld(sp.tmp[i].copy(o.l)).clone(); }); refill(sp.mesh, chaikin(pts, 2)); sp.mesh.visible = true; }

  // ---------- v17: drag the moving part to set the angle ----------
  var DRAG_PX = 64;
  // Drag limit (display only): the movement's display clamp if it has one, otherwise normal + max(20°, 25% of normal) capped at 160° (180° when the normal is ≥170°); 90° when there is no normal. Clinic default, unsourced.
  function dragMax() { var d = def(); if (!d) return 0; if (d.clampMax != null) return d.clampMax; var n = ROMDATA.norm(S.region, S.i).deg; if (n == null) return 90; var cap = n >= 170 ? 180 : 160; return Math.min(cap, Math.round(n + Math.max(20, n * 0.25))); }
  var DG = {};
  function dragGeom() { var d = def(); if (!d) return null; var name = (rows(S.region)[S.i] || {}).name, side = sideOf(), key = S.region + '|' + name + '|' + side; if (DG[key]) return DG[key];
    var buf = new Float32Array(TW.n * 4); twSnap(buf); var A = arcFor(V.base, S.region, name, side, 1), T = V.T;
    V.base.updateMatrixWorld(true); var q0 = A.last.getWorldQuaternion(new T.Quaternion()), v0 = A.v.clone().sub(A.axis.clone().multiplyScalar(A.v.dot(A.axis))).normalize();
    // chain ratio: how far the chord pivot->tip turns per degree (multi-bone spine chains turn less than the last bone)
    var kr = 1; if (d.b.length > 1 && !d.arcTip) { V.C.pose(V.base, S.region, name, 30, side); V.base.updateMatrixWorld(true); var G30 = V.C.arcGeom ? null : null; var tip = tipNow(d, side), w = tip.sub(A.pv); w.sub(A.axis.clone().multiplyScalar(w.dot(A.axis))); var ang = Math.atan2(new T.Vector3().crossVectors(v0, w).dot(A.axis), v0.dot(w)) * 180 / Math.PI * A.sg; if (ang > 1) kr = ang / 30; }
    twLoad(buf); V.base.updateMatrixWorld(true);
    return (DG[key] = { A: A, q0: q0, v0: v0, kr: kr, len: A.v.length(), d: d }); }
  function tipNow(d, side) { var bl = V.base.getObjectByName(d.b[d.b.length - 1][0].replace(/_S$/, side === 'R' ? '_R' : '_L')), t = bl.children.find(function (c) { return c.isBone; });
    return t ? t.getWorldPosition(new V.T.Vector3()) : (endPoint(bl) || bl.getWorldPosition(new V.T.Vector3())); }
  function toScreen(p) { var h = host(), rc = h.getBoundingClientRect(), q = p.clone().project(V.cam); return { x: rc.left + (q.x + 1) / 2 * rc.width, y: rc.top + (1 - q.y) / 2 * rc.height, z: q.z }; }
  function tipAt(G, a, r) { return G.A.v.clone().multiplyScalar(r == null ? 1 : r).applyAxisAngle(G.A.axis, G.A.sg * a * G.kr * Math.PI / 180).add(G.A.pv); }
  function segDist(px, py, a, b) { var dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l)) : 0; return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)); }
  function curDeg() { var v = parseFloat(draft().deg); return isNaN(v) ? 0 : v; }
  function nearLimb(ev) { var G = dragGeom(); if (!G) return false; var a = curDeg(), pv = toScreen(G.A.pv), tp = toScreen(tipAt(G, V.C.shown(G.d, a).deg, 1.5)), best = segDist(ev.clientX, ev.clientY, pv, tp);
    if (V.arcO && V.arcO.tube) { var pts = ptsFor(V.arcO.A, a); for (var i = 0; i < pts.length; i += 4) { var s = toScreen(pts[i]); best = Math.min(best, Math.hypot(s.x - ev.clientX, s.y - ev.clientY)); } }
    return best <= DRAG_PX; }
  function rayAt(ev) { var h = host(), rc = h.getBoundingClientRect(), ray = new V.T.Raycaster(); ray.setFromCamera(new V.T.Vector2(((ev.clientX - rc.left) / rc.width) * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1), V.cam); return ray.ray; }
  function clampDeg(a) { var hi = dragMax(); return Math.max(0, Math.min(hi, Math.round(a))); }
  // v18: rotations, pronation/supination and ankle inversion/eversion (and arcs seen edge-on) use a swipe: SWIPE_PX of pointer travel along the
  // on-screen direction of the movement covers the whole drag range, so small rotations are easy to set by hand.
  var SWIPE_PX = 200;
  function swipeMode(G) { var name = (rows(S.region)[S.i] || {}).name || ''; if (/Rotation|nation|version/.test(name)) return true; var dir = V.cam.getWorldDirection(new V.T.Vector3()); return Math.abs(dir.dot(G.A.axis)) < 0.35; }
  function swipeTangent(G, a) { var hi = dragMax(), a2 = Math.min(hi, a + 5), a1 = a2 - 5, p = toScreen(tipAt(G, V.C.shown(G.d, a1).deg, 1)), q = toScreen(tipAt(G, V.C.shown(G.d, a2).deg, 1)), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
    return l < 1.5 ? { x: 1, y: 0 } : { x: dx / l, y: dy / l }; }
  function angleAt(ev, st) { var G = dragGeom(); if (!G) return null; var r = rayAt(ev), hi = dragMax();
    if (st && (st.mode === 'swipe' || (st.mode == null && swipeMode(G)))) { if (st.mode !== 'swipe') { st.mode = 'swipe'; st.tg = swipeTangent(G, st.deg0); }
      return clampDeg(st.deg0 + ((ev.clientX - st.x) * st.tg.x + (ev.clientY - st.y) * st.tg.y) * hi / SWIPE_PX); }
    if (Math.abs(r.direction.dot(G.A.axis)) > 0.2) { var den = r.direction.dot(G.A.axis), t = G.A.pv.clone().sub(r.origin).dot(G.A.axis) / den;
      if (t > 0) { var w = r.origin.clone().add(r.direction.clone().multiplyScalar(t)).sub(G.A.pv); w.sub(G.A.axis.clone().multiplyScalar(w.dot(G.A.axis)));
        var ang = Math.atan2(new V.T.Vector3().crossVectors(G.v0, w).dot(G.A.axis), G.v0.dot(w)) * 180 / Math.PI * G.A.sg / G.kr, per = 360 / G.kr, prev = st && st.last != null ? st.last : curDeg();
        while (ang - prev > per / 2) ang -= per; while (prev - ang > per / 2) ang += per; return clampDeg(ang); } }
    var best = 0, bd = 1e9; for (var a = 0; a <= hi; a++) { var s = toScreen(tipAt(G, a, 1)), dd = Math.hypot(s.x - ev.clientX, s.y - ev.clientY); if (dd < bd) { bd = dd; best = a; } } return clampDeg(best); }
  function dragLabel(ev, a) { var h = host(); if (!h) return; var lb = $('p10DragDeg'); if (!ev) { if (lb) lb.remove(); return; }
    if (!lb) { lb = document.createElement('div'); lb.id = 'p10DragDeg'; lb.style.cssText = 'position:absolute;pointer-events:none;background:#e65100;color:#fff;font:700 13px system-ui,sans-serif;padding:3px 8px;border-radius:12px;z-index:4;box-shadow:0 1px 4px rgba(0,0,0,.3)'; h.appendChild(lb); }
    var rc = h.getBoundingClientRect(), hi = dragMax(); lb.textContent = a + '°' + (a >= hi ? ' (max)' : a <= 0 ? ' (start)' : ''); lb.style.left = Math.min(rc.width - 70, ev.clientX - rc.left + 14) + 'px'; lb.style.top = Math.max(0, ev.clientY - rc.top - 30) + 'px'; }
  function setDragDeg(a) { var d = draft(); if (String(a) === String(d.deg)) return; d.deg = String(a); var o = $('p10Deg'); if (o) o.value = d.deg; applyPose({ noTween: true }); clampNote(); }
  function dragStartState(ev) { var G = dragGeom(), sw = G && swipeMode(G); return { x: ev.clientX, y: ev.clientY, deg0: curDeg(), last: null, mode: sw ? 'swipe' : 'plane', tg: sw ? swipeTangent(G, curDeg()) : null }; }
  function endDrag() { V.holdCam = false; V.forceAnim = true; dragLabel(null); render(); try { document.dispatchEvent(new CustomEvent('p10:dragset', { detail: { region: S.region, i: S.i, deg: draft().deg } })); } catch (e) {} }
  function bindPointer() {
    var h = host(); if (!h || h._p10) return; h._p10 = 1; var down = null, raf = 0, pend = null;
    h.addEventListener('pointerdown', function (e) { var arm = S.i >= 0 && !locked() && !!V.base && !V.fallback && nearLimb(e);
      down = { x: e.clientX, y: e.clientY, yaw: S.yaw, moved: false, id: e.pointerId, arm: arm, drag: false, st: arm ? dragStartState(e) : null }; try { h.setPointerCapture(e.pointerId); } catch (x) {} });
    h.addEventListener('pointermove', function (e) {
      if (!down) { if (e.pointerType === 'mouse') { var z = hoverLabel(e); h.style.cursor = z ? 'pointer' : (S.i >= 0 && !locked() && nearLimb(e) ? 'grab' : 'default'); } return; }
      var dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (down.arm) { if (!down.drag && Math.hypot(dx, dy) > 4) { down.drag = true; down.moved = true; twFinish(); V.holdCam = true; S.spin = false; h.style.cursor = 'grabbing'; }
        if (down.drag) { pend = { clientX: e.clientX, clientY: e.clientY }; if (!raf) { raf = 1; var go = function () { if (!raf) return; raf = 0; if (!pend || !down) return; var a = angleAt(pend, down.st); if (a != null) { down.st.last = a; setDragDeg(a); dragLabel(pend, a); } }; if (g.requestAnimationFrame) requestAnimationFrame(go); setTimeout(go, 50); } }
        return; }
      if (Math.abs(dx) > 6 || down.moved) { down.moved = true; S.spin = false; S.userView = true; S.yaw = down.yaw + dx * 0.01; render(true); } });
    function up(e) { var d = down; down = null; if (!d) return; if (d.drag) { if (pend && e.type !== 'pointercancel') { var a = angleAt(pend, d.st); if (a != null) setDragDeg(a); } raf = 0; pend = null; endDrag(); panel(); return; }
      if (d.moved || e.type === 'pointercancel') return; var z = pick(e); if (z) tapZone(z.region, z.side || ''); }
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    h.addEventListener('pointerleave', function () { var lb = $('p10Hover'); if (lb) lb.hidden = true; });
  }
  // test hooks: angle measured from the posed bones (twist of the last moving bone about the movement axis), screen point for an angle
  function measured() { var G = dragGeom(); if (!G) return null; V.base.updateMatrixWorld(true); var q = G.A.last.getWorldQuaternion(new V.T.Quaternion()).multiply(G.q0.clone().invert()), p = q.x * G.A.axis.x + q.y * G.A.axis.y + q.z * G.A.axis.z;
    var a = 2 * Math.atan2(p, q.w) * 180 / Math.PI * G.A.sg; if (a > 180) a -= 360; if (a < -180) a += 360; return Math.round(a * 10) / 10; }
  function dragMode() { var G = dragGeom(); return G ? (swipeMode(G) ? 'swipe' : 'plane') : null; }
  function swipeVector() { var G = dragGeom(); if (!G) return null; var t = swipeTangent(G, curDeg()); return { x: t.x, y: t.y, px: SWIPE_PX }; }
  function dragPoint(a, r) { var G = dragGeom(); if (!G) return null; return toScreen(tipAt(G, a, r == null ? 0.8 : r)); }
  // ---------- panel ----------
  function chips(list, cur, fn, idp) { return '<div class="p10-chips">' + list.map(function (o, j) { return '<span class="chip' + (cur === o ? ' active' : '') + '"' + (idp ? ' id="' + idp + j + '"' : '') + " data-cc-click=\"P1Rom." + fn + '(\'' + o + '\')">' + esc(o) + '</span>'; }).join('') + '</div>'; }
  function degOf(D, i, side, mode) { var v = D[ROMDATA.key(mode || 'A', 'deg', i, side)]; return ROMDATA.filled(v) && !isNaN(parseFloat(v)) ? parseFloat(v) : null; }
  // v16b: right/left comparison for limbs; v16b spine strip: paired rotations and side bending. Δ highlighted when it is ≥10% of normal (display rule).
  function compareStrip() { if (S.i < 0) return ''; var D = exam(S.region), ctx = ROMDATA.patientCtx(), R = rows(S.region), mode = S.mode, h = '';
    if (ROMDATA.sided(S.region)) {
      h = '<div class="p10-cmp" id="p10Cmp"><table><tr><th>' + (mode === 'A' ? 'Active' : 'Passive') + '</th><th>R</th><th>L</th><th>Δ</th></tr>';
      R.forEach(function (r, i) { var a = degOf(D, i, 'R', mode), b = degOf(D, i, 'L', mode), n = ROMDATA.norm(S.region, i, ctx).deg, dl = a != null && b != null ? Math.abs(a - b) : null, hi = dl != null && n != null && n > 0 && dl >= 0.1 * n;
        h += '<tr' + (hi ? ' class="p10-hi"' : '') + (i === S.i ? ' style="outline:1px solid #e65100"' : '') + '><td>' + esc(r.name) + '</td><td>' + (a == null ? '—' : a + '°') + '</td><td>' + (b == null ? '—' : b + '°') + '</td><td>' + (dl == null ? '' : dl + '°') + '</td></tr>'; });
      return h + '</table><div style="font-size:11px;color:var(--text2)">Highlighted: right and left differ by 10% of normal or more (display rule).</div></div>'; }
    return spineStrip(D, ctx, R, mode); }
  function spineStrip(D, ctx, R, mode) { var h = '<div class="p10-cmp" id="p10Spn"><table><tr><th>' + (mode === 'A' ? 'Active' : 'Passive') + '</th><th>Right</th><th>Left</th><th>Δ</th></tr>', idx = function (n) { return ROMDATA.indexOf(S.region, n); };
    [['Flexion', null], ['Extension', null], ['Right Rotation', 'Left Rotation'], ['Right Lat Flex', 'Left Lat Flex']].forEach(function (p) { var i = idx(p[0]); if (i < 0) return;
      if (!p[1]) { var v = degOf(D, i, '', mode); h += '<tr><td>' + esc(p[0]) + '</td><td colspan="3">' + (v == null ? '—' : v + '°') + '</td></tr>'; return; }
      var j = idx(p[1]), a = degOf(D, i, '', mode), b = j >= 0 ? degOf(D, j, '', mode) : null, n = ROMDATA.norm(S.region, i, ctx).deg, dl = a != null && b != null ? Math.abs(a - b) : null, hi = dl != null && n != null && dl >= 0.1 * n;
      h += '<tr' + (hi ? ' class="p10-hi"' : '') + '><td>' + esc(p[0].replace('Right ', '')) + '</td><td>' + (a == null ? '—' : a + '°') + '</td><td>' + (b == null ? '—' : b + '°') + '</td><td>' + (dl == null ? '' : dl + '°') + '</td></tr>'; });
    return h + '</table></div>'; }
  function panel(msg) {
    var p = $('p10Panel'); if (!p) return; var lk = locked();
    var cur = $('p10Rom') ? $('p10Rom').getAttribute('data-region') : null;
    if (V.fallback) { p.innerHTML = ''; return; }
    var legend = '<div class="p10-legend">Joint colour: <b style="color:#2e7d32">●</b> within normal <b style="color:#f9a825">●</b> reduced / painful <b style="color:#c62828">●</b> markedly reduced <b style="color:#9e9e9e">●</b> not recorded. Drag sideways to turn the figure.</div>';
    if (!S.region) { p.innerHTML = '<div><b>Tap a joint</b> on the figure to record its range of motion (left and right are separate).</div>' + legend; return; }
    var head = '<div style="font-weight:600;margin-bottom:6px" id="p10Head">' + esc(RNAME[S.region]) + (ROMDATA.sided(S.region) ? ' — ' + (S.side === 'R' ? 'Right' : 'Left') : '') + '</div>';
    if (ROMDATA.sided(S.region)) head += '<div style="margin-bottom:6px">' + ['R', 'L'].map(function (s) { return '<span class="chip p10-view' + (S.side === s ? ' active' : '') + '" id="p10Side' + s + "\" data-cc-click=\"P1Rom.tapZone('" + S.region + '\',\'' + s + '\')">' + (s === 'R' ? 'Right' : 'Left') + '</span>'; }).join(' ') + '</div>';
    if (cur && S.region !== cur) {
      var open = (APP.activeRegions || []).indexOf(S.region) >= 0;
      p.innerHTML = head + '<div style="margin:6px 0">' + esc(RNAME[S.region]) + (open ? ' has its own exam tab.' : ' is not part of this exam yet.') + "</div><button type=\"button\" class=\"btn btn-secondary\" id=\"p10OpenRegion\" data-cc-click=\"P1Rom.openRegion('" + S.region + '\')"' + (lk && !open ? ' disabled' : '') + '>' + (open ? 'Go to ' : 'Add ') + esc(RNAME[S.region]) + ' exam</button>' + legend; return; }
    var D = exam(S.region), ctx = ROMDATA.patientCtx(), side = ROMDATA.sided(S.region) ? S.side : '';
    var mv = '<div style="display:flex;flex-wrap:wrap;gap:4px">' + rows(S.region).map(function (r, i) {
      var a = D[ROMDATA.key('A', 'deg', i, side)], pv = D[ROMDATA.key('P', 'deg', i, side)], st = ROMDATA.status({ region: S.region, i: i, deg: a, pain: D[ROMDATA.key('A', 'pain', i, side)], grade: D[ROMDATA.key('A', 'grade', i, side)], mode: 'A' }, ctx);
      return '<span class="chip p10-view p10-move' + (S.i === i ? ' active' : '') + '" data-i="' + i + "\" data-cc-click=\"P1Rom.chooseMove(" + i + ')"><b style="color:' + hex(COL[st]) + '">●</b> ' + esc(r.name) + (a ? ' ' + esc(a) + '°' : '') + (pv ? ' / P ' + esc(pv) + '°' : '') + '</span>'; }).join('') + '</div>';
    if (S.i < 0) { p.innerHTML = head + '<div style="margin-bottom:4px">Choose a movement:</div>' + mv + legend + (msg ? '<div id="p10Msg" style="margin-top:6px">' + esc(msg) + '</div>' : ''); return; }
    var n = ROMDATA.norm(S.region, S.i, ctx), d = draft(), src = ROMDATA.SRC[n.src];
    var pad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '<'].map(function (k) { return '<button type="button" class="btn btn-secondary p10-key" data-key="' + k + "\" data-cc-click=\"P1Rom.padKey('" + k + '\')" style="min-width:48px;padding:8px 0"' + (lk ? ' disabled' : '') + '>' + (k === '<' ? '⌫' : k === '-' ? '±' : k) + '</button>'; }).join('');
    var legacyPain = d.pain && ROMDATA.PAIN.indexOf(d.pain) < 0 ? '<div style="font-size:11px;color:var(--text2)" id="p10PainLegacy">Recorded before v15 as: ' + (ROMDATA.isYes(d.pain) ? 'painful' : 'pain-free') + ' (' + esc(d.pain) + ')</div>' : '';
    p.innerHTML = head + mv +
      '<div style="margin:8px 0 4px">' + ['A', 'P'].map(function (m) { return '<span class="chip p10-view' + (S.mode === m ? ' active' : '') + '" id="p10Mode' + m + "\" data-cc-click=\"P1Rom.chooseMode('" + m + '\')">' + (m === 'A' ? 'Active' : 'Passive') + '</span>'; }).join(' ') + '</div>' +
      '<div style="font-size:12px;margin-bottom:4px" id="p10NormLine">Normal: <b>' + (n.deg == null ? '—' : n.deg + '°') + '</b> — ' + (src && src.url ? '<a href="' + src.url + '" target="_blank" rel="noopener">' + esc(n.label) + '</a>' : esc(n.label)) + (n.note ? ' <i>(' + esc(n.note) + ')</i>' : '') + '</div>' +
      '<div class="p10-entry"><div><label style="font-size:12px">Degrees</label><input id="p10Deg" inputmode="numeric" pattern="-?[0-9]*" style="width:80px;font-size:18px" value="' + esc(d.deg) + "\" data-cc-input=\"P1Rom.degInput(this)\"" + (lk ? ' disabled' : '') + '>' +
      '<div style="display:grid;grid-template-columns:repeat(3,48px);gap:4px;margin-top:4px">' + pad + '</div>' +
      '<div id="p10DragHint" style="font-size:11px;color:var(--text2);max-width:170px;margin-top:4px">' + (lk ? '' : 'Or drag the moving ' + (/^(cs)$/.test(S.region) ? 'head' : /^(ts|ls)$/.test(S.region) ? 'trunk' : 'limb') + ' on the figure to the angle you see; the degrees fill in here.') + '</div></div>' +
      '<div class="p10-opts"><label style="font-size:12px">Grade (optional)</label><div>' + chips(ROMDATA.GRADES, d.grade, 'grade', 'p10G') + '</div>' +
      '<label style="font-size:12px;margin-top:4px">Pain</label><div>' + chips(ROMDATA.PAIN, d.pain, 'pain', 'p10P') + legacyPain + '</div>' +
      '<label style="font-size:12px;margin-top:4px" for="p10Pscore">Pain score (0–10, optional)</label><div><input id="p10Pscore" inputmode="numeric" style="width:56px" value="' + esc(d.pscore || '') + '" data-cc-input="P1Rom.pscore(this.value)"' + (lk ? ' disabled' : '') + '></div>' +
      (S.mode === 'P' ? '<label style="font-size:12px;margin-top:4px">End feel</label><div>' + chips(EF, d.ef, 'ef', 'p10E') + '</div>' : '') + '</div></div>' +
      '<div id="p10Clamp" style="font-size:12px;color:#8a5a00;margin-top:6px" hidden></div>' +
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-secondary" id="p10Normal" data-cc-click="P1Rom.normal()"' + (lk || n.deg == null ? ' disabled' : '') + '>✓ Normal (WNL)</button>' +
      "<button type=\"button\" class=\"primary\" id=\"p10Save\" data-cc-click=\"P1Rom.save()\"" + (lk ? ' disabled' : '') + '>Save ' + (S.mode === 'A' ? 'active' : 'passive') + "</button><button type=\"button\" class=\"btn btn-secondary\" id=\"p10Clear\" data-cc-click=\"P1Rom.clearMove()\"" + (lk ? ' disabled' : '') + '>Clear</button></div>' +
      '<label class="p10-auto"><input type="checkbox" id="p10Auto" data-cc-change="P1Rom.setAuto(this.checked)"' + (autoOn() ? ' checked' : '') + '> Auto-advance to the next movement after saving</label>' +
      (lk ? '<div style="font-size:12px;color:#8a5a00;margin-top:6px">This visit is signed: ROM is read-only (view and rotate only). Use a dated addendum for corrections.</div>' : '') +
      (msg ? '<div id="p10Msg" style="font-size:12px;margin-top:6px">' + esc(msg) + '</div>' : '') +
      '<div class="p10-legend" id="p10ArcLegend"><b style="color:#e65100">━</b> orange arc: entered angle · <b style="color:#2e7d32">━</b> green ghost and arc: normal range' + (spineOn() ? ' · <b style="color:#e0a040">━</b> amber line: spine curve' : '') + ' · once a movement is chosen, drag the moving part to set degrees</div>' + compareStrip();
    clampNote();
  }
  function showCredits() {
    var o = $('p10Credits'); if (o) o.remove(); o = document.createElement('div'); o.id = 'p10Credits'; o.className = 'p10-view';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:center;justify-content:center';
    o.innerHTML = '<div style="background:#fff;max-width:600px;width:92%;max-height:86vh;overflow:auto;border-radius:10px;padding:18px;font-size:13px;line-height:1.5"><div style="font-weight:700;font-size:16px;margin-bottom:8px">About ChiroClinic — credits</div>' +
      '<p><b>3D figure:</b> built by ChiroClinic from the <a href="http://www.makehumancommunity.org/" target="_blank" rel="noopener">MakeHuman</a> base mesh, skin, eyes and hair assets, released under <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 1.0</a>. Rig, pose, materials and anatomy overlay are our own code. CC0 needs no attribution; MakeHuman is credited as a courtesy.</p>' +
      '<p><b>three.js</b> r170 (MIT) and the <b>meshoptimizer</b> decoder (MIT, Arseny Kapoulkine). <a href="./vendor/LICENSES-three-meshopt.txt" target="_blank" rel="noopener">Licence texts</a>.</p>' +
      '<p><b>Normal ROM values:</b> CDC normal joint range-of-motion study (<a href="https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index.html" target="_blank" rel="noopener">Soucie et al. 2011</a>) by age and sex; AAOS values as compiled in <a href="https://samples.jbpub.com/9781284105568/9781284105568_PT03.pdf" target="_blank" rel="noopener">Jones &amp; Bartlett Tables 3-13/3-14</a> (cervical, hip) and <a href="https://goniometer.io/rom-chart.pdf" target="_blank" rel="noopener">goniometer.io</a>; lumbar flexion, extension and side bending from the AMA Guides 5th ed. (dual inclinometer), as quoted in <a href="https://backtochiropractic.net/PDF/Basic%20AMA%20Impairment%20Ratings%20for%20Chiropractors%20Notes%20LMS.pdf" target="_blank" rel="noopener">this course text</a>. Lumbar rotation and thoracic values: clinic guide (Theunis), no published source; thoracic side bending has no reference value.</p>' +
      '<p style="font-size:12px;color:#555">' + esc(ROMDATA.LOSS_NOTE) + '</p>' +
      "<div style=\"text-align:right\"><button type=\"button\" class=\"btn btn-primary\" data-cc-click=\"document.getElementById('p10Credits').remove()\">Close</button></div></div>";
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); }); document.body.appendChild(o);
  }
  g.addEventListener && g.addEventListener('resize', function () { if (V.r && host()) { fit(); render(); } });
  g.P1Rom = { jump: jump, movePelvisToHip: movePelvisToHip, sectionHtml: sectionHtml, tablesHtml: tablesHtml, refreshTables: refreshTables, setKey: setKey, show: show, view: view, spin: spin, tapZone: tapZone, openRegion: openRegion,
    chooseMove: chooseMove, chooseMode: chooseMode, padKey: padKey, degInput: degInput, save: save, clearMove: clearMove, showCredits: showCredits,
    grade: function (v) { setDraft('grade', v); }, pain: function (v) { setDraft('pain', v); }, ef: function (v) { setDraft('ef', v); }, pscore: pscore, normal: normal, saveNext: saveNext, setAuto: setAuto, advance: advance,
    ready: function () { return boot(); }, state: S, _v: V, zoneScreen: function (r, s) { return zoneScreen(r + (s ? '_' + s : '')); }, render: render, settle: settle, viewCheck: viewCheck, viewTable: viewTable, viewKey: function () { return V.viewKey; }, VIEWS: VIEWS,
    tweening: function () { return TW.on; }, twStats: function () { return Object.assign({}, twStats); }, dragMax: dragMax, dragPoint: dragPoint, measured: measured, TWEEN_MS: TWEEN_MS, dragMode: dragMode, swipeVector: swipeVector, arcNow: function () { return V.arcO ? (V.arcO.shownNow != null ? V.arcO.shownNow : V.arcO.deg) : null; }, spineVisible: function () { return !!(V.spine && V.spine.mesh && V.spine.mesh.visible); },
    get lastPose() { return V.lastPose; }, get fallback() { return V.fallback; } };
})(window);
