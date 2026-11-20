/*
 * ChiroClinic offline medication interaction prompts
 * Version: 2026.08.25.1
 *
 * High-priority screening rules only. This is deliberately not presented as a
 * comprehensive interaction database and must not replace current product
 * information, MIMS, or prescriber/pharmacist review.
 */
(function () {
  'use strict';

  const VERSION = '2026.08.25.1';

  function text(value) { return String(value || '').toLowerCase(); }
  function name(med) { return text(med.generic || med.name); }
  function drugClass(med) { return text(med.drugClass); }
  function hasFlag(med, flag) { return (med.flags || []).includes(flag); }
  function classHas(med, value) { return drugClass(med).includes(value); }
  function nameHas(med, values) { return values.some(value => name(med).includes(value)); }
  function displayName(med) { return med.generic || med.name || 'Unknown medicine'; }

  function isAnticoagulant(med) { return hasFlag(med, 'anticoagulant'); }
  function isAntiplatelet(med) { return hasFlag(med, 'antiplatelet'); }
  function isOpioid(med) { return hasFlag(med, 'opioid'); }
  function isSedating(med) { return hasFlag(med, 'sedating'); }
  function isBenzodiazepine(med) { return classHas(med, 'benzodiazepine'); }
  function isGabapentinoid(med) { return classHas(med, 'gabapentinoid'); }
  function isNsaid(med) { return classHas(med, 'nsaid') || classHas(med, 'cox-2 selective'); }
  function isSystemicSteroid(med) { return hasFlag(med, 'steroid'); }
  function isNitrate(med) { return classHas(med, 'nitrate antianginal'); }
  function isPde5(med) { return classHas(med, 'pde5 inhibitor'); }
  function isAce(med) { return classHas(med, 'ace inhibitor'); }
  function isArb(med) { return classHas(med, 'angiotensin receptor blocker'); }
  function isArni(med) { return classHas(med, 'arni'); }
  function isDiuretic(med) { return classHas(med, 'diuretic') || nameHas(med, ['spironolactone', 'eplerenone']); }
  function isPotassiumSparing(med) { return nameHas(med, ['spironolactone', 'eplerenone']); }
  function isBetaBlocker(med) { return classHas(med, 'beta blocker') || classHas(med, 'alpha/beta blocker'); }
  function isNonDhpCcb(med) { return nameHas(med, ['verapamil', 'diltiazem']); }
  function isMaoB(med) { return classHas(med, 'mao-b inhibitor'); }
  function isSerotonergic(med) {
    return classHas(med, 'ssri') || classHas(med, 'snri') || classHas(med, 'tricyclic') ||
      classHas(med, 'triptan') || classHas(med, 'serotonin') || isMaoB(med) ||
      nameHas(med, ['trazodone', 'vortioxetine', 'mirtazapine', 'clomipramine']);
  }
  function isSerotonergicOpioid(med) {
    return isOpioid(med) && nameHas(med, ['tramadol', 'tapentadol', 'fentanyl', 'methadone', 'pethidine']);
  }

  function checkInteractions(medications) {
    const meds = (Array.isArray(medications) ? medications : []).filter(med => med && med.status !== 'Stopped / Previous');
    const alerts = [];
    const seen = new Set();

    function add(code, severity, title, involved, reason, action, source) {
      const names = [...new Set(involved.map(displayName))];
      const key = code + '|' + names.slice().sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      alerts.push({ code, severity, title, medications: names, reason, action, source: source || 'Regulatory product labelling' });
    }

    for (let i = 0; i < meds.length; i++) {
      for (let j = i + 1; j < meds.length; j++) {
        const a = meds[i], b = meds[j];

        if ((isNitrate(a) && isPde5(b)) || (isNitrate(b) && isPde5(a))) {
          add('nitrate-pde5', 'serious', 'Contraindicated combination: nitrate + PDE5 inhibitor', [a, b],
            'This combination can cause a profound and dangerous fall in blood pressure.',
            'Verify urgently with the prescriber or pharmacist. Do not interpret this prompt as permission to alter treatment.', 'FDA-approved product labelling');
        }

        if (isAnticoagulant(a) && isAnticoagulant(b)) {
          add('dual-anticoagulant', 'serious', 'More than one anticoagulant recorded', [a, b],
            'Concurrent anticoagulants can substantially increase bleeding risk, although temporary overlap may sometimes be intentional.',
            'Confirm the exact current regimen, indication and transition plan with the prescriber or pharmacist.');
        }
        if ((isAnticoagulant(a) && isAntiplatelet(b)) || (isAnticoagulant(b) && isAntiplatelet(a))) {
          add('anticoagulant-antiplatelet', 'serious', 'Anticoagulant + antiplatelet', [a, b],
            'Combined effects on haemostasis can increase the risk of serious bleeding.',
            'Confirm intentional concurrent use and assess bleeding/bruising relevance before manual or invasive care.');
        }
        if ((isAnticoagulant(a) && isNsaid(b) && !isAntiplatelet(b)) ||
            (isAnticoagulant(b) && isNsaid(a) && !isAntiplatelet(a))) {
          add('anticoagulant-nsaid', 'serious', 'Anticoagulant + anti-inflammatory/NSAID', [a, b],
            'NSAIDs can increase bleeding risk when taken with an anticoagulant.',
            'Verify with the prescriber or pharmacist and assess for bleeding history or symptoms.');
        }
        if (isNsaid(a) && isNsaid(b)) {
          add('dual-nsaid', 'serious', 'More than one NSAID recorded', [a, b],
            'Duplicate NSAID therapy can increase gastrointestinal bleeding, renal and cardiovascular risk without reliably improving benefit.',
            'Confirm whether both products are actually current, including over-the-counter use.');
        }
        if ((isNsaid(a) && isSystemicSteroid(b)) || (isNsaid(b) && isSystemicSteroid(a))) {
          add('nsaid-steroid', 'review', 'NSAID + systemic corticosteroid', [a, b],
            'Concurrent systemic corticosteroid use is a recognised additional risk factor for NSAID-related gastrointestinal bleeding.',
            'Review gastrointestinal risk and verify the regimen with the treating clinician or pharmacist.');
        }

        if ((isOpioid(a) && isBenzodiazepine(b)) || (isOpioid(b) && isBenzodiazepine(a))) {
          add('opioid-benzodiazepine', 'serious', 'Opioid + benzodiazepine', [a, b],
            'Combined central nervous system depression can cause profound sedation, respiratory depression, coma or death.',
            'Confirm concurrent use and assess sedation, breathing, cognition, balance and fall risk.');
        }
        if ((isOpioid(a) && isGabapentinoid(b)) || (isOpioid(b) && isGabapentinoid(a))) {
          add('opioid-gabapentinoid', 'serious', 'Opioid + gabapentin/pregabalin', [a, b],
            'The combination can increase sedation and the risk of serious breathing difficulty, especially with respiratory disease or in older patients.',
            'Confirm concurrent use and assess respiratory and fall-risk factors.');
        }
        if (isOpioid(a) && isOpioid(b)) {
          add('dual-opioid', 'serious', 'More than one opioid recorded', [a, b],
            'Concurrent opioids can increase sedation and respiratory-depression risk; combination products may hide duplicate exposure.',
            'Confirm all products, doses and whether each is current or PRN.');
        }
        if ((isSerotonergicOpioid(a) && isSerotonergic(b) && !isMaoB(b)) ||
            (isSerotonergicOpioid(b) && isSerotonergic(a) && !isMaoB(a))) {
          add('serotonergic-opioid', 'review', 'Potential serotonergic interaction', [a, b],
            'Some opioids used with serotonergic medicines can precipitate serotonin syndrome.',
            'Verify the combination and assess for agitation, sweating, tremor, diarrhoea, fever, hyperreflexia or clonus if clinically relevant.');
        }
        if ((isMaoB(a) && isSerotonergic(b)) || (isMaoB(b) && isSerotonergic(a))) {
          add('maob-serotonergic', 'serious', 'MAO-B inhibitor + serotonergic medicine', [a, b],
            'This combination may cause a potentially serious serotonergic reaction and may be contraindicated depending on the agents and timing.',
            'Verify urgently against current product information or with the pharmacist/prescriber.');
        }

        if ((isAce(a) && isArb(b)) || (isAce(b) && isArb(a))) {
          add('ace-arb', 'review', 'ACE inhibitor + angiotensin receptor blocker', [a, b],
            'Dual renin–angiotensin system blockade can increase hypotension, renal impairment and hyperkalaemia risk.',
            'Confirm that concurrent use is intentional and that renal function and potassium are monitored.');
        }
        if ((isAce(a) && isArni(b)) || (isAce(b) && isArni(a))) {
          add('ace-arni', 'serious', 'ACE inhibitor + sacubitril/valsartan', [a, b],
            'Concurrent use is contraindicated because of angioedema risk; a washout interval is required when switching.',
            'Verify urgently with the prescriber or pharmacist.');
        }
        if ((isPotassiumSparing(a) && (isAce(b) || isArb(b) || isArni(b))) ||
            (isPotassiumSparing(b) && (isAce(a) || isArb(a) || isArni(a)))) {
          add('raas-potassium', 'review', 'RAAS medicine + potassium-sparing diuretic', [a, b],
            'The combination may increase potassium and renal-impairment risk, although it is sometimes intentionally prescribed.',
            'Confirm monitoring of renal function, potassium and blood pressure.');
        }
        if ((isBetaBlocker(a) && isNonDhpCcb(b)) || (isBetaBlocker(b) && isNonDhpCcb(a))) {
          add('rate-limiting-cardiac', 'review', 'Two rate-limiting cardiac medicines', [a, b],
            'A beta blocker with verapamil or diltiazem can increase bradycardia, hypotension and conduction-block risk.',
            'Confirm intentional use and assess pulse, blood pressure, dizziness or syncope relevance.');
        }

        if ((nameHas(a, ['methotrexate']) && nameHas(b, ['co-trimoxazole'])) ||
            (nameHas(b, ['methotrexate']) && nameHas(a, ['co-trimoxazole']))) {
          add('methotrexate-cotrimoxazole', 'serious', 'Methotrexate + co-trimoxazole', [a, b],
            'This combination can cause severe bone-marrow suppression and methotrexate toxicity.',
            'Verify urgently with the prescriber or pharmacist.');
        }
        if ((nameHas(a, ['simvastatin']) && nameHas(b, ['clarithromycin', 'erythromycin'])) ||
            (nameHas(b, ['simvastatin']) && nameHas(a, ['clarithromycin', 'erythromycin']))) {
          add('simvastatin-macrolide', 'serious', 'Simvastatin + macrolide antibiotic', [a, b],
            'This combination can markedly increase simvastatin exposure and myopathy/rhabdomyolysis risk.',
            'Verify urgently against current product information or with the pharmacist/prescriber.');
        }
        if ((nameHas(a, ['warfarin']) && nameHas(b, ['co-trimoxazole', 'metronidazole', 'fluconazole'])) ||
            (nameHas(b, ['warfarin']) && nameHas(a, ['co-trimoxazole', 'metronidazole', 'fluconazole']))) {
          add('warfarin-antimicrobial', 'serious', 'Warfarin + interacting antimicrobial', [a, b],
            'The antimicrobial may increase warfarin effect and bleeding risk.',
            'Confirm the plan for INR monitoring and dose review with the prescriber or pharmacist.');
        }
      }
    }

    const raas = meds.filter(med => isAce(med) || isArb(med) || isArni(med));
    const diuretics = meds.filter(isDiuretic);
    const nsaids = meds.filter(isNsaid);
    if (raas.length && diuretics.length && nsaids.length) {
      add('triple-whammy', 'serious', 'Renal-risk combination: RAAS medicine + diuretic + NSAID',
        [raas[0], diuretics[0], nsaids[0]],
        'This combination can reduce renal perfusion and increase acute kidney-injury risk, especially with dehydration or pre-existing renal disease.',
        'Verify the combination and renal-risk context with the prescriber or pharmacist.');
    }

    const sedatives = meds.filter(isSedating);
    if (sedatives.length >= 2) {
      add('sedative-burden', 'caution', 'Combined sedative and fall-risk burden', sedatives,
        'Two or more recorded medicines may contribute to drowsiness, impaired coordination, dizziness or falls.',
        'Assess current symptoms, timing and functional relevance; confirm uncertain medicines with the patient or pharmacist.');
    }

    const order = { serious: 0, review: 1, caution: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));
    return alerts;
  }

  window.CHIROCLINIC_INTERACTION_CHECKER_VERSION = VERSION;
  window.CHIROCLINIC_CHECK_INTERACTIONS = checkInteractions;
})();

