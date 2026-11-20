/* ChiroClinic P1 item 2 — Red-flag safety net.
 * v3 (2026-10-16): tier and "why it matters" for every flag cite a source (SRC / GROUP_TIER / ITEM_TIER / INFO);
 * anything without a source is labelled 'clinic default (unsourced)'. Question wording is the clinic's own plain-language
 * wording (clinic default, unsourced). Screening support only; clinician judgement decides.
 */
(function () {
  'use strict';
  var PH = 'Sourced tiers · unsourced items labelled';
  var STATUS_LONG = 'Tiers and reasons cite NICE NG59/NG65/NG12/NG156/NG259, NICE CKS (low back pain), JOSPT 2020, IFOMPT 2020, WHO 2005, BMJ 2018 (DCM), EyeWiki, ACR/EULAR 2022 and the 2017 EDS classification, linked on each flag. Anything without a source is marked clinic default (unsourced). Question wording is clinic default (unsourced); age cut-offs use NICE-sourced defaults (overridable; non-NICE values labelled).';
  // Checklist (plain screening questions; wording = clinic default (unsourced)). id -> text
  var GROUPS = [
    { id: 'ce', title: 'Cauda equina', regions: ['ls'], referral: 'er', items: [
      ['ce_saddle', 'New numbness or altered sensation in the saddle area (groin, buttocks, inner thighs)?'],
      ['ce_bladder', 'New difficulty starting urination, loss of bladder control, or not feeling when the bladder is full?'],
      ['ce_bowel', 'New loss of bowel control or not feeling the urge to open the bowels?'],
      ['ce_sexual', 'New change in sexual function or genital sensation?'],
      ['ce_bilat', 'Leg pain, numbness or weakness in BOTH legs?'],
      ['ce_weak', 'Progressive or worsening leg weakness, or foot drop?']
    ] },
    { id: 'va', title: 'Vascular neck (cervical arterial)', regions: ['cs'], referral: 'er', items: [
      ['va_dizzy', 'Dizziness or vertigo that is new or linked to neck movement?'],
      ['va_diplopia', 'Double vision or other new visual disturbance?'],
      ['va_dysarthria', 'Slurred speech or difficulty swallowing?'],
      ['va_drop', 'Drop attacks or sudden falls without loss of consciousness?'],
      ['va_numb', 'Numbness of the face or one side of the body?'],
      ['va_ataxia', 'Unsteady walking or clumsiness (ataxia)?'],
      ['va_nausea', 'Nausea, vomiting or nystagmus with the neck pain?'],
      ['va_headache', 'Sudden, severe or "worst ever" headache or neck pain unlike usual?'],
      ['va_trauma', 'Recent neck trauma or manipulation followed by new neurological symptoms?']
    ] },
    { id: 'sy', title: 'Systemic / serious pathology', regions: [], referral: 'gp', items: [
      ['sy_cancer', 'Past history of cancer?'],
      ['sy_weight', 'Unexplained weight loss?'],
      ['sy_fever', 'Fever, chills or night sweats, or feeling systemically unwell?'],
      ['sy_night', 'Constant pain that is not eased by rest or position, or is worse at night?'],
      ['sy_immuno', 'Immunosuppression, long-term steroid use or IV drug use?'],
      ['sy_trauma', 'Significant trauma, or minor trauma with osteoporosis/older age?'],
      ['sy_age', 'First onset of this pain at an older or very young age?'],
      ['sy_thoracic', 'Thoracic pain with chest, abdominal or breathing symptoms?']
    ] }
    ,
    // v2 additions — wording clinic default (unsourced). Age cut-offs (v483): NICE-sourced defaults in AGE_FIELDS, practitioner-overridable.
    { id: 'cm', title: 'Cervical myelopathy', regions: ['cs'], referral: 'gp', items: [
      ['cm_hands', 'Clumsy hands or loss of dexterity (e.g. trouble with buttons, keys, writing)?'],
      ['cm_gait', 'Change in walking, unsteadiness, or new falls?'],
      ['cm_reflex', 'Hyperreflexia, clonus or a positive Hoffmann sign on examination?'],
      ['cm_lhermitte', "L'hermitte-type symptoms: electric-shock feeling down the spine or into the limbs on neck bending?"]
    ] },
    { id: 'fx', title: 'Fracture risk', regions: [], referral: 'gp', items: [
      ['fx_osteo', 'Known osteoporosis or previous low-impact (fragility) fracture?'],
      ['fx_steroid', 'Current or long-term corticosteroid (steroid) tablets?'],
      ['fx_trauma', 'Significant trauma (e.g. fall from height, road accident) before this pain started?'],
      ['fx_age', 'Age at or above the fracture-risk age?']
    ] },
    { id: 'gc', title: 'Giant cell arteritis', regions: ['cs'], referral: 'er', items: [
      ['gc_age_headache', 'Older age with a new headache (especially temple area)?'],
      ['gc_jaw', 'Jaw (or tongue) pain or fatigue when chewing that eases with rest (jaw claudication)?'],
      ['gc_scalp', 'Scalp tenderness (e.g. painful to brush hair)?'],
      ['gc_visual', 'New visual symptoms: blurred or double vision, or any loss of vision?']
    ] },
    { id: 'hs', title: "Horner's signs", regions: ['cs'], referral: 'er', items: [
      ['hs_ptosis', 'Drooping upper eyelid (ptosis) on one side?'],
      ['hs_miosis', 'Smaller pupil on the same side (miosis / unequal pupils)?']
    ] },
    { id: 'ib', title: 'Inflammatory back pain', regions: ['ls'], referral: 'gp', items: [
      ['ib_stiff', 'Morning stiffness lasting more than 30 minutes?'],
      ['ib_move', 'Back pain that improves with movement or exercise and not with rest?'],
      ['ib_young', 'Back pain that started at a younger age?']
    ] },
    // v3: joint hypermobility. hm_beighton / hm_5pq / hm_dx are filled in from the "Joint hypermobility" chart card (p1-hyper.js).
    { id: 'hm', title: 'Joint hypermobility / instability', regions: ['cs'], referral: 'gp', items: [
      ['hm_beighton', 'Beighton score at or above the cut-off (6 before puberty, 5 from puberty to age 50, 4 over 50)?'],
      ['hm_5pq', 'Five-part hypermobility questionnaire positive (2 or more "yes")?'],
      ['hm_dx', 'Diagnosed hypermobile EDS, hypermobility spectrum disorder, or another heritable connective-tissue disorder (e.g. Marfan)?'],
      ['hm_ucinstab', 'Known or suspected upper-cervical (atlantoaxial) instability?']
    ] }
  ];
  // ---------- Age cut-offs (v483, user instruction 2026-10-16): NICE-sourced defaults; overridable by the practitioner (logged). ----------
  var UNS = 'clinic default (unsourced)';
  var AGE_SRC = {
    CKS_LBP: { name: 'NICE CKS Back pain - low (without radiculopathy): assessment, red flags (rev. Aug 2026)', url: 'https://cks.nice.org.uk/topics/back-pain-low-without-radiculopathy/diagnosis/assessment/' },
    NG12: { name: 'NICE NG12 Suspected cancer, rec. 1.10.4 (myeloma)', url: 'https://www.nice.org.uk/guidance/ng12/chapter/Recommendations-organised-by-site-of-cancer' },
    NG259: { name: 'NICE NG259 Osteoporosis: risk assessment, rec. 1.1.2', url: 'https://www.nice.org.uk/guidance/ng259/chapter/Fragility-fracture-risk-assessment' },
    NG65: { name: 'NICE NG65 Spondyloarthritis, rec. 1.1.5', url: 'https://www.nice.org.uk/guidance/ng65/chapter/Recommendations' },
    NG156: { name: 'NICE NG156 Abdominal aortic aneurysm, recs 1.1.1–1.1.3', url: 'https://www.nice.org.uk/guidance/ng156/chapter/Recommendations' },
    GCA: { name: 'ACR/EULAR 2022 GCA classification criteria (not NICE)', url: 'https://ard.bmj.com/content/81/12/1647.long' } };
  var AGE_FIELDS = [
    { k: 'sy_age_over', item: 'sy_age', label: 'Malignancy red flag: age at or over', def: 50, src: ['CKS_LBP'], quote: 'Cancer — "Age 50 years or over." (CKS red flags). Also NICE NG12 1.10.4: "people aged 60 and over with persistent bone pain, particularly back pain" → myeloma tests.' },
    { k: 'sy_age_under', item: 'sy_age', label: 'Serious pathology: first onset under age', def: 20, src: [], quote: 'No NICE young-age threshold found (current CKS lists only "Age 50 years or over"; NG59 sets no age) — ' + UNS },
    { k: 'fx_age_women', item: 'fx_age', label: 'Fracture risk: women aged', def: 65, src: ['NG259'], quote: 'NG259 1.1.2: "Consider assessing fragility fracture risk in: all men aged 75 and over all women aged 65 and over"' },
    { k: 'fx_age_men', item: 'fx_age', label: 'Fracture risk: men aged', def: 75, src: ['NG259'], quote: 'NG259 1.1.2 (as above)' },
    { k: 'gc_age_over', item: 'gc_age_headache', label: 'Giant cell arteritis: age', def: 50, src: ['GCA'], quote: 'ACR/EULAR 2022: age ≥ 50 at diagnosis is the entry criterion. Not NICE (NICE CKS GCA is UK-only and could not be retrieved) — not a NICE source' },
    { k: 'ib_onset_under', item: 'ib_young', label: 'Spondyloarthritis: back pain started before age', def: 45, src: ['NG65'], quote: 'NG65 1.1.5: "low back pain that started before the age of 45 years and has lasted for longer than 3 months" (before 35 "further increases the likelihood")' } ];
  var AGE_KEY = 'chiroclinic_age_cutoffs';
  function ageOverride() { try { return JSON.parse(localStorage.getItem(AGE_KEY) || 'null'); } catch (e) { return null; } }
  function ageVal(k) { var o = ageOverride(), f = AGE_FIELDS.filter(function (x) { return x.k === k; })[0]; var v = o && o.values && o.values[k]; return (typeof v === 'number' && v > 0 && v < 120) ? v : f.def; }
  function ageSnapshot() { var o = ageOverride(), v = {}; AGE_FIELDS.forEach(function (f) { v[f.k] = ageVal(f.k); }); return { values: v, overridden: !!(o && o.values && Object.keys(o.values).length), by: o && o.by || null, at: o && o.at || null, reason: o && o.reason || null }; }
  var AGE_CUTOFFS = {}; // live view: item -> values in use
  function ageTexts() {
    AGE_CUTOFFS.sy_age = { over: ageVal('sy_age_over'), under: ageVal('sy_age_under') }; AGE_CUTOFFS.fx_age = { women: ageVal('fx_age_women'), men: ageVal('fx_age_men') };
    AGE_CUTOFFS.gc_age_headache = { over: ageVal('gc_age_over') }; AGE_CUTOFFS.ib_young = { under: ageVal('ib_onset_under') };
    return { sy_age: 'First onset of this pain at age ' + AGE_CUTOFFS.sy_age.over + ' or over, or under age ' + AGE_CUTOFFS.sy_age.under + '?',
      fx_age: 'Age at or above the fracture-risk age (women ' + AGE_CUTOFFS.fx_age.women + '+, men ' + AGE_CUTOFFS.fx_age.men + '+)?',
      gc_age_headache: 'Age ' + AGE_CUTOFFS.gc_age_headache.over + ' or over with a new headache (especially temple area)?',
      ib_young: 'Back pain that started before age ' + AGE_CUTOFFS.ib_young.under + ' and has lasted more than 3 months?' }; }
  function applyAgeTexts() { var t = ageTexts(); GROUPS.forEach(function (g) { g.items.forEach(function (it) { if (t[it[0]]) { it[1] = t[it[0]]; if (typeof ITEM !== 'undefined' && ITEM[it[0]]) ITEM[it[0]].text = t[it[0]]; } }); }); }
  applyAgeTexts();
  // Trigger rule (clinic default, unsourced): existing Patient-tab "Red Flag Signs" chips also count as positive.
  var CHIP_MAP = { 'Bladder/Sphincter': 'ce', 'Drop attacks': 'va', 'Ataxia': 'va', 'Intractable pain': 'sy',
    'Altered gait': 'cm', 'Clumsy hands': 'cm', 'Hyperreflexia': 'cm' };


  // ---------- v2 (2026-10-16, user instruction): tiers. Red flags HIGHLIGHT risk; they never force a referral and never hard-block. ----------
  // EMERGENCY = strong prompt, needs a documented decision (referred / not referred + reason). CAUTION = information + the practitioner's own decision.
  var SRC = {
    JOSPT: 'https://www.jospt.org/doi/10.2519/jospt.2020.9971', IFOMPT: 'https://www.ifompt.org/wp-content/uploads/2026/09/IFOMPT-cervical-framework-final-2020-Add-2023.pdf',
    NG59: 'https://www.nice.org.uk/guidance/ng59/chapter/Recommendations', NG65: 'https://www.nice.org.uk/guidance/ng65/chapter/Recommendations',
    DCM: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6074604/', RD: 'https://www.rightdecisions.scot.nhs.uk/msk-pathways/spine-pathways/lumbar-spine-pathways/supporting-information-on-relevant-conditions/serious-lumbar-spine-conditions/',
    EYE: 'https://eyewiki.org/Horner_Syndrome', GCA: 'https://ard.bmj.com/content/81/12/1647.long', CORN: 'https://rms.cornwall.nhs.uk/primary_care_clinical_referral_criteria/spinal_neurosurgery/adult_low_back_pain_guidelines',
    WHO: 'https://iris.who.int/handle/10665/43352', NG156: 'https://www.nice.org.uk/guidance/ng156/chapter/Recommendations', NG259: 'https://www.nice.org.uk/guidance/ng259/chapter/Fragility-fracture-risk-assessment', NG12: 'https://www.nice.org.uk/guidance/ng12/chapter/Recommendations-organised-by-site-of-cancer', CKS_LBP: 'https://cks.nice.org.uk/topics/back-pain-low-without-radiculopathy/diagnosis/assessment/', EDS2017: 'https://ehlers-danlos.com/wp-content/uploads/2022/03/Malfait_et_al-2017-American_Journal_of_Medical_Genetics_Part_C__Seminars_in_Medical_Genetics.pdf',
    EDSJH: 'https://www.ehlers-danlos.com/assessing-joint-hypermobility/', HG2003: 'https://doi.org/10.1111/j.1742-1241.2003.tb10455.x' };
  // per group: tier + basis; per item overrides below
  var GROUP_TIER = {
    ce: { tier: 'emergency', basis: 'JOSPT 2020: suspected cauda equina → emergency MRI and surgical opinion; NHS Right Decisions CES red flags', src: ['JOSPT', 'RD'] },
    va: { tier: 'emergency', basis: 'IFOMPT 2020 §6.5: refer for immediate medical investigation when history/examination suggest vascular pathology (stroke/TIA, dissection)', src: ['IFOMPT'] },
    hs: { tier: 'emergency', basis: 'EyeWiki: acute painful Horner syndrome may indicate carotid dissection and needs urgent work-up', src: ['EYE'] },
    gc: { tier: 'emergency', basis: 'GCA risk to vision: emergency tier is a practice choice (ACR/EULAR 2022 gives classification items, not referral urgency) — ' + UNS, src: ['GCA'] },
    sy: { tier: 'caution', basis: 'JOSPT 2020 / Right Decisions: malignancy and infection risk factors raise suspicion; single flags have low diagnostic accuracy', src: ['JOSPT', 'RD'] },
    cm: { tier: 'caution', basis: 'Davies BM et al. BMJ 2018 (DCM): prompt specialist assessment; urgent if progressive', src: ['DCM'] },
    fx: { tier: 'caution', basis: 'JOSPT 2020: fracture red flags are weak alone; consider broader risk factors; acting on single red flags not recommended', src: ['JOSPT'] },
    ib: { tier: 'caution', basis: 'NICE NG65: features suggesting spondyloarthritis → consider rheumatology referral', src: ['NG65'] },
    hm: { tier: 'caution', basis: 'WHO 2005 Part 2: congenital generalised hypermobility and signs of instability are listed as contraindications to spinal manipulation; articular hypermobility is a relative contraindication at that area. Caution tier (not emergency) is a ' + UNS + ' placement.', src: ['WHO', 'EDS2017'] }
  };
  var ITEM_TIER = {
    sy_fever: { tier: 'emergency', basis: 'Infection with systemic signs (fever, unwell): emergency referral if seriously unwell or suspected spinal infection/abscess (Right Decisions infection flags; NHS pathway) — tiering partly ' + UNS, src: ['RD', 'JOSPT'] },
    sy_thoracic: { tier: 'emergency', basis: 'Chest/abdominal/breathing symptoms with back pain: consider visceral/vascular cause (e.g. ruptured AAA, aortic dissection) — NHS Cornwall LBP guideline. AAA age context: NICE NG156 1.1.1–1.1.3 (men aged 66 or over; women aged 70 and over with risk factors) — screening/imaging ages, not an emergency trigger', src: ['CORN', 'NG156'] },
    fx_trauma: { tier: 'emergency', basis: 'Severe acute back pain straight after significant trauma — consider unstable vertebral fracture (NHS Cornwall LBP guideline); JOSPT: fracture work-up', src: ['CORN', 'JOSPT'] },
    sy_trauma: { tier: 'caution', basis: 'Minor trauma with osteoporosis/older age: fracture risk factor (JOSPT 2020)', src: ['JOSPT'] },
    sy_age: { tier: 'caution', basis: 'Age cut-off (overridable): NICE CKS LBP cancer red flag "Age 50 years or over"; NICE NG12 1.10.4 age 60+ with persistent back pain → myeloma tests. Young-onset cut-off ' + UNS + '. Caution tier: NICE frames age as a risk factor, not an emergency', src: ['CKS_LBP', 'NG12'] },
    fx_age: { tier: 'caution', basis: 'Age cut-off (overridable): NICE NG259 1.1.2 "all men aged 75 and over all women aged 65 and over" (consider assessing fragility fracture risk)', src: ['NG259', 'JOSPT'] },
    ib_young: { tier: 'caution', basis: 'Age cut-off (overridable): NICE NG65 1.1.5 back pain "started before the age of 45 years and has lasted for longer than 3 months" → rheumatology if 4+ further criteria', src: ['NG65'] }
  };
  // what / why / considerations for caution flags (why = sourced; considerations = clinic default unless stated)
  var INFO = {
    sy_cancer: ['Past history of cancer', 'Past cancer is a red flag for spinal malignancy, especially breast, lung, GI, prostate, renal, thyroid (Right Decisions)', 'Ask about current symptoms and oncology follow-up; low threshold to co-manage with GP/oncology if pain is unremitting, at night or with weight loss; avoid high-force techniques over suspected lesions — ' + UNS],
    sy_weight: ['Unexplained weight loss', 'Malignancy red flag (Right Decisions; JOSPT 2020)', 'Clarify amount and time frame; consider GP opinion/blood tests — ' + UNS],
    sy_night: ['Constant / night pain not eased by rest', 'Severe unremitting or night pain is a malignancy red flag (Right Decisions)', 'Monitor response over 4–6 weeks (Right Decisions: no improvement after 4–6 weeks is itself a flag); co-manage if no change — ' + UNS],
    sy_immuno: ['Immunosuppression, long-term steroids or IV drug use', 'Spinal infection risk factors (Right Decisions)', 'Ask about fever/unwell; gentle techniques; refer if systemic signs appear — ' + UNS],
    sy_age: ['Onset at an older or very young age', 'Cancer red flag: "Age 50 years or over" (NICE CKS LBP red flags); NICE NG12 1.10.4: age 60+ with persistent back pain → myeloma tests. The young-onset cut-off is ' + UNS, 'Weigh with other flags (JOSPT: single flags are weak) — ' + UNS],
    sy_trauma: ['Trauma with osteoporosis / older age', 'Fracture risk factor (JOSPT 2020)', 'Consider imaging before manual therapy; low-force techniques — ' + UNS],
    cm_hands: ['Clumsy hands / loss of dexterity', 'Common symptom of degenerative cervical myelopathy (DCM BMJ 2018)', 'Neurological exam incl. upper motor neuron signs; avoid end-range / high-velocity cervical techniques until myelopathy is excluded; specialist opinion, urgent if progressive (DCM) — technique advice ' + UNS],
    cm_gait: ['Change in gait / falls', 'DCM symptom (DCM BMJ 2018)', 'As above; fall-risk precautions — ' + UNS],
    cm_reflex: ['Hyperreflexia, clonus, Hoffmann', 'Upper motor neuron signs in DCM (DCM BMJ 2018)', 'Specialist opinion; avoid cervical HVLA meanwhile — ' + UNS],
    cm_lhermitte: ["Lhermitte's sign", 'Reported in DCM, uncommon (DCM BMJ 2018)', 'Neurological exam; specialist opinion if other signs — ' + UNS],
    fx_osteo: ['Osteoporosis or fragility fracture', 'Fracture risk factor (JOSPT 2020)', 'Avoid high-velocity thrust and heavy loading of the spine/ribs; low-force techniques and graded exercise — ' + UNS],
    fx_steroid: ['Long-term corticosteroids', 'Fracture risk factor (JOSPT 2020)', 'As for osteoporosis; ask about bone-density testing — ' + UNS],
    fx_age: ['Older age (fracture risk)', 'NICE NG259 1.1.2: consider assessing fragility fracture risk in all women aged 65 and over and all men aged 75 and over; JOSPT 2020: fracture risk rises with age', 'Weigh with other risk factors; low-force options — ' + UNS],
    ib_stiff: ['Morning stiffness > 30 min', 'Inflammatory back pain feature (sign-off sheet: not verified; NG65 lists other features)', 'Consider NG65 criteria; rheumatology opinion if several features — ' + UNS],
    ib_move: ['Improves with movement, not rest', 'Spondyloarthritis feature (NICE NG65)', 'Consider rheumatology referral if criteria met (NG65); exercise-based care — ' + UNS],
    ib_young: ['Onset at a young age', 'NICE NG65 1.1.5: back pain started before 45 and lasting > 3 months → spondyloarthritis assessment if 4+ further criteria (onset before 35 further increases likelihood)', 'As above — ' + UNS],
    hm_beighton: ['Generalised joint hypermobility (Beighton score)', 'Beighton score ≥ 6 before puberty, ≥ 5 from puberty to 50, ≥ 4 over 50 (2017 EDS classification). WHO 2005: congenital generalised hypermobility is listed as a contraindication to spinal manipulation; manipulation should avoid hypermobile or unstable areas.', 'Use low-force techniques and mobilisation within normal range at hypermobile areas, and emphasise stabilising exercise — ' + UNS],
    hm_5pq: ['Positive five-part hypermobility questionnaire', '2 or more "yes" suggests hypermobility, about 80–85% sensitivity and 80–90% specificity (Hakim & Grahame 2003; 2017 EDS classification, Table III). It is a screening result, not a diagnosis.', 'Confirm with a Beighton score; manage as for hypermobility if confirmed — ' + UNS],
    hm_dx: ['Diagnosed hEDS / HSD / other heritable connective-tissue disorder', 'WHO 2005 Part 2 lists congenital generalised hypermobility among contraindications to spinal manipulation (2017 EDS classification defines hEDS/HSD).', 'Avoid high-velocity thrust at hypermobile areas; low-force care and exercise; co-manage with the treating doctor if unsure — ' + UNS],
    hm_ucinstab: ['Upper-cervical (atlantoaxial) instability', 'WHO 2005 Part 2: atlantoaxial instability is an absolute contraindication to joint manipulation at that area.', 'No upper-cervical manipulation; get a medical opinion / imaging if instability is suspected and not yet assessed — ' + UNS]
  };
  var CHIP_TIER = { 'Bladder/Sphincter': 'emergency', 'Drop attacks': 'emergency', 'Ataxia': 'emergency', 'Intractable pain': 'caution', 'Altered gait': 'caution', 'Clumsy hands': 'caution', 'Hyperreflexia': 'caution' };
  var EMERG_DECISIONS = [['referred', 'Referred / sent for emergency care'], ['not_referred', 'Not referred (reason required)']];
  var CAUTION_DECISIONS = [['manage_modified', 'Manage within my scope (with modifications)'], ['co_manage', 'Co-manage / refer for opinion'], ['refer', 'Refer'], ['monitor', 'Monitor']];
  function tierInfo(k) { if (k.indexOf('chip:') === 0) { var g0 = CHIP_MAP[k.slice(5)]; return { tier: CHIP_TIER[k.slice(5)] || 'caution', basis: (GROUP_TIER[g0] || {}).basis || UNS, src: (GROUP_TIER[g0] || {}).src || [] }; }
    var it = ITEM[k]; if (!it) return { tier: 'caution', basis: UNS, src: [] }; return ITEM_TIER[k] || GROUP_TIER[it.group.id] || { tier: 'caution', basis: UNS, src: [] }; }
  function tierOf(k) { return tierInfo(k).tier; }
  var ITEM = {}; GROUPS.forEach(function (g) { g.items.forEach(function (it) { ITEM[it[0]] = { id: it[0], text: it[1], group: g }; }); });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function st() { APP.redFlags = APP.redFlags || { answers: {}, acks: [] }; return APP.redFlags; }
  function toast(m) { try { showToast(m); } catch (e) {} }
  function val(id) { var e = document.getElementById(id); return e ? (e.value || '') : ''; }

  // Trigger rule (clinic default, unsourced): any 'yes' answer, or any mapped existing chip active, is a positive flag.
  function positives() {
    var s = st(), out = [];
    Object.keys(s.answers).forEach(function (k) { if (s.answers[k] === 'yes' && ITEM[k]) out.push(k); });
    document.querySelectorAll('#redFlags .chip.active').forEach(function (c) {
      var v = c.dataset.val || c.textContent.trim(); if (CHIP_MAP[v]) out.push('chip:' + v);
    });
    return out;
  }
  function labelOf(k) { if (k.indexOf('chip:') === 0) return 'Patient tab chip: ' + k.slice(5); var it = ITEM[k]; return it ? it.group.title + ' — ' + it.text : k; }
  function groupOf(k) { if (k.indexOf('chip:') === 0) { var g = CHIP_MAP[k.slice(5)]; return GROUPS.filter(function (x) { return x.id === g; })[0]; } return ITEM[k] && ITEM[k].group; }
  function acked() { var s = st(), set = {}; s.acks.forEach(function (a) { (a.flags || []).forEach(function (f) { set[f] = 1; }); }); return set; }
  function unacked() { var a = acked(); return positives().filter(function (k) { return !a[k]; }); }
  function sync() { var s = st(); s.positive = positives(); s.unacknowledged = unacked(); s.emergencyUndocumented = s.unacknowledged.filter(function (k) { return tierOf(k) === 'emergency'; }); s.tiers = {}; s.positive.forEach(function (k) { s.tiers[k] = tierOf(k); }); s.rulesStatus = 'sourced-tiers-v3'; s.ageCutoffs = ageSnapshot(); }

  // ---------- Checklist UI ----------
  function groupHTML(g, where) {
    var s = st();
    return '<div class="p1rf-group" data-group="' + g.id + '" style="margin:8px 0"><div style="font-weight:700;font-size:13px">' + esc(g.title) + '</div>' +
      g.items.map(function (it) {
        var v = s.answers[it[0]] || '';
        return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid var(--border,#eee);font-size:12px">' +
          '<span>' + esc(it[1]) + '</span><select data-rf="' + it[0] + '" data-where="' + where + '" style="width:auto;min-width:90px' + (v === 'yes' ? ';border:2px solid var(--red,#C0392B)' : '') + '">' +
          '<option value=""' + (v === '' ? ' selected' : '') + '>—</option><option value="no"' + (v === 'no' ? ' selected' : '') + '>No</option>' +
          '<option value="yes"' + (v === 'yes' ? ' selected' : '') + '>Yes</option><option value="unknown"' + (v === 'unknown' ? ' selected' : '') + '>Unsure</option></select></div>';
      }).join('') + '</div>';
  }
  function cardHTML(groups, where, title) {
    return '<div class="card p1rf-card" data-where="' + where + '"><div class="card-title"><span class="icon">🚩</span> ' + esc(title) +
      ' <span style="font-size:10px;background:#B35900;color:#fff;border-radius:10px;padding:2px 8px;margin-left:6px">' + PH + '</span></div>' +
      '<div style="font-size:11px;color:var(--text3,#777)">Screening questions only. ' + esc(STATUS_LONG) + ' Any "Yes" is highlighted: emergency flags ask for a documented decision (referred / not referred + reason); caution flags show why they matter and ask for your management decision. Nothing forces a referral or blocks saving.</div>' +
      groups.map(function (g) { return groupHTML(g, where); }).join('') + ageLine() + '<div class="p1rf-status" style="font-size:12px;margin-top:6px"></div></div>';
  }
  function ptAge() { var d = val('ptDOB'); if (!d) return null; var b = new Date(d); if (isNaN(b)) return null; var n = new Date(), a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; }
  function ageLine() { var sn = ageSnapshot(), a = ptAge();
    return '<div class="p1rf-ages" style="font-size:11px;margin-top:6px;color:#5a4a2a">Age cut-offs in use' + (sn.overridden ? ' <b>(changed by ' + esc(sn.by) + ')</b>' : ' (NICE-sourced defaults)') + ': cancer ≥ ' + sn.values.sy_age_over + ' / onset under ' + sn.values.sy_age_under + ' · fracture women ' + sn.values.fx_age_women + '+, men ' + sn.values.fx_age_men + '+ · GCA ' + sn.values.gc_age_over + '+ · SpA onset before ' + sn.values.ib_onset_under +
      (a != null ? ' · patient age ' + a : '') + " <button type=\"button\" class=\"btn btn-secondary p1rf-ageedit\" data-cc-click=\"P1RedFlags.editAges()\" style=\"padding:2px 8px;font-size:11px\">Age cut-offs…</button></div>"; }
  function rerenderCards() { applyAgeTexts(); var h = document.querySelector('#sec-history .p1rf-card'); if (h) h.remove(); injectHistory(); try { var e = document.querySelector('#examContent .p1rf-card'); if (e && APP.currentRegion) injectExam(APP.currentRegion); } catch (x) {} }
  function editAges() {
    var old = document.getElementById('p1AgeEdit'); if (old) old.remove();
    var prof = {}; try { prof = loadProfile(); } catch (e) {}
    var m = document.createElement('div'); m.id = 'p1AgeEdit'; m.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 8px';
    m.innerHTML = '<div style="background:#fff;max-width:720px;width:100%;border-radius:12px;padding:16px;font-size:13px"><h3 style="margin:0 0 6px">Red-flag age cut-offs</h3><div style="font-size:12px;margin-bottom:6px">Defaults come from the NICE sources below; anything else is labelled. You can change them; the change, your name and reason are logged and stored with each red-flag decision.</div>' +
      AGE_FIELDS.map(function (f) { return '<div style="border:1px solid #eee;border-radius:8px;padding:6px 8px;margin:4px 0"><label style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>' + esc(f.label) + '</b><input type="number" min="1" max="119" data-age="' + f.k + '" value="' + ageVal(f.k) + '" style="width:80px"></label><div style="font-size:11px;color:#555">Default ' + f.def + ' · ' + esc(f.quote) + (f.src.length ? ' · ' + f.src.map(function (k) { return '<a href="' + AGE_SRC[k].url + '" target="_blank" rel="noopener">' + esc(AGE_SRC[k].name) + '</a>'; }).join(' · ') : '') + '</div></div>'; }).join('') +
      '<label style="font-size:12px">Reason for change (required when changing)</label><textarea id="p1AgeWhy" rows="2" style="width:100%;box-sizing:border-box"></textarea><div style="font-size:12px;margin-top:4px">By <input id="p1AgeBy" value="' + esc(prof.name || '') + '" style="max-width:260px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="btn btn-secondary" id="p1AgeReset">Restore NICE defaults</button><button type="button" class="btn btn-secondary" id="p1AgeCancel">Cancel</button><button type="button" class="btn btn-primary" id="p1AgeSave">Save</button></div><div id="p1AgeMsg" style="font-size:12px;color:#a00"></div></div>';
    document.body.appendChild(m);
    function log(entry) { try { var l = JSON.parse(localStorage.getItem(AGE_KEY + '_log') || '[]'); l.push(entry); localStorage.setItem(AGE_KEY + '_log', JSON.stringify(l)); } catch (e) {} }
    m.querySelector('#p1AgeCancel').onclick = function () { m.remove(); };
    m.querySelector('#p1AgeReset').onclick = function () { var by = m.querySelector('#p1AgeBy').value.trim(); if (!by) { m.querySelector('#p1AgeMsg').textContent = 'Name required'; return; } localStorage.removeItem(AGE_KEY); log({ at: new Date().toISOString(), by: by, action: 'reset-to-defaults' }); m.remove(); rerenderCards(); toast('Age cut-offs restored to NICE defaults'); };
    m.querySelector('#p1AgeSave').onclick = function () {
      var vals = {}, bad = false; m.querySelectorAll('input[data-age]').forEach(function (i) { var v = Math.round(+i.value); if (!(v > 0 && v < 120)) bad = true; var f = AGE_FIELDS.filter(function (x) { return x.k === i.dataset.age; })[0]; if (v !== f.def) vals[f.k] = v; });
      var why = m.querySelector('#p1AgeWhy').value.trim(), by = m.querySelector('#p1AgeBy').value.trim(), msg = m.querySelector('#p1AgeMsg');
      if (bad) { msg.textContent = 'Ages must be between 1 and 119'; return; } if (!by) { msg.textContent = 'Name required'; return; }
      if (Object.keys(vals).length && !why) { msg.textContent = 'Reason required when changing a default'; return; }
      var at = new Date().toISOString();
      if (Object.keys(vals).length) localStorage.setItem(AGE_KEY, JSON.stringify({ values: vals, by: by, at: at, reason: why })); else localStorage.removeItem(AGE_KEY);
      log({ at: at, by: by, action: 'set', values: vals, reason: why }); m.remove(); rerenderCards(); toast('Age cut-offs saved');
    };
  }
  function bind(root) {
    root.querySelectorAll('select[data-rf]').forEach(function (sel) {
      sel.onchange = function () {
        st().answers[sel.dataset.rf] = sel.value; sync(); refreshAll();
        if (sel.value === 'yes') checkAlert();
      };
    });
  }
  function refreshAll() {
    var s = st();
    document.querySelectorAll('select[data-rf]').forEach(function (sel) {
      var v = s.answers[sel.dataset.rf] || ''; if (sel.value !== v) sel.value = v;
      sel.style.border = v === 'yes' ? '2px solid var(--red,#C0392B)' : '';
    });
    document.querySelectorAll('.p1rf-ages').forEach(function (el) { var w = document.createElement('div'); w.innerHTML = ageLine(); el.replaceWith(w.firstChild); });
    var pos = positives(), un = unacked();
    document.querySelectorAll('.p1rf-status').forEach(function (el) {
      el.innerHTML = !pos.length ? '<span style="color:var(--text3,#777)">No positive red flags recorded.</span>' :
        '<span style="color:var(--red,#C0392B);font-weight:700">🚩 ' + pos.length + ' positive' + (un.length ? ' · ' + un.length + ' decision' + (un.length > 1 ? 's' : '') + ' not yet recorded' + (un.some(function (k) { return tierOf(k) === 'emergency'; }) ? ' (incl. EMERGENCY)' : '') : ' · decisions recorded') + '</span>' +
        (un.length ? " <button type=\"button\" class=\"btn btn-secondary\" data-cc-click=\"P1RedFlags.checkAlert()\">Review</button>" : '');
    });
  }
  function injectHistory() {
    var sec = document.getElementById('sec-history'); if (!sec || sec.querySelector('.p1rf-card')) return;
    var w = document.createElement('div'); w.innerHTML = cardHTML(GROUPS, 'history', 'Red-flag screen');
    sec.insertBefore(w.firstChild, sec.firstChild); bind(sec); refreshAll();
  }
  function injectExam(region) {
    var host = document.getElementById('examContent'); if (!host) return;
    var gs = GROUPS.filter(function (g) { return (g.regions || []).indexOf(region) >= 0; }); if (!gs.length) return;
    var old = host.querySelector('.p1rf-card'); if (old) old.remove();
    var w = document.createElement('div'); w.innerHTML = cardHTML(gs, 'exam-' + region, 'Red-flag screen — ' + gs.map(function (g) { return g.title; }).join(', '));
    host.insertBefore(w.firstChild, host.firstChild); bind(host); refreshAll();
  }

  // ---------- Blocking alert ----------
  function draftText(kind, flags) {
    var name = (val('ptFirstName') + ' ' + val('ptLastName')).trim() || '[patient]', dob = val('ptDOB');
    var prof = {}; try { prof = loadProfile(); } catch (e) {}
    var lines = flags.map(function (k) { return '- ' + labelOf(k); }).join('\n');
    var dx = []; try { Object.keys(APP.examData || {}).forEach(function (r) { var D = APP.examData[r]; if (D && (D.formulatedCondition || D.primaryDx)) dx.push((D.formulatedCondition || D.primaryDx) + (D.icd10 ? ' (' + D.icd10 + ')' : '')); }); } catch (e) {}
    var today = localISODate();
    var flagSentence = 'Examination revealed ' + flagList(flags) + '. Immediate referral was deemed necessary and no treatment was provided.';
    if (kind === 'er') return 'URGENT REFERRAL — same-day assessment requested\n\nDate: ' + today + '\nPatient: ' + name + (dob ? ' (DOB ' + dob + ')' : '') +
      '\n\n' + flagSentence + (dx.length ? '\n\nWorking assessment: ' + dx.join('; ') : '') + '\n\n' +
      (prof.name || 'Treating chiropractor') + (prof.prNo ? ', Pr ' + prof.prNo : '') + '\n[DRAFT — review and edit before sending]';
    return 'Dear Doctor,\n\nRe: ' + name + (dob ? ' (DOB ' + dob + ')' : '') + '\n\nI saw this patient on ' + today + ' for ' + (val('pcRegion') || 'musculoskeletal') +
      ' symptoms. Screening recorded the following findings, which I would be grateful if you could assess further:\n' + lines +
      (dx.length ? '\n\nWorking assessment: ' + dx.join('; ') : '') + '\n\nThank you for seeing them.\n\nKind regards,\n' + (prof.name || 'Treating chiropractor') +
      (prof.prNo ? ', Pr ' + prof.prNo : '') + '\n[DRAFT — review and edit before sending]';
  }
  function flagText(k) { if (k.indexOf('chip:') === 0) return k.slice(5).toLowerCase(); var it = ITEM[k]; return it ? it.group.title + ': ' + it.text.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\?\s*$/, '').trim() : k; }
  function flagList(flags) { return flags.map(flagText).join('; '); }
  function suggestedKind(flags) { return flags.some(function (k) { var g = groupOf(k); return g && g.referral === 'er'; }) ? 'er' : 'gp'; }

  function srcLinks(keys) { return (keys || []).map(function (k) { return '<a href="' + SRC[k] + '" target="_blank" rel="noopener">' + k + '</a>'; }).join(' · '); }
  function undocumentedEmergency() { return unacked().filter(function (k) { return tierOf(k) === 'emergency'; }); }
  function checkAlert() {
    sync(); var un = unacked(); if (!un.length) { closeAlert(); return false; }
    var em = un.filter(function (k) { return tierOf(k) === 'emergency'; }), ca = un.filter(function (k) { return tierOf(k) !== 'emergency'; });
    var m = document.getElementById('p1RfAlert');
    if (!m) { m = document.createElement('div'); m.id = 'p1RfAlert'; m.setAttribute('role', 'alertdialog'); document.body.appendChild(m); }
    m.style.cssText = 'position:fixed;inset:0;z-index:10000;background:' + (em.length ? 'rgba(120,0,0,.55)' : 'rgba(120,80,0,.35)') + ';display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 8px';
    var prof = {}; try { prof = loadProfile(); } catch (e) {}
    var opt = function (list, name) { return list.map(function (d) { return '<label style="display:block;font-size:13px;margin:2px 0"><input type="radio" name="' + name + '" value="' + d[0] + '" style="width:auto"> ' + esc(d[1]) + '</label>'; }).join(''); };
    var h = '<div style="background:var(--card,#fff);color:var(--text,#222);max-width:720px;width:100%;border-radius:12px;padding:16px;border:3px solid ' + (em.length ? '#C0392B' : '#E67E22') + '">';
    if (em.length) h += '<div id="p1RfEm"><h3 style="margin:0 0 6px;color:#C0392B">🚨 Emergency red flag — document your decision</h3>' +
      '<div style="font-size:12px;margin-bottom:6px">These features can indicate a condition needing immediate medical care. Your clinical judgement decides; the app only asks you to record the decision (nothing is blocked).</div>' +
      '<ul id="p1RfList" style="font-size:13px;margin:4px 0 8px 18px;padding:0">' + em.map(function (k) { var t = tierInfo(k); return '<li data-flag="' + esc(k) + '">' + esc(labelOf(k)) + '<div style="font-size:11px;color:#666">' + esc(t.basis) + ' ' + srcLinks(t.src) + '</div></li>'; }).join('') + '</ul>' +
      opt(EMERG_DECISIONS, 'p1RfEmDec') + '<label style="font-size:12px">Reason / details (required if not referred)</label><textarea id="p1RfEmWhy" rows="2" style="width:100%;box-sizing:border-box"></textarea></div>';
    if (ca.length) h += '<div id="p1RfCa" style="margin-top:' + (em.length ? '12' : '0') + 'px"><h3 style="margin:0 0 6px;color:#8A5A00">⚠️ Caution / risk factors — your decision</h3>' +
      '<div style="font-size:12px;margin-bottom:6px">Highlighted so you can decide whether this is within your scope. Suggestions are considerations, not requirements.</div>' +
      ca.map(function (k) { var t = tierInfo(k), inf = INFO[k] || [labelOf(k), t.basis, UNS]; return '<div data-flag="' + esc(k) + '" style="border:1px solid #f0d9b5;border-radius:8px;padding:6px 8px;margin:4px 0;font-size:12px"><b>' + esc(inf[0]) + '</b>' +
        '<div><i>Why it matters:</i> ' + esc(inf[1]) + ' ' + srcLinks(t.src) + '</div><div><i>Considerations:</i> ' + esc(inf[2]) + '</div></div>'; }).join('') +
      opt(CAUTION_DECISIONS, 'p1RfCaDec') + '<label style="font-size:12px">Reason / plan (required)</label><textarea id="p1RfCaWhy" rows="2" style="width:100%;box-sizing:border-box"></textarea></div>';
    h += '<div class="p1rf-sources" style="font-size:11px;color:#5a4a2a;margin-top:6px">Sources: ' + esc(STATUS_LONG) + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0"><button type="button" id="p1RfEr" class="btn btn-secondary">Draft urgent / ER note</button><button type="button" id="p1RfGp" class="btn btn-secondary">Draft GP / specialist letter</button></div>' +
      '<textarea id="p1RfDraft" rows="7" style="width:100%;box-sizing:border-box;font:inherit;font-size:12px;display:none"></textarea>' +
      '<div id="p1RfDraftBtns" style="display:none;gap:6px;flex-wrap:wrap;margin:6px 0"><button type="button" id="p1RfCopy" class="btn btn-secondary">Copy text</button><button type="button" id="p1RfPdf" class="btn btn-secondary">Make PDF letter</button><button type="button" id="p1RfRefTab" class="btn btn-secondary">Open Referral network</button></div>' +
      '<div style="margin-top:8px;font-size:12px"><label>Decision by</label><input id="p1RfBy" value="' + esc(prof.name || '') + '" style="max-width:320px"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" id="p1RfLater" class="btn btn-secondary">Decide later</button><button type="button" id="p1RfAck" class="btn btn-primary" disabled>Record decision</button></div><div id="p1RfMsg" style="font-size:12px;color:#a00"></div></div>';
    m.innerHTML = h;
    var draftKind = null, q = function (s) { return m.querySelector(s); };
    function showDraft(k) { draftKind = k; var t = q('#p1RfDraft'); t.value = draftText(k, un); t.style.display = 'block'; q('#p1RfDraftBtns').style.display = 'flex'; }
    q('#p1RfEr').onclick = function () { showDraft('er'); }; q('#p1RfGp').onclick = function () { showDraft('gp'); };
    q('#p1RfCopy').onclick = function () { var t = q('#p1RfDraft').value; try { navigator.clipboard.writeText(t).then(function () { toast('Draft copied'); }); } catch (e) { toast('Copy not available'); } };
    q('#p1RfPdf').onclick = function () { try { shareLetterPDF(draftKind === 'er' ? 'Urgent referral' : 'Referral letter', q('#p1RfDraft').value, (val('ptFirstName') + ' ' + val('ptLastName')).trim(), ''); } catch (e) { toast('PDF letter not available'); } };
    q('#p1RfRefTab').onclick = function () { closeAlert(); try { if (typeof showReferralNetworkModal === 'function') showReferralNetworkModal(); } catch (e) {} };
    q('#p1RfLater').onclick = function () { closeAlert(); refreshAll(); if (em.length) toast('Emergency red flag: decision not yet documented'); };
    function picked(n) { var r = m.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; }
    function ready() { var by = q('#p1RfBy').value.trim(); if (!by) return false;
      var emOk = !em.length || (picked('p1RfEmDec') && (picked('p1RfEmDec') === 'referred' || q('#p1RfEmWhy').value.trim()));
      var caOk = !ca.length || (picked('p1RfCaDec') && q('#p1RfCaWhy').value.trim());
      return emOk && caOk; }
    var ack = q('#p1RfAck'); function upd() { ack.disabled = !ready(); }
    m.querySelectorAll('input,textarea').forEach(function (e) { e.addEventListener('input', upd); e.addEventListener('change', upd); });
    ack.onclick = function () { if (!ready()) return; var by = q('#p1RfBy').value.trim(), at = new Date().toISOString();
      if (em.length) st().acks.push({ by: by, at: at, tier: 'emergency', flags: em.slice(), flagText: em.map(labelOf), decision: picked('p1RfEmDec'), reason: q('#p1RfEmWhy').value.trim(), referral: draftKind, referralDraft: draftKind ? q('#p1RfDraft').value : null, rulesStatus: 'sourced-tiers-v3', ageCutoffs: ageSnapshot() });
      if (ca.length) st().acks.push({ by: by, at: at, tier: 'caution', flags: ca.slice(), flagText: ca.map(labelOf), decision: picked('p1RfCaDec'), reason: q('#p1RfCaWhy').value.trim(), referral: draftKind, referralDraft: draftKind ? q('#p1RfDraft').value : null, rulesStatus: 'sourced-tiers-v3', ageCutoffs: ageSnapshot() });
      sync(); closeAlert(); refreshAll(); toast('Red-flag decision recorded by ' + by); };
    return true;
  }
  function closeAlert() { var m = document.getElementById('p1RfAlert'); if (m) m.remove(); }

  // ---------- Hooks ----------
  function hookAll() {
    injectHistory();
    if (typeof window.renderExam === 'function' && !window.renderExam._p1rf) {
      var rE = window.renderExam;
      window.renderExam = function (region) { var r = rE.apply(this, arguments); try { var rr = (typeof resolveExamRegion === 'function' ? resolveExamRegion(region) : region) || region; injectExam(typeof rr === 'string' ? rr : region); } catch (e) {} return r; };
      window.renderExam._p1rf = 1;
    }
    if (typeof window.ensureDxConfirmedForSave === 'function' && !window.ensureDxConfirmedForSave._p1rf) {
      var g = window.ensureDxConfirmedForSave;
      window.ensureDxConfirmedForSave = function (label) {
        sync();
        // v2: never a hard block. Undocumented emergency flags are saved as 'decision not documented' and the prompt reopens.
        if (undocumentedEmergency().length) { toast('Emergency red flag: decision not yet documented — saved as undocumented'); setTimeout(checkAlert, 0); }
        return g.apply(this, arguments);
      };
      window.ensureDxConfirmedForSave._p1rf = 1;
    }
    if (typeof window.gatherAllData === 'function' && !window.gatherAllData._p1rf) {
      var ga = window.gatherAllData;
      window.gatherAllData = function () { var d = ga.apply(this, arguments); try { sync(); d.redFlags = JSON.parse(JSON.stringify(st())); d.redFlagPositive = (st().positive || []).length > 0; } catch (e) {} return d; };
      window.gatherAllData._p1rf = 1;
    }
    if (typeof window.restoreData === 'function' && !window.restoreData._p1rf) {
      var rd = window.restoreData;
      window.restoreData = function (data) { var r = rd.apply(this, arguments); try { APP.redFlags = (data && data.redFlags) ? JSON.parse(JSON.stringify(data.redFlags)) : { answers: {}, acks: [] }; refreshAll(); } catch (e) {} return r; };
      window.restoreData._p1rf = 1;
    }
    document.querySelectorAll('#redFlags .chip').forEach(function (c) {
      if (c._p1rf) return; c._p1rf = 1;
      c.addEventListener('click', function () { setTimeout(function () { sync(); refreshAll(); if (c.classList.contains('active') && CHIP_MAP[c.dataset.val]) checkAlert(); }, 0); });
    });
    if (typeof window.buildReferralLetterHtml === 'function' && !window.buildReferralLetterHtml._p1rf) {
      var bR = window.buildReferralLetterHtml;
      window.buildReferralLetterHtml = function () {
        var html = bR.apply(this, arguments); if (!html) return html;
        try { sync(); var pos = st().positive || []; if (!pos.length) return html;
          var sec = '<div class="rl-section-title p1rf-letter">Red flags recorded</div><div class="rl-clinical-block p1rf-letter-body">' +
            esc('Examination revealed ' + flagList(pos) + '.') + '<ul>' + pos.map(function (k) { return '<li>' + esc(labelOf(k)) + '</li>'; }).join('') + '</ul></div>';
          var anchor = html.indexOf('<div class="rl-section-title">Presenting Complaint</div>');
          if (anchor < 0) anchor = html.indexOf('<div class="rl-section-title">Clinical History</div>');
          if (anchor < 0) anchor = html.lastIndexOf('</body>');
          html = anchor >= 0 ? html.slice(0, anchor) + sec + html.slice(anchor) : html + sec;
        } catch (e) {}
        return html;
      };
      window.buildReferralLetterHtml._p1rf = 1;
    }
    var tl = document.getElementById('ehrVisitTimeline');
    if (tl && !tl._p1rf) { tl._p1rf = 1; new MutationObserver(badgeTimeline).observe(tl, { childList: true }); badgeTimeline(); }
  }
  // Timeline badge
  function badgeTimeline() {
    var tl = document.getElementById('ehrVisitTimeline'); if (!tl) return;
    // P1 v9: look up each timeline visit by id through the data-access layer; the whole list is read only if that is not possible
    var visits = null; function cand(id) { var c = window.CCData.byId(id); if (c) return c; if (visits === null) { visits = []; try { visits = window.CCData.all(); } catch (e) {} } return visits; }
    tl.querySelectorAll('.ehr-timeline-item').forEach(function (b) {
      if (b.querySelector('.p1rf-badge')) return;
      var m = (b.getAttribute('data-cc-click') || '').match(/EHR_openVisit\('([^']+)'\)/); if (!m) return;
      var v = cand(m[1]).filter(function (x) { return x && (x.visitId === m[1] || x.id === m[1]); })[0];
      var n = v && v.redFlags && (v.redFlags.positive || []).length;
      if (n) { var s = document.createElement('span'); s.className = 'p1rf-badge'; s.title = 'Red flags recorded';
        s.style.cssText = 'display:inline-block;font-size:10px;background:#C0392B;color:#fff;border-radius:10px;padding:1px 7px;margin-left:6px';
        s.textContent = '🚩 ' + n + ' red flag' + (n > 1 ? 's' : ''); var d = b.querySelector('.ehr-tl-date') || b; d.appendChild(s); }
    });
  }
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'ptDOB') refreshAll(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookAll); else hookAll();
  window.addEventListener('load', function () { hookAll(); setTimeout(hookAll, 500); });
  window.P1RedFlags = { tierOf: tierOf, tierInfo: tierInfo, INFO: INFO, GROUP_TIER: GROUP_TIER, ITEM_TIER: ITEM_TIER, CHIP_TIER: CHIP_TIER, SRC: SRC, EMERG_DECISIONS: EMERG_DECISIONS, CAUTION_DECISIONS: CAUTION_DECISIONS, undocumentedEmergency: undocumentedEmergency, AGE_CUTOFFS: AGE_CUTOFFS, flagList: flagList, GROUPS: GROUPS, CHIP_MAP: CHIP_MAP, positives: positives, unacked: unacked, checkAlert: checkAlert, draftText: draftText, badgeTimeline: badgeTimeline, injectExam: injectExam, PH: PH, AGE_FIELDS: AGE_FIELDS, AGE_SRC: AGE_SRC, ageVal: ageVal, ageSnapshot: ageSnapshot, editAges: editAges, AGE_KEY: AGE_KEY, STATUS_LONG: STATUS_LONG, setAnswer: function (k, v, alert) { if (!ITEM[k]) return false; var o = st().answers[k]; st().answers[k] = v; sync(); refreshAll(); if (alert && v === 'yes' && o !== 'yes') checkAlert(); return true; }, ITEM: ITEM };
})();
;(function(){try{var s=document.createElement('style');s.textContent='#p1RfAlert .btn,.p1rf-card .btn{padding:7px 12px;border-radius:8px;border:1px solid #c9b99a;background:#efe6d6;color:#2f2a22;font:inherit;font-size:13px;cursor:pointer}#p1RfAlert .btn-primary{background:#4a5d3a;color:#fff;border-color:#4a5d3a}#p1RfAlert .btn:disabled{opacity:.5;cursor:not-allowed}';document.head.appendChild(s);}catch(e){}})();
