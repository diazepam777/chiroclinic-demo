/* ChiroClinic anatomical overlay (our own code, 2026-10-19). Works on the owned MakeHuman-based figure with the app's three.js bundle.
 * - Surface masks painted into a vertex attribute 'anatMask' (x = contracting muscle, y = stretched muscle, z = ROM joint/region highlight).
 *   Masks are computed once in the neutral pose from skinned vertex positions, so they ride on the skin weights and stay attached when posed.
 * - A muscle region is the skin over a tapered tube running origin -> insertion through landmarks we define (bone + neutral-pose point,
 *   projected onto the body surface), limited to the side of the body the muscle lies on ('face' vector) and to the muscle's own side.
 * - Bony landmarks (small markers) and a procedural vertebral column (7 C, 12 T, 5 L, sacrum) parented to the spine bones.
 * No third-party geometry: everything is generated here from spheres in code.
 */
(function (g) {
  'use strict';
  function make(T) {
    var V3 = T.Vector3, D = Math.PI / 180;
    var COL = { con: [0.86, 0.16, 0.12], str: [0.45, 0.22, 0.78], joint: [1.0, 0.68, 0.12] };
    function bodyOf(root) { var b = null; root.traverse(function (o) { if (o.isSkinnedMesh && o.name === 'body') b = o; }); return b; }
    function skinnedPositions(mesh) { var p = mesh.geometry.attributes.position, n = p.count, out = new Float32Array(n * 3), v = new V3();
      mesh.skeleton.update(); mesh.updateMatrixWorld(true);
      for (var i = 0; i < n; i++) { v.fromBufferAttribute(p, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z; }
      return out; }
    function ensureAttr(mesh) { var geo = mesh.geometry; if (!geo.attributes.anatMask) { var A = geo.attributes.position.constructor; geo.setAttribute('anatMask', new A(new Float32Array(geo.attributes.position.count * 3), 3)); } return geo.attributes.anatMask; }
    // tint shader: mixes the lit colour towards the channel colour (keeps shading so the anatomy still reads as skin)
    function ensureFib(mesh) { var geo = mesh.geometry; if (!geo.attributes.anatFib) { var A = geo.attributes.position.constructor, n = geo.attributes.position.count, f = new Float32Array(n * 4);
        for (var i = 0; i < n; i++) { f[4 * i] = -10; f[4 * i + 1] = -10; f[4 * i + 2] = -1; } geo.setAttribute('anatFib', new A(f, 4)); } return geo.attributes.anatFib; }
    var NSLOT = 8;
    // Shader: (1) ROM joint highlight (amber, vAnat.z) exactly as before; (2) striated muscle sheets.
    // Each muscle vertex carries (a, t, slot, deep): a = position across the fibres 0..1 (edge to edge), t = position along the fibres 0..1 (origin -> insertion).
    // The fragment shader turns (a, t) into: crisp anti-aliased outline, fibre lines (striations) laid out per architecture (parallel / fusiform /
    // convergent / pennate / bipennate / multipennate), paler tendons/aponeuroses at the ends, tendinous intersections, column gaps.
    function installTint(mesh, opts) { opts = opts || {}; var m = mesh.material; if (m.userData.anatTint) return; m.userData.anatTint = true; ensureAttr(mesh); ensureFib(mesh);
      var arr = function () { var a = []; for (var i = 0; i < NSLOT; i++) a.push(new T.Quaternion(0, 0, 0, 0)); return a; };
      var U = { uCon: { value: new T.Color().fromArray(COL.con) }, uStr: { value: new T.Color().fromArray(COL.str) }, uJoint: { value: new T.Color().fromArray(COL.joint) }, uAmt: { value: new V3(0.62, 0.62, 0.5) }, uBase: { value: opts.base != null ? opts.base : (mesh.name === 'shorts' ? 0.95 : 0.55) },
        uMA: { value: arr() }, uMB: { value: arr() }, uMC: { value: arr() }, uOpa: { value: opts.opacity || 0.8 }, uOver: { value: opts.overlay ? 1 : 0 } };
      m.userData.anatU = U;
      m.onBeforeCompile = function (sh) { Object.assign(sh.uniforms, U);
        sh.vertexShader = 'attribute vec3 anatMask;\nattribute vec4 anatFib;\nvarying vec3 vAnat;\nvarying vec4 vFib;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAnat = anatMask; vFib = anatFib;');
        sh.fragmentShader = 'uniform vec3 uCon; uniform vec3 uStr; uniform vec3 uJoint; uniform vec3 uAmt; uniform float uBase; uniform float uOpa; uniform float uOver;\nuniform vec4 uMA[' + NSLOT + ']; uniform vec4 uMB[' + NSLOT + ']; uniform vec4 uMC[' + NSLOT + '];\nvarying vec3 vAnat;\nvarying vec4 vFib;\n' +
          'float aaStep(float x){ float w = max(fwidth(x), 1e-5); return clamp(x / w + 0.5, 0.0, 1.0); }\n' +
          sh.fragmentShader.replace('#include <dithering_fragment>',
          ' { float opv = 0.0; float lum = dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)); float shd = uBase + 0.75 * lum;\n' +
          '   gl_FragColor.rgb = mix(gl_FragColor.rgb, uJoint * shd, clamp(vAnat.z, 0.0, 1.0) * uAmt.z);\n' +
          '   if (vFib.z > -0.5) { int i = int(vFib.z + 0.5); vec4 A = uMA[i]; vec4 B = uMB[i]; vec4 C = uMC[i];\n' +
          '     float a = vFib.x, t = vFib.y, W = A.x, L = A.y, arch = A.z, pen = A.w;\n' +
          '     float inside = aaStep(a * W) * aaStep((1.0 - a) * W) * aaStep(t * L) * aaStep((1.0 - t) * L);\n' +
          '     float ac = clamp(a, 0.0, 1.0), tc = clamp(t, 0.0, 1.0), tp = tan(pen) * L;\n' +
          '     float s = ac * W;\n' +
          '     if (arch > 2.5 && arch < 3.5) s = ac * W + tc * tp;\n' +                                   // unipennate
          '     else if (arch > 3.5 && arch < 4.5) s = abs(ac - 0.5) * W + tc * tp;\n' +                    // bipennate (chevrons on a central raphe)
          '     else if (arch > 4.5) s = abs(fract(ac * 3.0) - 0.5) * W / 3.0 + tc * tp;\n' +              // multipennate
          '     float f = s * 1000.0 / 2.4; float fw = fwidth(f); float ln = 0.5 + 0.5 * cos(6.2831853 * f); ln = mix(ln, 0.5, clamp(fw * 1.2 - 0.3, 0.0, 1.0));\n' +
          '     float fb = 0.5 + 0.5 * cos(6.2831853 * s * 1000.0 / 9.5 + 1.7 * sin(tc * 9.0 + ac * 5.0)); fb = mix(fb, 0.5, clamp(fwidth(s * 1000.0 / 9.5) - 0.3, 0.0, 1.0));\n' +
          '     float tend = 1.0 - smoothstep(B.x - 0.025, B.x + 0.025, tc) + smoothstep(B.y - 0.025, B.y + 0.025, tc);\n' +
          '     for (int k = 0; k < 3; k++) { float ti = C[k]; if (ti > 0.0) tend = max(tend, 1.0 - smoothstep(0.004, 0.012, abs(tc - ti))); }\n' +
          '     if (arch > 3.5 && arch < 4.5) tend = max(tend, (1.0 - smoothstep(0.012, 0.03, abs(ac - 0.5))) * smoothstep(0.25, 0.45, tc));\n' +
          '     float colg = 1.0; if (B.w > 1.5) { float g1 = abs(fract(ac * B.w + 0.5) - 0.5) * W / B.w * 1000.0; colg = smoothstep(0.4, 1.4, g1); }\n' +
          '     vec3 base = B.z > 0.5 ? uStr * vec3(0.92, 0.9, 1.0) : vec3(0.78, 0.13, 0.11);\n' +
          '     vec3 pale = B.z > 0.5 ? vec3(0.87, 0.83, 0.96) : vec3(0.95, 0.88, 0.80);\n' +
          '     float bulge = 0.78 + 0.22 * sin(3.14159 * ac);\n' +
          '     vec3 mus = base * (0.55 + 0.45 * ln) * (0.86 + 0.14 * fb) * bulge * (0.55 + 0.45 * colg);\n' +
          '     vec3 ten = pale * (0.9 + 0.1 * (0.5 + 0.5 * cos(6.2831853 * ac * W * 1000.0 / 1.3)));\n' +
          '     vec3 col = mix(mus, ten, clamp(tend, 0.0, 1.0)) * (0.42 + 0.9 * lum);\n' +
          '     float edge = min(ac, 1.0 - ac) * W * 1000.0; col *= 1.0 - 0.38 * (1.0 - smoothstep(0.3, 2.2, edge));\n' +
          '     float op = inside * uOpa * mix(1.0, 0.4, clamp(vFib.w, 0.0, 1.0)) * C.w;\n' +
          '     gl_FragColor.rgb = mix(gl_FragColor.rgb, col, uOver > 0.5 ? 1.0 : op); opv = op; }\n' +
          '   gl_FragColor.rgb = mix(gl_FragColor.rgb, uStr * shd, clamp(vAnat.y, 0.0, 1.0) * uAmt.y);\n' +
          '   gl_FragColor.rgb = mix(gl_FragColor.rgb, uCon * shd, clamp(vAnat.x, 0.0, 1.0) * uAmt.x);\n   if (uOver > 0.5) { if (opv < 0.01) discard; gl_FragColor.a = opv; } }\n#include <dithering_fragment>'); };
      m.customProgramCacheKey = function () { return 'anatTint3_' + mesh.name; }; m.needsUpdate = true; }
    // ---------- muscle 'wrap': a subdivided copy of a clothing mesh (the shorts), skinned to the same skeleton and drawn just outside it,
    // transparent except where a muscle sheet is painted. The MakeHuman body has no skin under the shorts (proxy-deleted), so hip
    // muscles are drawn OVER the clothing (on a 16x denser surface) instead of being hidden or broken by the shorts' coarse triangles.
    function makeWrap(src, levels, offset) { var g = src.geometry, A = g.attributes, Ctor = A.position.constructor, idx = Array.from(g.index.array);
      var pos = Array.from(A.position.array), nor = Array.from(A.normal.array), si = Array.from(A.skinIndex.array), sw = Array.from(A.skinWeight.array);
      for (var lv = 0; lv < levels; lv++) { var cache = {}, out = [];
        var mid = function (a, b) { var k = a < b ? a + '_' + b : b + '_' + a; if (cache[k] != null) return cache[k]; var n = pos.length / 3, c;
          for (c = 0; c < 3; c++) { pos.push((pos[3 * a + c] + pos[3 * b + c]) / 2); nor.push((nor[3 * a + c] + nor[3 * b + c]) / 2); }
          var m = {}; for (c = 0; c < 4; c++) { m[si[4 * a + c]] = (m[si[4 * a + c]] || 0) + sw[4 * a + c] / 2; m[si[4 * b + c]] = (m[si[4 * b + c]] || 0) + sw[4 * b + c] / 2; }
          var e = Object.keys(m).map(function (q) { return [+q, m[q]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 4), tot = 0; e.forEach(function (q) { tot += q[1]; });
          for (c = 0; c < 4; c++) { si.push(e[c] ? e[c][0] : 0); sw.push(e[c] ? e[c][1] / tot : 0); } cache[k] = n; return n; };
        for (var t = 0; t < idx.length; t += 3) { var a = idx[t], b = idx[t + 1], c2 = idx[t + 2], ab = mid(a, b), bc = mid(b, c2), ca = mid(c2, a); out.push(a, ab, ca, ab, b, bc, ca, bc, c2, ab, bc, ca); }
        idx = out; }
      for (var i = 0; i < pos.length; i += 3) { var l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; for (var c3 = 0; c3 < 3; c3++) { nor[i + c3] /= l; pos[i + c3] += nor[i + c3] * (offset || 0.002); } }
      var geo = new T.BufferGeometry(); geo.setAttribute('position', new Ctor(new Float32Array(pos), 3)); geo.setAttribute('normal', new Ctor(new Float32Array(nor), 3));
      geo.setAttribute('skinIndex', new Ctor(new Uint16Array(si), 4)); geo.setAttribute('skinWeight', new Ctor(new Float32Array(sw), 4)); geo.setIndex(new Ctor(new Uint32Array(idx), 1));
      var mat = new src.material.constructor({ color: 0xd9b8a4, roughness: 0.62, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      var w = new src.constructor(geo, mat); w.name = 'musclewrap'; w.frustumCulled = false; w.renderOrder = 3; src.parent.add(w); w.bind(src.skeleton, src.bindMatrix); return w; }
    // ---------- v4b: each muscle sheet is its own thin skinned layer mesh (a copy of just the skin triangles under that muscle, lifted ~1 mm),
    // so neighbouring/overlapping muscles never share a vertex (no slot switching across a triangle = no zig-zags), and overlap is drawn by layering.
    function sheetLayers(root, surf, srcs, MU, LM, list, opts) { opts = opts || {}; var mat = null, meshes = [], slots = [], lmsOut = {};
      list.forEach(function (m, si) { var Mu = MU[m.id]; if (!Mu || !Mu.sheet) throw new Error('muscle sheet ' + m.id); var S = Mu.sheet, W0 = null;
        srcs.forEach(function (src) { var P = src.userData.anatP || (src.userData.anatP = skinnedPositions(src)), G = src.geometry, N = G.attributes.normal.array, n = P.length / 3;
          var gr = sheetGrid(root, surf, P, N, LM, S, m.side); if (!W0) { W0 = gr; lmsOut[m.id + '_' + m.side] = gr.lms; }
          var cov = (S.coveredBy || []).map(function (cid) { return sheetGrid(root, surf, P, N, LM, MU[cid].sheet, m.side); });
          var A = new Float32Array(n * 3).fill(NaN), o = {};
          gr.cand.forEach(function (vi) { if (!sheetCoords(gr, P, vi, o)) return; if (o.a < -0.35 || o.a > 1.35 || o.t < -0.2 || o.t > 1.2) return; A[3 * vi] = o.a; A[3 * vi + 1] = o.t; A[3 * vi + 2] = 0; });
          var idx = G.index.array, map = new Int32Array(n).fill(-1), vs = [], tri = [];
          for (var t = 0; t < idx.length; t += 3) { var ok = false, c, v;
            for (c = 0; c < 3; c++) { v = idx[t + c]; if (A[3 * v] === A[3 * v] && A[3 * v] > -0.05 && A[3 * v] < 1.05 && A[3 * v + 1] > -0.05 && A[3 * v + 1] < 1.05) ok = true; } if (!ok) continue;
            for (c = 0; c < 3; c++) { v = idx[t + c]; if (A[3 * v] !== A[3 * v]) { if (!sheetCoords(gr, P, v, o, true)) { ok = false; break; } A[3 * v] = o.a; A[3 * v + 1] = o.t; } } if (!ok) continue;
            for (c = 0; c < 3; c++) { v = idx[t + c]; if (map[v] < 0) { map[v] = vs.length; vs.push(v); } tri.push(map[v]); } }
          if (!tri.length) return;
          var Ab = G.attributes, Ctor = Ab.position.constructor, k = vs.length, pos = new Float32Array(k * 3), nor = new Float32Array(k * 3), fib = new Float32Array(k * 4), msk = new Float32Array(k * 3),
            sI = new Ab.skinIndex.array.constructor(k * 4), sW = new Float32Array(k * 4), lift = (opts.lift || 0.0012) + si * 0.0003;
          vs.forEach(function (v, j) { var nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2], l = Math.hypot(nx, ny, nz) || 1;
            for (var c = 0; c < 3; c++) { nor[3 * j + c] = N[3 * v + c] / l; pos[3 * j + c] = Ab.position.array[3 * v + c] + nor[3 * j + c] * lift; }
            for (c = 0; c < 4; c++) { sI[4 * j + c] = Ab.skinIndex.array[4 * v + c]; sW[4 * j + c] = Ab.skinWeight.array[4 * v + c]; }
            var deep = 0; cov.forEach(function (cg) { var q = {}; if (sheetCoords(cg, P, v, q)) deep = Math.max(deep, Math.min(1, Math.max(0, Math.min(q.a * cg.W, (1 - q.a) * cg.W, q.t * cg.L, (1 - q.t) * cg.L) / 0.008 + 0.5))); });
            fib[4 * j] = A[3 * v]; fib[4 * j + 1] = A[3 * v + 1]; fib[4 * j + 2] = si; fib[4 * j + 3] = deep; });
          var geo = new T.BufferGeometry(); geo.setAttribute('position', new Ctor(pos, 3)); geo.setAttribute('normal', new Ctor(nor, 3)); geo.setAttribute('skinIndex', new Ctor(sI, 4)); geo.setAttribute('skinWeight', new Ctor(sW, 4));
          geo.setAttribute('anatFib', new Ctor(fib, 4)); geo.setAttribute('anatMask', new Ctor(msk, 3)); geo.setIndex(new Ctor(new Uint32Array(tri), 1));
          if (!mat) { mat = new src.material.constructor({ color: 0xd9b8a4, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); }
          var me = new src.constructor(geo, mat); me.name = 'anat_layer'; me.frustumCulled = false; me.renderOrder = 4 + si * 0.01; src.parent.add(me); me.bind(src.skeleton, src.bindMatrix);
          if (!mat.userData.anatTint) installTint(me, { overlay: true, opacity: opts.opacity || 0.86 }); meshes.push(me); });
        if (mat && W0 && si < NSLOT) { var U = mat.userData.anatU, tn = S.tendon || [0.06, 0.92], ints = (S.intersections || []).concat([-1, -1, -1]);
          U.uMA.value[si].set(W0.W, W0.L, ARCH[S.arch] || 0, (S.pennation || 0) * D); U.uMB.value[si].set(tn[0], tn[1], m.ch, S.columns || 0); U.uMC.value[si].set(ints[0], ints[1], ints[2], 1); }
        slots.push({ id: m.id, side: m.side, W: W0 ? +W0.W.toFixed(3) : 0, L: W0 ? +W0.L.toFixed(3) : 0 }); });
      // uniforms for slots set before the first mesh existed
      if (mat) list.forEach(function (m, si) { var S = MU[m.id].sheet, U = mat.userData.anatU, sl = slots[si]; if (si >= NSLOT) return; var tn = S.tendon || [0.06, 0.92], ints = (S.intersections || []).concat([-1, -1, -1]);
        U.uMA.value[si].set(sl.W, sl.L, ARCH[S.arch] || 0, (S.pennation || 0) * D); U.uMB.value[si].set(tn[0], tn[1], m.ch, S.columns || 0); U.uMC.value[si].set(ints[0], ints[1], ints[2], 1); });
      return { meshes: meshes, slots: slots, lms: lmsOut }; }
    // ---------- v5: VOLUMETRIC muscles (ChiroClinic's own procedural method; no third-party geometry).
    // For each muscle: the origin->belly->insertion sheet grid (K x J, snapped to OUR CC0 skin) is turned into a muscle body whose
    // surface rises from a deep plane (skin - T) to the skin by a cross-section profile (fusiform / sheet / fan) x a belly/tendon
    // profile along the fibres. Deep muscles are flattened under the superficial ones. Fibre striation = procedural bump (normal
    // perturbation) along the sourced fibre architecture; tendons/aponeuroses pale and glossy. Skinned to the figure's bones.
    var VOLX = 48, VOLJ = 72;
    function volProfile(S, a, t) { var ac = Math.min(1, Math.max(0, a)), tc = Math.min(1, Math.max(0, t)), ar = S.arch, sm = function (e0, e1, x) { var u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
      var c = ar === 'fusiform' ? Math.pow(Math.sin(Math.PI * ac), 0.6) : (S.flat ? sm(0, 0.16, ac) * sm(0, 0.16, 1 - ac) : Math.pow(Math.sin(Math.PI * ac), 0.42));
      var tn = S.tendon || [0.06, 0.92], b = sm(tn[0] - 0.03, tn[0] + 0.12, tc) * (1 - sm(tn[1] - 0.12, tn[1] + 0.03, tc));
      if (ar === 'fusiform' || ar === 'bipennate') b *= 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, (tc - tn[0]) / Math.max(0.05, tn[1] - tn[0]))));
      return { h: c * (0.14 + 0.86 * b), ten: 1 - b }; }
    function muscleVolumes(root, surf, srcs, MU, LM, list, opts) { opts = opts || {}; var body = srcs[0], bones = body.skeleton.bones, nameIdx = {}; bones.forEach(function (b, i) { nameIdx[b.name] = i; });
      // combined neutral positions / normals / skin weights (mapped to the body skeleton)
      var PP = [], NN = [], SI = [], SW = [], owner = [];
      srcs.forEach(function (src, s) { var P = src.userData.anatP || (src.userData.anatP = skinnedPositions(src)), A = src.geometry.attributes, sb = src.skeleton.bones, n = P.length / 3;
        for (var i = 0; i < n; i++) { PP.push(P[3 * i], P[3 * i + 1], P[3 * i + 2]); NN.push(A.normal.array[3 * i], A.normal.array[3 * i + 1], A.normal.array[3 * i + 2]);
          for (var c = 0; c < 4; c++) { SI.push(nameIdx[sb[A.skinIndex.array[4 * i + c]].name] || 0); SW.push(A.skinWeight.array[4 * i + c]); } owner.push(s); } });
      var P = new Float32Array(PP), N = new Float32Array(NN), n = P.length / 3, out = [], cover = new Float32Array(n), depth = new Float32Array(n);
      body.updateMatrixWorld(true); bones.forEach(function (b) { b.updateMatrixWorld(true); });
      var BM = body.bindMatrix, BMI = body.bindMatrixInverse, MWI = body.matrixWorld.clone().invert();
      var grids = {}; function gridOf(id, side) { var k = id + side; if (!grids[k]) grids[k] = sheetGrid(root, surf, P, N, LM, MU[id].sheet, side, VOLX, VOLJ); return grids[k]; }
      list.forEach(function (m, si) { var S = MU[m.id].sheet, V = MU[m.id].volume || {}, T0 = V.thickness || 0.015, gr = gridOf(m.id, m.side), G = gr.G, K = gr.K, J = gr.J;
        var cov = (S.coveredBy || []).filter(function (cid) { return list.some(function (x) { return x.id === cid && x.side === m.side; }); }).map(function (cid) { return gridOf(cid, m.side); });
        var onrm = [], wpos = [], pos = [], fib = [], sI = [], sW = [], idx = [], q = {}, v = new V3(), nrm = new V3(), M4 = body.matrixWorld.constructor, mat4 = new M4(), tmp = new M4();
        for (var k = 0; k < K; k++) for (var j = 0; j < J; j++) { var g = G[k][j], a = k / (K - 1), t = j / (J - 1), best = 1e9, bi = 0;
          for (var c = 0; c < gr.cand.length; c++) { var w = gr.cand[c], dx = P[3 * w] - g.x, dy = P[3 * w + 1] - g.y, dz = P[3 * w + 2] - g.z, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bi = w; } }
          nrm.set(N[3 * bi], N[3 * bi + 1], N[3 * bi + 2]).normalize(); var pr = volProfile(S, a, t), deep = 0;
          cov.forEach(function (cg) { if (sheetCoords(cg, P, bi, q)) deep = Math.max(deep, Math.min(1, Math.max(0, Math.min(q.a * cg.W, (1 - q.a) * cg.W, q.t * cg.L, (1 - q.t) * cg.L) / 0.012 + 0.5))); });
          var lift = -T0 + T0 * pr.h * (1 - 0.72 * deep) * (1 + (V.bulge || 0.12)) + 0.0015 - (deep > 0 ? 0.004 : 0);
          v.copy(g).addScaledVector(nrm, lift);
          wpos.push(v.x, v.y, v.z); onrm.push(nrm.x, nrm.y, nrm.z);
          // world (neutral) -> bind space of the body: p = BMI * S^-1 * BM * MW^-1 * world, S = sum w_i * boneWorld_i * boneInverse_i
          mat4.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); for (c = 0; c < 4; c++) { var wgt = SW[4 * bi + c]; if (!wgt) continue; tmp.multiplyMatrices(bones[SI[4 * bi + c]].matrixWorld, body.skeleton.boneInverses[SI[4 * bi + c]]);
            for (var e = 0; e < 16; e++) mat4.elements[e] += wgt * tmp.elements[e]; }
          v.applyMatrix4(MWI).applyMatrix4(BM).applyMatrix4(mat4.invert()).applyMatrix4(BMI);
          pos.push(v.x, v.y, v.z); fib.push(a, t, pr.ten, deep); for (c = 0; c < 4; c++) { sI.push(SI[4 * bi + c]); sW.push(SW[4 * bi + c]); } }
        for (k = 0; k < K - 1; k++) for (j = 0; j < J - 1; j++) { var i0 = k * J + j, i1 = i0 + J; idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
        // deep layer footprint on the skin (atlas mode pushes the skin in by T there)
        gr.cand.forEach(function (w) { if (!sheetCoords(gr, P, w, q)) return; var e = Math.min(q.a * gr.W, (1 - q.a) * gr.W, q.t * gr.L, (1 - q.t) * gr.L), cv = Math.min(1, Math.max(0, e / 0.02 + 1)); if (cv > cover[w]) cover[w] = cv; depth[w] = Math.max(depth[w], T0 * Math.min(1, Math.max(0, e / 0.01 + 1))); });
        var geo = new T.BufferGeometry(), Ab = body.geometry.attributes, Ctor = Ab.position.constructor;
        geo.setAttribute('position', new Ctor(new Float32Array(pos), 3)); geo.setAttribute('mFib', new Ctor(new Float32Array(fib), 4));
        geo.setAttribute('skinIndex', new Ctor(new Ab.skinIndex.array.constructor(sI), 4)); geo.setAttribute('skinWeight', new Ctor(new Float32Array(sW), 4)); geo.setIndex(new Ctor(new Uint32Array(idx), 1)); geo.computeVertexNormals();
        { var nA = geo.attributes.normal.array, dsum = 0; for (var z = 0; z < nA.length / 3; z++) dsum += nA[3 * z] * onrm[3 * z] + nA[3 * z + 1] * onrm[3 * z + 1] + nA[3 * z + 2] * onrm[3 * z + 2];
          if (dsum < 0) { for (z = 0; z < idx.length; z += 3) { var sw0 = idx[z + 1]; idx[z + 1] = idx[z + 2]; idx[z + 2] = sw0; } geo.setIndex(new Ctor(new Uint32Array(idx), 1)); geo.computeVertexNormals(); } }
        var mat = volMaterial(body.material.constructor, S, gr, m.ch, opts), me = new body.constructor(geo, mat); me.name = 'muscle_' + m.id + '_' + m.side; me.frustumCulled = false; me.castShadow = true; me.receiveShadow = true;
        body.parent.add(me); me.bind(body.skeleton, body.bindMatrix); me.userData.wp = wpos; out.push(me); });
      // split cover/depth back per source mesh
      var per = [], o0 = 0; srcs.forEach(function (src) { var m2 = src.geometry.attributes.position.count; per.push({ cover: cover.slice(o0, o0 + m2), depth: depth.slice(o0, o0 + m2) }); o0 += m2; });
      return { meshes: out, per: per }; }
    function volMaterial(Std, S, gr, ch, opts) { var m = new Std({ color: 0xffffff, roughness: 0.5, metalness: 0 }), tn = S.tendon || [0.06, 0.92], ints = (S.intersections || []).concat([-1, -1, -1]);
      var U = { vA: { value: new T.Quaternion(gr.W, gr.L, ARCH[S.arch] || 0, (S.pennation || 0) * D) }, vB: { value: new T.Quaternion(ints[0], ints[1], ints[2], S.columns || 0) },
        vTint: { value: new V3().fromArray(ch === 1 ? [0.52, 0.34, 0.78] : [0.78, 0.10, 0.07]) }, vTintAmt: { value: opts.tintAmt == null ? 0.3 : opts.tintAmt } };
      m.onBeforeCompile = function (sh) { Object.assign(sh.uniforms, U);
        sh.vertexShader = 'attribute vec4 mFib;\nvarying vec4 vMF;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMF = mFib;');
        var pre = 'uniform vec4 vA; uniform vec4 vB; uniform vec3 vTint; uniform float vTintAmt; varying vec4 vMF;\n' +
          'float fibS(){ float a = clamp(vMF.x,0.0,1.0), t = clamp(vMF.y,0.0,1.0), W = vA.x, L = vA.y, ar = vA.z, tp = tan(vA.w) * L; float s = a * W;\n' +
          ' if (ar > 3.5 && ar < 4.5) s = abs(a - 0.5) * W + t * tp; else if (ar > 4.5) s = abs(fract(a * 3.0) - 0.5) * W / 3.0 + t * tp; else if (ar > 2.5) s = a * W + t * tp; return s * 1000.0; }\n' +
          'float tendF(){ float te = vMF.z; for (int k = 0; k < 3; k++) { if (vB[k] > 0.0) te = max(te, 1.0 - smoothstep(0.004, 0.014, abs(vMF.y - vB[k]))); }\n' +
          ' if (vA.z > 3.5 && vA.z < 4.5) te = max(te, (1.0 - smoothstep(0.01, 0.035, abs(vMF.x - 0.5))) * smoothstep(0.3, 0.5, vMF.y) * 0.85); return clamp(te, 0.0, 1.0); }\n' +
          'float fibH(){ float s = fibS(); float t = vMF.y * vA.y * 1000.0; float h = 0.5 + 0.5 * cos(6.2831853 * s / 0.9); float hb = 0.5 + 0.5 * cos(6.2831853 * s / 3.4 + 2.0 * sin(t / 23.0));\n' +
          ' float fw = fwidth(s); h = mix(h, 0.5, clamp(fw * 3.0 - 0.3, 0.0, 1.0)); hb = mix(hb, 0.5, clamp(fwidth(s / 3.4) * 2.5 - 0.3, 0.0, 1.0)); float col = 1.0; if (vB.w > 1.5) { float g = abs(fract(clamp(vMF.x,0.0,1.0) * vB.w + 0.5) - 0.5) * vA.x / vB.w * 1000.0; col = smoothstep(0.5, 2.5, g); }\n' +
          ' return (0.35 * h + 0.65 * hb) * (1.0 - 0.7 * tendF()) * col + (1.0 - col) * -0.6; }\n';
        sh.fragmentShader = pre + sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n { float te = tendF(); vec3 mus = vec3(0.40, 0.07, 0.06) * (0.88 + 0.12 * fibH()); mus = mix(mus, vTint * 0.55, vTintAmt);\n' +
            '   vec3 ten = vec3(0.88, 0.85, 0.80); diffuseColor.rgb = mix(mus, ten, te); }')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.48, 0.24, tendF());')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n { float h = fibH() * 0.0006; vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition); vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1) * faceDirection;\n' +
            '   vec3 gr = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2); normal = normalize(abs(det) * normal - gr); }')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0); totalEmissiveRadiance += diffuseColor.rgb * (0.015 + 0.22 * fr) * vec3(1.0, 0.7, 0.65); }'); };
      m.customProgramCacheKey = function () { return 'vol1'; }; return m; }
    function sideName(b, side) { return b.replace(/_S$/, side === 'R' ? '_R' : '_L'); }
    function mirror(a, side) { return side === 'R' ? [-a[0], a[1], a[2]] : a.slice(); }
    // landmark -> world point on (just under) the body surface, in the CURRENT pose (call in neutral)
    var ray = new T.Raycaster();
    function surfacePoint(body, at, dir, inset) { var o = new V3().fromArray(at), d = new V3().fromArray(dir).normalize();
      ray.set(o.clone().add(d.clone().multiplyScalar(0.4)), d.clone().negate()); ray.near = 0; ray.far = 0.8; 
      var h = (Array.isArray(body) ? ray.intersectObjects(body, false) : ray.intersectObject(body, false))[0]; return h ? h.point.clone().sub(d.multiplyScalar(inset == null ? 0.008 : inset)) : o; }
    // anchors parented to bones so markers follow the pose
    function anchor(root, boneName, wp) { var b = root.getObjectByName(boneName); if (!b) return null; var a = new T.Group(); b.updateMatrixWorld(true); a.position.copy(b.worldToLocal(wp.clone())); a.name = 'anat_anchor'; b.add(a); return a; }
    function resolveLandmarks(root, body, LM, ids, side, insetOverride) { var out = {}; ids.forEach(function (id) { var L = LM[id]; if (!L) throw new Error('landmark ' + id); var s = L.midline ? 'L' : side;
      var wp = L.surface === false ? new V3().fromArray(mirror(L.at, s)) : surfacePoint(body, mirror(L.at, s), mirror(L.dir || [0, 0, -1], s), insetOverride != null ? insetOverride : L.inset);
      var dw = new V3().fromArray(mirror(L.dir || [0, 0, -1], s)).normalize(), mp = wp.clone().add(dw.multiplyScalar((insetOverride != null ? insetOverride : (L.inset == null ? 0.008 : L.inset)) + 0.002));
      out[id] = { id: id, name: L.name, bone: sideName(L.bone, s), wp: wp, anchor: anchor(root, sideName(L.bone, s), mp) }; }); return out; }
    function segDist(p, a, b) { var ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return { d: p.distanceTo(a.clone().add(ab.multiplyScalar(t))), t: t, c: a.clone().add(b.clone().sub(a).multiplyScalar(t)) }; }
    // paint one muscle (in the neutral pose) into channel ch (0 con, 1 str)
    function paintMuscle(root, body, P, MU, LM, id, side, ch, mask) { var M = MU[id]; if (!M) throw new Error('muscle ' + id);
      var lms = resolveLandmarks(root, body, LM, M.path, side), pts = M.path.map(function (k) { return lms[k].wp; });
      var lens = [0]; for (var i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1])); var Ltot = lens[lens.length - 1];
      var face = M.face ? new V3().fromArray(mirror(M.face, side)).normalize() : null, r0 = M.r[0], r1 = M.r[1], n = P.length / 3, v = new V3(), sgn = side === 'R' ? -1 : 1;
      for (var k = 0; k < n; k++) { v.set(P[3 * k], P[3 * k + 1], P[3 * k + 2]); if (!M.midlineCross && v.x * sgn < -0.005) continue;
        var best = 1e9, bt = 0, bc = null; for (var j = 1; j < pts.length; j++) { var s = segDist(v, pts[j - 1], pts[j]); if (s.d < best) { best = s.d; bt = (lens[j - 1] + s.t * (lens[j] - lens[j - 1])) / Ltot; bc = s.c; } }
        var r = r0 + (r1 - r0) * Math.sin(Math.PI * Math.min(1, Math.max(0, bt))); if (best > r) continue;
        var w = 1 - Math.pow(best / r, 3); if (face) { var f = v.clone().sub(bc).normalize().dot(face); if (f < (M.faceMin == null ? 0.05 : M.faceMin)) continue; w *= Math.min(1, (f - (M.faceMin == null ? 0.05 : M.faceMin)) / 0.25); }
        var ends = Math.min(bt, 1 - bt); w *= Math.min(1, 0.35 + ends * 5); // tendon ends a little fainter than the belly
        mask[3 * k + ch] = Math.max(mask[3 * k + ch], w); }
      return lms; }
    // ---------- striated muscle sheets (our own procedural method)
    // A muscle = a sheet of fibres. Fibre k runs from origin polyline O(a_k) (via optional belly polyline M(a_k)) to insertion polyline I(a_k).
    // The sheet is sampled into a K x J grid, snapped onto the skin along the local normal, and every nearby skin vertex gets (a, t) by
    // linear extrapolation from the nearest grid point (so the outline is drawn crisply in the fragment shader, between vertices).
    var ARCH = { parallel: 0, strap: 0, fusiform: 1, convergent: 2, fan: 2, pennate: 3, unipennate: 3, bipennate: 4, multipennate: 5 };
    function resample(pts, K) { var L = [0]; for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1])); var tot = L[L.length - 1], out = [];
      if (pts.length === 1 || tot < 1e-6) { for (var k = 0; k < K; k++) out.push(pts[0].clone()); return { pts: out, len: 0 }; }
      for (var k = 0; k < K; k++) { var s = tot * k / (K - 1), j = 1; while (j < pts.length - 1 && L[j] < s) j++; var u = (s - L[j - 1]) / Math.max(1e-9, L[j] - L[j - 1]); out.push(pts[j - 1].clone().lerp(pts[j], Math.min(1, Math.max(0, u)))); }
      return { pts: out, len: tot }; }
    function sheetGrid(root, body, P, N, LM, S, side, K0, J0) { var ids = S.O.concat(S.M || [], S.I), lms = resolveLandmarks(root, body, LM, ids.filter(function (x, i) { return ids.indexOf(x) === i; }), side, 0);
      var K = K0 || 36, J = J0 || 56, get = function (l) { return l.map(function (k) { return lms[k].wp; }); };
      var O = resample(get(S.O), K), I = resample(get(S.I), K), M = S.M ? resample(get(S.M), K) : null, G = [], n = P.length / 3, sgn = side === 'R' ? -1 : 1;
      var face = new V3().fromArray(mirror(S.face || [0, 0, -1], side)).normalize(), fmin = S.faceMin == null ? -0.2 : S.faceMin;
      for (var k = 0; k < K; k++) { var f = M ? [O.pts[k], M.pts[k], I.pts[k]] : [O.pts[k], I.pts[k]], r = resample(f, J); G.push(r.pts); }
      // bounding box + candidate skin vertices (side, facing)
      var lo = new V3(1e9, 1e9, 1e9), hi = new V3(-1e9, -1e9, -1e9); G.forEach(function (row) { row.forEach(function (p) { lo.min(p); hi.max(p); }); }); lo.subScalar(0.06); hi.addScalar(0.06);
      var cand = [], v = new V3(), nn = new V3();
      for (var i = 0; i < n; i++) { var x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2]; if (x < lo.x || y < lo.y || z < lo.z || x > hi.x || y > hi.y || z > hi.z) continue; if (!S.midline && x * sgn < -0.004) continue; cand.push(i); }
      var snapC = cand.filter(function (i) { return N[3 * i] * face.x + N[3 * i + 1] * face.y + N[3 * i + 2] * face.z > fmin; });
      // snap each grid point to the skin along the nearest vertex normal
      for (var k2 = 0; k2 < K; k2++) for (var j = 0; j < J; j++) { var g = G[k2][j], best = 1e9, bi = -1;
        for (var c = 0; c < snapC.length; c++) { var q = snapC[c], dx = P[3 * q] - g.x, dy = P[3 * q + 1] - g.y, dz = P[3 * q + 2] - g.z, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bi = q; } }
        if (bi >= 0) { v.set(P[3 * bi], P[3 * bi + 1], P[3 * bi + 2]); nn.set(N[3 * bi], N[3 * bi + 1], N[3 * bi + 2]).normalize(); g.add(nn.multiplyScalar(v.sub(g).dot(nn))); } }
      for (var it = 0; it < (K0 ? 8 : 2); it++) { var G2 = G.map(function (row) { return row.map(function (p) { return p.clone(); }); });   // light smoothing of snap jitter
        for (k2 = 1; k2 < K - 1; k2++) for (j = 1; j < J - 1; j++) G[k2][j].copy(G2[k2][j].clone().multiplyScalar(0.5).add(G2[k2 - 1][j].clone().add(G2[k2 + 1][j]).add(G2[k2][j - 1]).add(G2[k2][j + 1]).multiplyScalar(0.125))); }
      var Wm = 0, Lm = 0; for (k2 = 0; k2 < K; k2++) { var l = 0; for (j = 1; j < J; j++) l += G[k2][j].distanceTo(G[k2][j - 1]); Lm += l / K; }
      var jb = Math.round((J - 1) * (S.beltT == null ? 0.5 : S.beltT)); for (k2 = 1; k2 < K; k2++) Wm += G[k2][jb].distanceTo(G[k2 - 1][jb]);
      return { G: G, K: K, J: J, cand: cand, W: Wm, L: Lm, lms: lms }; }
    function sheetCoords(gr, P, i, out, force) { var G = gr.G, K = gr.K, J = gr.J, x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], best = 1e9, bk = 0, bj = 0;
      for (var k = 0; k < K; k++) { var row = G[k]; for (var j = 0; j < J; j++) { var g = row[j], dx = g.x - x, dy = g.y - y, dz = g.z - z, d = dx * dx + dy * dy + dz * dz; if (d < best) { best = d; bk = k; bj = j; } } }
      if (!force && best > 0.07 * 0.07) return false;
      var g0 = G[bk][bj], ka = Math.max(0, bk - 1), kb = Math.min(K - 1, bk + 1), ja = Math.max(0, bj - 1), jb = Math.min(J - 1, bj + 1);
      var Ta = G[kb][bj].clone().sub(G[ka][bj]).divideScalar((kb - ka) / (K - 1)), Tt = G[bk][jb].clone().sub(G[bk][ja]).divideScalar((jb - ja) / (J - 1));
      var d = new V3(x, y, z).sub(g0), nrm = Ta.clone().cross(Tt).normalize(); if (!force && Math.abs(d.dot(nrm)) > 0.045) return false;
      var aa = Ta.dot(Ta), ab = Ta.dot(Tt), bb = Tt.dot(Tt), da = d.dot(Ta), db = d.dot(Tt), det = aa * bb - ab * ab; if (Math.abs(det) < 1e-12) return false;
      out.a = bk / (K - 1) + (bb * da - ab * db) / det; out.t = bj / (J - 1) + (aa * db - ab * da) / det; out.d = Math.sqrt(best); return true; }
    // list: [{id, side, ch}] -> writes anatFib on this mesh and the slot uniforms. Returns per-muscle landmark sets (for markers) and the slot table.
    function paintSheets(root, body, mesh, P, MU, LM, list) { var fib = ensureFib(mesh), F = fib.array, n = P.length / 3, N = mesh.geometry.attributes.normal.array, U = mesh.material.userData.anatU;
      for (var i = 0; i < n; i++) { F[4 * i] = -10; F[4 * i + 1] = -10; F[4 * i + 2] = -1; F[4 * i + 3] = 0; }
      var score = new Float32Array(n).fill(1e9), slots = [], out = {}, o = {}, grids = [];
      list.forEach(function (m, si) { var Mu = MU[m.id]; if (!Mu || !Mu.sheet) throw new Error('muscle sheet ' + m.id); var S = Mu.sheet, gr = sheetGrid(root, body, P, N, LM, S, m.side); grids.push(gr);
        // deeper-layer handling: vertices inside the region of a covering muscle are flagged 'deep' (drawn faint)
        var cov = (S.coveredBy || []).map(function (cid) { return sheetGrid(root, body, P, N, LM, MU[cid].sheet, m.side); });
        gr.cand.forEach(function (vi) { if (!sheetCoords(gr, P, vi, o)) return; if (o.a < -0.8 || o.a > 1.8 || o.t < -0.4 || o.t > 1.4) return;
          var ins = o.a >= 0 && o.a <= 1 && o.t >= 0 && o.t <= 1, sc = (ins ? 0 : 1) + o.d * 0.1 - si * 1e-4 * (S.superficial ? 10 : 1);
          if (sc >= score[vi]) return; score[vi] = sc; var deep = 0;
          cov.forEach(function (cg) { var q = {}; if (sheetCoords(cg, P, vi, q)) deep = Math.max(deep, Math.min(1, Math.max(0, Math.min(q.a * cg.W, (1 - q.a) * cg.W, q.t * cg.L, (1 - q.t) * cg.L) / 0.008 + 0.5))); });
          F[4 * vi] = o.a; F[4 * vi + 1] = o.t; F[4 * vi + 2] = si; F[4 * vi + 3] = deep; });
        var tn = S.tendon || [0.06, 0.92], ints = (S.intersections || []).concat([-1, -1, -1]);
        if (U && si < NSLOT) { U.uMA.value[si].set(gr.W, gr.L, ARCH[S.arch] || 0, (S.pennation || 0) * D); U.uMB.value[si].set(tn[0], tn[1], m.ch, S.columns || 0); U.uMC.value[si].set(ints[0], ints[1], ints[2], 1); }
        slots.push({ id: m.id, side: m.side, W: +gr.W.toFixed(3), L: +gr.L.toFixed(3) }); out[m.id + '_' + m.side] = gr.lms; });
      // ring fill: unassigned vertices that share a triangle with a muscle vertex get pure extrapolated (a, t) of that muscle,
      // so edge triangles interpolate cleanly to 'outside' instead of sweeping through the 0..1 range (no slivers / zig-zags)
      var idx = mesh.geometry.index ? mesh.geometry.index.array : null;
      if (idx) for (var r = 0; r < 2; r++) { var fill = [];
        for (var tI = 0; tI < idx.length; tI += 3) { var sl = -1; for (var c = 0; c < 3; c++) { var z = F[4 * idx[tI + c] + 2]; if (z > -0.5) sl = z; } if (sl < 0) continue;
          for (c = 0; c < 3; c++) { var vv = idx[tI + c]; if (F[4 * vv + 2] < -0.5) fill.push([vv, sl]); } }
        fill.forEach(function (f) { var vv = f[0]; if (F[4 * vv + 2] > -0.5) return; var q = {}; if (!sheetCoords(grids[f[1]], P, vv, q, true)) return;
          var a2 = q.a, t2 = q.t; if (a2 >= 0 && a2 <= 1 && t2 >= 0 && t2 <= 1) { a2 = a2 < 0.5 ? -0.3 : 1.3; }
          F[4 * vv] = a2; F[4 * vv + 1] = t2; F[4 * vv + 2] = f[1]; F[4 * vv + 3] = 0; }); }
      fib.needsUpdate = true; return { lms: out, slots: slots }; }
    function applyMask(body, mask) { var a = ensureAttr(body); a.array.set(mask); a.needsUpdate = true; }
    // ---------- bony landmark markers
    function markers(lms, opts) { opts = opts || {}; var out = []; Object.keys(lms).forEach(function (k) { var L = lms[k]; if (!L.anchor) return;
      var m = new T.Mesh(new T.SphereGeometry(opts.r || 0.0085, 16, 12), new T.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.95 }));
      var ring = new T.Mesh(new T.SphereGeometry((opts.r || 0.0085) * 1.45, 16, 12), new T.MeshBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.55, side: 1 /* BackSide outline */ }));
      m.renderOrder = 21; ring.renderOrder = 20; L.anchor.add(ring); L.anchor.add(m); m.name = ring.name = 'anat_marker'; out.push(m, ring); }); return out; }
    // ---------- procedural vertebral column. Segment counts: 7 cervical, 12 thoracic, 5 lumbar, sacrum.
    // Each vertebra = body (flattened ellipsoid) + spinous process (small ellipsoid behind it), parented to the spine bone of its segment.
    function chainPoint(root, chain, t) { var pts = chain.map(function (n) { return root.getObjectByName(n).getWorldPosition(new V3()); }), L = [0];
      for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1])); var s = t * L[L.length - 1];
      for (var j = 1; j < pts.length; j++) if (s <= L[j] + 1e-9) { var u = (s - L[j - 1]) / Math.max(1e-9, L[j] - L[j - 1]); return { p: pts[j - 1].clone().lerp(pts[j], u), bone: chain[j - 1], dir: pts[j].clone().sub(pts[j - 1]).normalize() }; }
      return { p: pts[pts.length - 1], bone: chain[chain.length - 2], dir: new V3(0, 1, 0) }; }
    // v4b: the column is drawn through the skin (depthTest off) only when the camera is behind/beside the body; from in front
    // (camera more than ~35 deg in front of the coronal plane at that vertebra) it is depth-tested, so it never draws over the face or chest.
    var _c = new V3(), _p = new V3(), _f = new V3(), _q = new T.Quaternion();
    function frontHide(r, s, cam) { var b = this.parent; if (!b) return; b.getWorldPosition(_p); b.getWorldQuaternion(_q); _f.set(0, 0, 1).applyQuaternion(_q);
      cam.getWorldPosition(_c).sub(_p).normalize(); var front = _c.dot(_f) > 0.57; if (this.material.depthTest !== front) { this.material.depthTest = front; this.material.needsUpdate = true; } }
    function vertebrae(root, opts) { opts = opts || {}; var grp = [], back = opts.back == null ? -0.035 : opts.back; root.updateMatrixWorld(true);
      var mat = function (hl) { return new T.MeshBasicMaterial({ color: hl ? 0xf3c46e : 0xf2ead8, transparent: true, opacity: hl ? 0.6 : (opts.opacity || 0.38), depthTest: false }); };
      // [count, chain, size (body radius m), region id, label prefix, top-down?]
      var SEG = [[5, ['pelvis', 'lumbar_lo', 'lumbar_hi', 'thoracic_lo'], 0.022, 'ls', 'L', 0.32, 1], [12, ['thoracic_lo', 'thoracic_hi', 'neck_lo'], 0.016, 'ts', 'T', 0, 0.85], [7, ['neck_lo', 'neck_hi', 'head'], 0.0115, 'cs', 'C', 0, 0.35]];
      var hl = opts.highlight || null;
      SEG.forEach(function (S) { for (var i = 0; i < S[0]; i++) { var t = (i + 0.5) / S[0], cp = chainPoint(root, S[1], S[5] + (1 - S[5]) * t), r = S[2] * (S[4] === 'C' ? 0.9 + 0.25 * t : 1);
        var lab = S[4] + (S[0] - i), isHl = hl === S[3];
        var body = new T.Mesh(new T.SphereGeometry(1, 14, 10), mat(isHl)); body.scale.set(r * 1.25, r * 0.62, r * 0.95);
        var spin = new T.Mesh(new T.SphereGeometry(1, 10, 8), mat(isHl)); spin.scale.set(r * 0.32, r * 0.42, r * 1.05);
        var bone = root.getObjectByName(cp.bone), wp = cp.p.clone().add(new V3(0, 0, back * S[6])), sp = wp.clone().add(new V3(0, -r * 0.35, -r * 1.55));
        [[body, wp], [spin, sp]].forEach(function (q) { q[0].position.copy(bone.worldToLocal(q[1].clone())); q[0].quaternion.copy(bone.getWorldQuaternion(new T.Quaternion()).invert()); q[0].renderOrder = 19; q[0].name = 'anat_vert_' + lab; q[0].onBeforeRender = frontHide; bone.add(q[0]); grp.push(q[0]); }); } });
      // sacrum: wedge of 3 fused-looking ellipsoids below L5 on the pelvis bone
      var pb = root.getObjectByName('pelvis'), p0 = pb.getWorldPosition(new V3());
      for (var k = 0; k < 3; k++) { var s = new T.Mesh(new T.SphereGeometry(1, 14, 10), mat(hl === 'ls')); var rr = 0.024 - k * 0.006; s.scale.set(rr * 1.5, rr * 0.75, rr * 0.7);
        var w = p0.clone().add(new V3(0, 0.035 - k * 0.03, back - 0.03 - k * 0.012)); s.position.copy(pb.worldToLocal(w)); s.quaternion.copy(pb.getWorldQuaternion(new T.Quaternion()).invert()); s.renderOrder = 19; s.onBeforeRender = frontHide; s.name = 'anat_vert_S' + (k + 1); pb.add(s); grp.push(s); }
      return grp; }
    // ---------- ROM joint/region highlight (z channel): soft patch around the joint, limited to the two bones that meet there
    var JOINT = { shoulder: ['upperarm_S', ['clavicle_S', 'scapula_S', 'upperarm_S', 'upperarm_twist_S'], 0.085], elbow: ['forearm_S', ['upperarm_twist_S', 'forearm_S', 'forearm_twist_S'], 0.065],
      wrist: ['hand_S', ['forearm_twist_S', 'hand_S'], 0.05], hip: ['thigh_S', ['pelvis', 'thigh_S'], 0.10], pelvis: ['thigh_S', ['pelvis', 'thigh_S'], 0.10],
      knee: ['shin_S', ['thigh_S', 'shin_S'], 0.075], ankle: ['foot_S', ['shin_S', 'foot_S'], 0.06],
      cs: [['neck_lo', 'neck_hi', 'head'], ['neck_lo', 'neck_hi', 'head', 'thoracic_hi'], 0.05, [0, 0, -1]], ts: [['thoracic_lo', 'thoracic_hi', 'neck_lo'], ['thoracic_lo', 'thoracic_hi'], 0.06, [0, 0, -1]],
      ls: [['pelvis', 'lumbar_lo', 'lumbar_hi', 'thoracic_lo'], ['pelvis', 'lumbar_lo', 'lumbar_hi'], 0.065, [0, 0, -1]] };
    function jointMask(root, body, P, region, side, mask) { var J = JOINT[region]; if (!J) return; mask.fill(0); var nm = function (b) { return sideName(b, side === 'R' ? 'R' : 'L'); };
      var bones = body.skeleton.bones, allow = {}; J[1].forEach(function (b) { var i = bones.findIndex(function (x) { return x.name === nm(b); }); if (i >= 0) allow[i] = 1; });
      var si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight, n = P.length / 3, v = new V3(), r = J[2] * 1.5;
      var pts = Array.isArray(J[0]) ? J[0].map(function (b) { return root.getObjectByName(nm(b)).getWorldPosition(new V3()); }) : [root.getObjectByName(nm(J[0])).getWorldPosition(new V3())];
      var face = J[3] ? new V3().fromArray(J[3]) : null;
      for (var k = 0; k < n; k++) { var wsum = 0; for (var c = 0; c < 4; c++) if (allow[si.getComponent(k, c)]) wsum += sw.getComponent(k, c); if (wsum < 0.25) continue;
        v.set(P[3 * k], P[3 * k + 1], P[3 * k + 2]); var best = 1e9, bc = null;
        if (pts.length === 1) { best = v.distanceTo(pts[0]); bc = pts[0]; } else for (var j = 1; j < pts.length; j++) { var s = segDist(v, pts[j - 1], pts[j]); if (s.d < best) { best = s.d; bc = s.c; } }
        if (best > r) continue; var w = 1 - Math.pow(best / r, 2); if (face) { var f = v.clone().sub(bc).normalize().dot(face); if (f < 0) continue; w *= Math.min(1, f / 0.4); }
        mask[3 * k + 2] = Math.min(1, w * Math.min(1, wsum * 1.4)); } }
    return { muscleVolumes: muscleVolumes, sheetLayers: sheetLayers, makeWrap: makeWrap, paintSheets: paintSheets, ARCH: ARCH, COL: COL, bodyOf: bodyOf, skinnedPositions: skinnedPositions, installTint: installTint, paintMuscle: paintMuscle, applyMask: applyMask, markers: markers, vertebrae: vertebrae, jointMask: jointMask, resolveLandmarks: resolveLandmarks, JOINT: JOINT };
  }
  g.ROMAnat = make;
})(typeof window !== 'undefined' ? window : globalThis);
