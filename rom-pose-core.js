/* ROM pose core (P1 item 10). Poses the rigged ChiroClinic figure (rom_figure.glb) to a movement and angle.
 * Figure faces +Z, model's left = +X. Defs are written for the LEFT side ('S' suffix); right side mirrors (Y/Z rotations negate).
 * Each def: b = [[bone, axis, share]] (share of the angle), pre = [[bone, axis, deg]] start position, plane, view,
 * clampMax = display limit where the figure would intersect itself (recorded value is never changed). Display-only rules.
 * v17: arcGeom (arc frame for eased arcs and drag). Rebuilt 2026-10-22 from the v16 source recorded in the build log (the v10-v17 build tree was lost in the 2026-10-21 box reset).
 */
(function (g) {
  'use strict';
  function make(THREE) {
    var X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1), D = Math.PI / 180, RD = -1; // RD: sign of radial deviation about world Y for the left hand (palm down, forearm forward: thumb side is medial)
    var SPINE = { cs: ['neck_lo', 'neck_hi'], ts: ['thoracic_lo', 'thoracic_hi'], ls: ['lumbar_lo', 'lumbar_hi'] };
    function spine(r) { var b = SPINE[r]; return {
      'Flexion': { b: [[b[0], X, .5], [b[1], X, .5]], view: 'side' }, 'Extension': { b: [[b[0], X, -.5], [b[1], X, -.5]], view: 'side' },
      'Right Rotation': { b: [[b[0], Y, -.5], [b[1], Y, -.5]], view: 'top' }, 'Left Rotation': { b: [[b[0], Y, .5], [b[1], Y, .5]], view: 'top' },
      'Right Lat Flex': { b: [[b[0], Z, .5], [b[1], Z, .5]], view: 'back' }, 'Left Lat Flex': { b: [[b[0], Z, -.5], [b[1], Z, -.5]], view: 'back' } }; }
    var HIP = {
      // v14: hip flexion with the knee bending with it (knee flexion = 0.75 x hip flexion, display only), the usual goniometric test position; a straight-leg 120° kick is not attainable
      'Flexion': { b: [['thigh_S', X, -1]], follow: [['shin_S', X, 0.75]], view: 'side' }, 'Extension': { b: [['thigh_S', X, 1]], view: 'side' },
      'Abduction': { b: [['thigh_S', Z, 1]], view: 'front' }, 'Adduction': { pre: [['thigh_S', X, -30]], b: [['thigh_S', Z, -1]], view: 'front', clampMax: 25 },
      'Internal Rotation': { pre: [['thigh_S', X, -90], ['shin_S', X, 90]], b: [['thigh_S', Z, 1]], view: 'front', arcTip: 'foot_S' },
      'External Rotation': { pre: [['thigh_S', X, -90], ['shin_S', X, 90]], b: [['thigh_S', Z, -1]], view: 'front', clampMax: 35, arcTip: 'foot_S' } };
    // v5: the hip region lists 'Flexion'... and the pelvis region 'Hip Flexion'... (index.html REGIONS); both spellings now resolve (before v5 hip flex/ext/abd/add had no pose).
    ['Flexion', 'Extension', 'Abduction', 'Adduction'].forEach(function (k) { HIP['Hip ' + k] = HIP[k]; });
    var DEF = {
      cs: spine('cs'), ts: spine('ts'), ls: spine('ls'),
      pelvis: HIP, hip: HIP,
      shoulder: {
        'Forward Flexion': { b: [['upperarm_S', X, -1]], rhythm: X, view: 'side' }, 'Extension': { b: [['upperarm_S', X, 1]], view: 'side' },
        'Abduction': { b: [['upperarm_S', Z, 1]], rhythm: Z, view: 'front' }, 'Adduction': { pre: [['upperarm_S', X, -35]], b: [['upperarm_S', Z, -1]], view: 'front', clampMax: 30 },
        // v14: standard goniometric position: shoulder abducted 90°, elbow flexed 90°, forearm pointing forward; rotation about the humeral long axis
        // (internal = forearm down, external = forearm up), viewed side-on. Nothing passes through the body, so the old 55° display clamp is gone.
        'Internal Rotation': { pre: [['upperarm_S', Z, 90], ['forearm_S', Y, -90]], b: [['upperarm_S', X, .5], ['upperarm_twist_S', X, .5]], view: 'side', arcTip: 'hand_S' },
        'External Rotation': { pre: [['upperarm_S', Z, 90], ['forearm_S', Y, -90]], b: [['upperarm_S', X, -.5], ['upperarm_twist_S', X, -.5]], view: 'side', arcTip: 'hand_S' } },
      elbow: {
        'Flexion': { pre: [['upperarm_S', Z, 0]], b: [['forearm_S', X, -1]], follow: [['hand_S', X, -0.25]], view: 'side', clampMax: 160 } /* v16: full flexion brings the hand to the front of the shoulder: companion wrist flexion (display only), true normal reachable */, 'Extension': { b: [['forearm_S', X, 1]], view: 'side', clampMax: 15 },
        'Pronation': { pre: [['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['forearm_twist_S', Z, 1]], view: 'front' },
        'Supination': { pre: [['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['forearm_twist_S', Z, -1]], view: 'front' } },
      wrist: {
        // v14: standard position: elbow flexed 90° with the forearm forward and pronated (palm down; the neutral palms-forward twist is undone first so the forearm is not over-twisted), so the hand moves clear of the thigh; flexion = fingers down
        'Wrist Flexion': { pre: [['forearm_S', Y, -45], ['forearm_twist_S', Y, -45], ['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['hand_S', X, 1]], view: 'side' }, 'Wrist Extension': { pre: [['forearm_S', Y, -45], ['forearm_twist_S', Y, -45], ['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['hand_S', X, -1]], view: 'side' },
        // v15: standard goniometric position: elbow 90°, forearm forward and pronated (same set-up as wrist flexion), hand deviates in the horizontal plane; seen from above (dorsum of the hand)
        'Radial Deviation': { pre: [['forearm_S', Y, -45], ['forearm_twist_S', Y, -45], ['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['hand_S', Y, RD]], view: 'wristTop' }, 'Ulnar Deviation': { pre: [['forearm_S', Y, -45], ['forearm_twist_S', Y, -45], ['forearm_S', X, -90], ['forearm_twist_S', Z, 90]], b: [['hand_S', Y, -RD]], view: 'wristTop' } },
      knee: { 'Flexion': { b: [['shin_S', X, 1]], view: 'side' }, 'Extension': { b: [['shin_S', X, -1]], view: 'side', clampMax: 15 } },
      ankle: { 'Dorsiflexion': { b: [['foot_S', X, -1]], view: 'side' }, 'Plantarflexion': { b: [['foot_S', X, 1]], view: 'side' },
        'Inversion': { b: [['foot_S', Z, -1]], view: 'front' }, 'Eversion': { b: [['foot_S', Z, 1]], view: 'front' } } };
    // Neutral (anatomical position): arms down from the T-pose, palms forward (forearm turned on both forearm segments).
    var NEUTRAL = [['upperarm_S', Z, -90], ['forearm_S', Y, 45], ['forearm_twist_S', Y, 45]];
    var SIDED = { pelvis: 1, hip: 1, shoulder: 1, elbow: 1, wrist: 1, knee: 1, ankle: 1 };
    function nm(b, side) { return b.replace(/_S$/, side === 'R' ? '_R' : '_L'); }
    function ax(a, side) { return side === 'R' && a !== X ? a.clone().negate() : a; }
    function rot(root, name, axis, deg) { var b = root.getObjectByName(name); if (!b) return; root.updateMatrixWorld(true); var P = new THREE.Quaternion(); b.parent.getWorldQuaternion(P);
      var q = new THREE.Quaternion().setFromAxisAngle(axis, deg * D); b.quaternion.premultiply(P.clone().invert().multiply(q).multiply(P)); root.updateMatrixWorld(true); }
    function reset(root) { root.traverse(function (o) { if (o.isBone) { if (!o.userData.q0) o.userData.q0 = o.quaternion.clone(); o.quaternion.copy(o.userData.q0); } }); root.updateMatrixWorld(true); }
    function neutral(root) { reset(root); ['L', 'R'].forEach(function (s) { NEUTRAL.forEach(function (n) { rot(root, nm(n[0], s), ax(n[1], s), n[2]); }); }); }
    function def(region, move) { return (DEF[region] || {})[move] || null; }
    function shown(d, deg) { var v = +deg || 0, c = d && d.clampMax != null && Math.abs(v) > d.clampMax; return { deg: c ? Math.sign(v) * d.clampMax : v, clamped: c }; }
    function pose(root, region, move, deg, side) { neutral(root); var d = def(region, move); if (!d) return { ok: false };
      side = SIDED[region] ? (side === 'R' ? 'R' : 'L') : 'L'; var s = shown(d, deg);
      (d.pre || []).forEach(function (n) { rot(root, nm(n[0], side), ax(n[1], side), n[2]); });
      var a = s.deg;
      if (d.rhythm) { var cl = Math.max(0, a - 30) / 3; rot(root, nm('clavicle_S', side), ax(d.rhythm, side), cl * Math.sign(d.b[0][2])); a = a - cl; } // scapulohumeral rhythm, display only
      d.b.forEach(function (n) { rot(root, nm(n[0], side), ax(n[1], side), a * n[2]); });
      (d.follow || []).forEach(function (n) { rot(root, nm(n[0], side), ax(n[1], side), s.deg * n[2]); }); // v14: display-only companion joints (not part of the measured arc)
      return { ok: true, shown: s.deg, clamped: s.clamped, clampMax: d.clampMax, side: side, view: d.view }; }
    // arc helper: pivot (first moving bone head) and the direction to the distal end at neutral, rotated by angle
    // v17: arcGeom() returns the arc frame {pv, v, axis, sg, len} so the figure can redraw an arc for any angle without re-posing (eased arcs, drag).
    // Degenerate case (the moving segment lies along the rotation axis, e.g. the foot in inversion/eversion): v is a downward radius (heel fan, display only).
    function arcGeom(root, region, move, side) { var d = def(region, move); if (!d) return null; side = SIDED[region] ? (side === 'R' ? 'R' : 'L') : 'L';
      pose(root, region, move, 0, side); var b0 = root.getObjectByName(nm(d.b[0][0], side)), bl = root.getObjectByName(nm(d.b[d.b.length - 1][0], side));
      var tip = bl.children.find(function (c) { return c.isBone; }) || bl, endPt = null; if (tip === bl && END.len) endPt = END.len(bl); if (d.arcTip) tip = root.getObjectByName(nm(d.arcTip, side)) || tip; // v5: long-axis rotations trace the hand/foot
      var pv = b0.getWorldPosition(new THREE.Vector3()), v = (endPt && !d.arcTip ? endPt : tip.getWorldPosition(new THREE.Vector3())).sub(pv); // v5: end bones have no child: use the segment end point
      var axis = ax(d.b[0][1], side).clone(), sg = Math.sign(d.b[0][2]) || 1;
      if (d.arcTip) { var c0 = pv.clone().add(axis.clone().multiplyScalar(v.dot(axis))); v.sub(c0.clone().sub(pv)); pv = c0; } // centre the hand/foot arc on the rotation axis at hand/foot level
      var perp = v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
      if (perp.length() < 0.25 * Math.max(1e-9, v.length()) || (region === 'ankle' && /version/.test(move))) { var L = v.length() * 0.7, dn = new THREE.Vector3(0, -1, 0); dn.sub(axis.clone().multiplyScalar(dn.dot(axis))); if (dn.lengthSq() < 1e-9) dn.set(0, 0, 1); v = dn.normalize().multiplyScalar(L); }
      return { pv: pv, v: v, axis: axis, sg: sg, len: v.length(), last: bl, d: d }; }
    function arcPoints(root, region, move, deg, side, n) { var G = arcGeom(root, region, move, side); if (!G) return null;
      var pts = [G.pv.clone()]; n = n || 40; var a = shown(G.d, deg).deg;
      for (var i = 0; i <= n; i++) pts.push(G.pv.clone().add(G.v.clone().applyAxisAngle(G.axis, G.sg * a * D * i / n))); pts.push(G.pv.clone()); return pts; }
    var END = { len: null }; // set by the figure: function(bone) -> world point at the far end of an end segment
    return { DEF: DEF, SIDED: SIDED, def: def, pose: pose, neutral: neutral, shown: shown, arcPoints: arcPoints, arcGeom: arcGeom, setEnd: function (f) { END.len = f; } };
  }
  g.ROMPoseCore = make;
})(typeof window !== 'undefined' ? window : globalThis);
