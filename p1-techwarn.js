/* P1 item 9 v2 — contextual technique warnings (user instruction 2026-10-16).
 * When a technique is chosen in the SOAP plan (manipulation technique per segment, modality chips, myofascial modality) and it is a recognised
 * concern for a flag / condition / medicine on THIS patient, a warning shows the flag, the concern, the source and alternatives.
 * The practitioner may proceed with a recorded reason (visit audit) or change the technique. Never a hard block. Rules + sources: docs/P1_ITEM9_INTAKE_RULES.md §10. */
(function () {
  'use strict';
  if (window.P1_INTAKE_KIOSK) return;
  var WHO = { name: 'WHO Guidelines on basic training and safety in chiropractic (2005), Part 2', url: 'https://iris.who.int/handle/10665/43352' };
  var IFOMPT = { name: 'IFOMPT cervical framework 2020 (Add. 2023) §6.5', url: 'https://www.ifompt.org/wp-content/uploads/2026/09/IFOMPT-cervical-framework-final-2020-Add-2023.pdf' };
  var EDS2017 = { name: '2017 International Classification of the EDS (Malfait et al.)', url: 'https://ehlers-danlos.com/wp-content/uploads/2022/03/Malfait_et_al-2017-American_Journal_of_Medical_Genetics_Part_C__Seminars_in_Medical_Genetics.pdf' };
  var UNS = 'clinic default (unsourced)';
  var THRUST = ['Diversified', 'Gonstead', 'Toggle', 'Drop Table'];             // high-velocity thrust techniques in this app's list
  var LOWFORCE = ['Activator', 'SOT', 'Flexion-Distraction'];                    // offered as alternatives
  var DEEP = ['Deep Massage', 'Dry Needling', 'IASTM', 'Cross-fibre', 'Ischaemic Compression'];
  var ANTICOAG_MEDS = /warfarin|coumadin|rivaroxaban|xarelto|apixaban|eliquis|dabigatran|pradaxa|edoxaban|lixiana|heparin|enoxaparin|clexane/i;
  function yes(k) { try { return ((APP.redFlags || {}).answers || {})[k] === 'yes'; } catch (e) { return false; } }
  function chip(sel, v) { return !!document.querySelector(sel + ' .chip.active[data-val="' + v + '"]'); }
  function anyYes(prefix) { try { return Object.keys((APP.redFlags || {}).answers || {}).filter(function (k) { return k.indexOf(prefix) === 0 && APP.redFlags.answers[k] === 'yes'; }); } catch (e) { return []; } }
  function meds() { return Array.prototype.map.call(document.querySelectorAll('#medList .med-name'), function (i) { return i.value; }).filter(Boolean); }
  function lbl(k) { try { var g = P1RedFlags.GROUPS; for (var i = 0; i < g.length; i++) for (var j = 0; j < g[i].items.length; j++) if (g[i].items[j][0] === k) return g[i].items[j][1]; } catch (e) {} return k; }
  // Each rule: techniques it applies to, the patient finding that triggers it, the concern, sources, alternatives.
  var RULES = [
    { id: 'thrust_osteo', tech: 'thrust', flag: function () { var f = []; if (yes('fx_osteo')) f.push(lbl('fx_osteo')); if (yes('fx_steroid')) f.push(lbl('fx_steroid')); if (chip('#conditions', 'Osteoporosis')) f.push('Condition: Osteoporosis'); return f; },
      concern: 'Demineralised bone: fracture risk with joint manipulation at the area; spine and ribs are particularly vulnerable (long-term steroids, osteoporosis, post-menopause). WHO: relative contraindication at the area of pathology.', src: [WHO],
      alt: 'Low-force options (Activator, Flexion-Distraction), mobilisation, soft tissue, graded exercise — alternatives ' + UNS + '; WHO notes non-forceful techniques for vulnerable bone.' },
    { id: 'cerv_thrust_vascular', tech: 'cerv_thrust', flag: function () { var f = anyYes('va_').map(lbl); if (yes('hs_ptosis')) f.push(lbl('hs_ptosis')); if (yes('hs_miosis')) f.push(lbl('hs_miosis')); if (chip('#redFlags', 'Drop attacks')) f.push('Drop attacks'); if (chip('#redFlags', 'Ataxia')) f.push('Ataxia'); return f; },
      concern: 'Signs of cervical arterial dysfunction / vertebrobasilar insufficiency: WHO — relative-to-absolute contraindication to cervical manipulation; IFOMPT — refer for immediate medical investigation when history/exam suggest vascular pathology.', src: [WHO, IFOMPT],
      alt: 'Defer cervical manipulation pending medical assessment (IFOMPT §6.5); non-cervical care meanwhile — ' + UNS + '.' },
    { id: 'thrust_anticoag', tech: 'thrust', flag: function () { var f = []; if (chip('#conditions', 'Anticoagulant / Clotting Condition')) f.push('Condition: Blood thinners / clotting'); meds().forEach(function (m) { if (ANTICOAG_MEDS.test(m)) f.push('Medicine: ' + m); }); return f; },
      concern: 'Bleeding is a potential complication of anticoagulant therapy or blood dyscrasias — WHO: relative contraindication to joint manipulation.', src: [WHO],
      alt: 'Low-force techniques and mobilisation; check INR/control with the prescriber if unsure — ' + UNS + '.' },
    { id: 'deep_anticoag', tech: 'deep', flag: function () { var f = []; if (chip('#conditions', 'Anticoagulant / Clotting Condition')) f.push('Condition: Blood thinners / clotting'); meds().forEach(function (m) { if (ANTICOAG_MEDS.test(m)) f.push('Medicine: ' + m); }); return f; },
      concern: 'Anticoagulation and deep pressure / needling / instrument-assisted techniques: bruising or bleeding risk — ' + UNS + ' (WHO addresses joint manipulation only).', src: [],
      alt: 'Lighter soft-tissue pressure, avoid dry needling or use with extra care — ' + UNS + '.' },
    { id: 'thrust_fracture', tech: 'thrust', flag: function () { var f = []; if (yes('fx_trauma')) f.push(lbl('fx_trauma')); if (yes('sy_trauma')) f.push(lbl('sy_trauma')); return f; },
      concern: 'Possible acute fracture after significant trauma — WHO lists acute fracture as an absolute contraindication to spinal manipulation.', src: [WHO],
      alt: 'Exclude fracture first (imaging / medical assessment); no thrust at the area meanwhile — ' + UNS + ' for the work-up wording.' },
    { id: 'cerv_thrust_inflammatory', tech: 'cerv_thrust', flag: function () { var f = []; if (chip('#conditions', 'Rheumatoid Arthritis')) f.push('Condition: Rheumatoid / autoimmune'); return f; },
      concern: 'Inflammatory arthritis (e.g. rheumatoid) with possible ligamentous laxity / atlantoaxial instability — WHO: absolute contraindication to joint manipulation in the involved region (upper cervical); atlantoaxial instability absolute.', src: [WHO],
      alt: 'Assess upper cervical stability first; avoid upper cervical thrust; gentle mobilisation / soft tissue — ' + UNS + '.' },
    { id: 'cerv_thrust_myelopathy', tech: 'cerv_thrust', flag: function () { var f = anyYes('cm_').map(lbl); ['Clumsy hands', 'Altered gait', 'Hyperreflexia'].forEach(function (c) { if (chip('#redFlags', c)) f.push(c); }); return f; },
      concern: "Myelopathy signs: WHO lists a positive Lhermitte's sign as an absolute contraindication and myelopathy as a reported complication of cervical manipulation.", src: [WHO],
      alt: 'No cervical thrust until myelopathy is excluded; specialist opinion (DCM BMJ 2018) — ' + UNS + ' for the technique advice.' },
    { id: 'lumbar_thrust_ces', tech: 'lumbar_thrust', flag: function () { return anyYes('ce_').map(lbl).concat(chip('#redFlags', 'Bladder/Sphincter') ? ['Bladder/Sphincter'] : []); },
      concern: 'Cauda equina features — WHO lists cauda equina syndrome as an absolute contraindication to spinal manipulation.', src: [WHO],
      alt: 'Emergency pathway (item 2 emergency tier); no lumbar thrust.' },
    { id: 'thrust_cancer', tech: 'thrust', flag: function () { return yes('sy_cancer') ? [lbl('sy_cancer')] : []; },
      concern: 'History of cancer: WHO lists spinal tumours / neoplastic disease at the area as absolute contraindications. With a past history only and no current signs, the level of concern is ' + UNS + '.', src: [WHO],
      alt: 'Screen for current signs (night pain, weight loss); low-force options until clear — ' + UNS + '.' },
    { id: 'thrust_hypermobility', tech: 'thrust', flag: function () { return ['hm_beighton', 'hm_5pq', 'hm_dx'].filter(yes).map(lbl); },
      concern: 'Generalised joint hypermobility: WHO lists congenital generalised hypermobility as a contraindication to spinal manipulation, and articular hypermobility as a relative contraindication at that area; manipulation should avoid hypermobile or unstable areas. A positive screening result alone is not a diagnosis.', src: [WHO, EDS2017],
      alt: 'Low-force techniques (Activator, Flexion-Distraction), mobilisation within normal range, soft tissue, stabilising and strengthening exercise — ' + UNS + '.' },
    { id: 'cerv_thrust_instability', tech: 'cerv_thrust', flag: function () { return yes('hm_ucinstab') ? [lbl('hm_ucinstab')] : []; },
      concern: 'Upper-cervical (atlantoaxial) instability: WHO lists atlantoaxial instability as an absolute contraindication to joint manipulation at that area.', src: [WHO],
      alt: 'No upper-cervical thrust; medical opinion / imaging if instability is not yet assessed; gentle soft tissue and stabilising exercise — ' + UNS + '.' },
    { id: 'pregnancy_prone_drop', tech: 'drop', flag: function () { return chip('#conditions', 'Pregnancy') ? ['Condition: Pregnancy'] : []; },
      concern: 'Pregnancy: prone drop-table positioning may be unsuitable, especially later in pregnancy — ' + UNS + '.', src: [],
      alt: 'Side-lying or seated techniques, pregnancy table/pillows — ' + UNS + '.' }
  ];
  function classes(tech, region) { var c = [];
    if (THRUST.indexOf(tech) >= 0) { c.push('thrust'); if (region === 'cs') c.push('cerv_thrust'); if (region === 'ls' || region === 'pelvis') c.push('lumbar_thrust'); }
    if (tech === 'Drop Table') c.push('drop');
    if (DEEP.indexOf(tech) >= 0) c.push('deep'); return c; }
  function check(region, tech) { var cl = classes(tech, region); return RULES.filter(function (r) { return cl.indexOf(r.tech) >= 0; }).map(function (r) { return { rule: r, flags: r.flag() }; }).filter(function (x) { return x.flags.length; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function audit(e) { APP.techAudit = (APP.techAudit || []).concat([e]); }
  function warn(region, tech, hits, revert) {
    var old = document.getElementById('p9TechWarn'); if (old) old.remove();
    var m = document.createElement('div'); m.id = 'p9TechWarn';
    m.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(120,80,0,.35);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 8px';
    var prof = {}; try { prof = loadProfile(); } catch (e) {}
    m.innerHTML = '<div style="background:#fff;max-width:680px;width:100%;border-radius:12px;padding:16px;border:3px solid #E67E22;font-size:13px">' +
      '<h3 style="margin:0 0 6px;color:#8A5A00">⚠️ Technique caution: ' + esc(tech) + (region ? ' (' + esc(region.toUpperCase()) + ')' : '') + '</h3>' +
      '<div style="font-size:12px;margin-bottom:6px">This technique is a recognised concern for something recorded on this patient. You decide; nothing is blocked.</div>' +
      hits.map(function (h) { return '<div class="p9tw-hit" data-rule="' + h.rule.id + '" style="border:1px solid #f0d9b5;border-radius:8px;padding:6px 8px;margin:6px 0"><b>Flag:</b> ' + esc(h.flags.join('; ')) +
        '<div><b>Concern:</b> ' + esc(h.rule.concern) + '</div><div><b>Source:</b> ' + (h.rule.src.length ? h.rule.src.map(function (s) { return '<a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'; }).join(' · ') : esc(UNS)) +
        '</div><div><b>Alternatives:</b> ' + esc(h.rule.alt) + '</div></div>'; }).join('') +
      '<label style="font-size:12px">Reason for proceeding (recorded in the visit audit)</label><textarea id="p9twWhy" rows="2" style="width:100%;box-sizing:border-box"></textarea>' +
      '<div style="font-size:12px;margin-top:4px"><label>By</label> <input id="p9twBy" value="' + esc(prof.name || '') + '" style="max-width:260px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" id="p9twChange" style="background:#e3e9ea;border:0;border-radius:8px;padding:9px 14px">Change technique</button>' +
      '<button type="button" id="p9twGo" disabled style="background:#8A5A00;color:#fff;border:0;border-radius:8px;padding:9px 14px;opacity:.45">Proceed with reason</button></div></div>';
    document.body.appendChild(m);
    var go = m.querySelector('#p9twGo'), why = m.querySelector('#p9twWhy'), by = m.querySelector('#p9twBy');
    function upd() { go.disabled = !(why.value.trim() && by.value.trim()); go.style.opacity = go.disabled ? '.45' : '1'; } why.oninput = by.oninput = upd;
    var base = { at: new Date().toISOString(), region: region, technique: tech, rules: hits.map(function (h) { return h.rule.id; }), flags: hits.map(function (h) { return h.flags.join('; '); }) };
    go.onclick = function () { if (go.disabled) return; audit(Object.assign(base, { decision: 'proceed', reason: why.value.trim(), by: by.value.trim() })); m.remove(); };
    m.querySelector('#p9twChange').onclick = function () { audit(Object.assign(base, { decision: 'changed', reason: why.value.trim(), by: by.value.trim() })); try { revert(); } catch (e) {} m.remove(); };
  }
  function regionOf(el) { var a = (el.getAttribute('data-cc-change') || '') + (el.getAttribute('data-cc-click') || ''); var mm = a.match(/getExamData\('([a-z]+)'\)|toggleExamChip\('([a-z]+)'/); return mm ? (mm[1] || mm[2]) : ''; }
  // selects: manipulation technique (manip_tech_*) and myofascial modality (mf_mod_*)
  document.addEventListener('change', function (e) { var t = e.target; if (!t || t.tagName !== 'SELECT') return; var a = t.getAttribute('data-cc-change') || ''; var mm = a.match(/\['(manip_tech_[^']+|mf_mod_[^']+)'\]/); if (!mm) return;
    var region = regionOf(t), tech = t.value, hits = check(region, tech); if (!hits.length) return;
    warn(region, tech, hits, function () { t.value = '—'; try { getExamData(region)[mm[1]] = '—'; } catch (x) {} }); }, false);
  // modality chips (txMods)
  document.addEventListener('click', function (e) { var c = e.target && e.target.closest ? e.target.closest('.chip') : null; if (!c) return; var a = c.getAttribute('data-cc-click') || ''; if (a.indexOf("'txMods'") < 0) return;
    setTimeout(function () { if (!c.classList.contains('active')) return; var region = regionOf(c), tech = c.textContent.trim(), hits = check(region, tech); if (!hits.length) return;
      warn(region, tech, hits, function () { if (c.classList.contains('active')) c.click(); }); }, 0); }, false);
  function hook() {
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p9tw) { var g = window.gatherAllData; window.gatherAllData = function () { var d = g.apply(this, arguments); try { if (APP.techAudit && APP.techAudit.length) d.techAudit = JSON.parse(JSON.stringify(APP.techAudit)); } catch (e) {} return d; }; window.gatherAllData._p9tw = 1; }
    if (typeof window.restoreData === 'function' && !window.restoreData._p9tw) { var r = window.restoreData; window.restoreData = function (d) { var x = r.apply(this, arguments); try { APP.techAudit = d && d.techAudit ? JSON.parse(JSON.stringify(d.techAudit)) : []; } catch (e) {} return x; }; window.restoreData._p9tw = 1; }
  }
  window.addEventListener('load', function () { setTimeout(hook, 700); });
  window.P1TechWarn = { RULES: RULES, THRUST: THRUST, LOWFORCE: LOWFORCE, DEEP: DEEP, check: check, classes: classes, warn: warn };
})();
