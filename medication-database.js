/*
 * ChiroClinic medication recording database
 * Version: 2026.08.25
 *
 * Purpose: fast, structured recording of medicines reported by patients.
 * This is not a prescribing formulary or dose guide. ChiroClinic's separate
 * offline checker supplies limited high-priority prompts; neither component is
 * a substitute for current product information or prescriber/pharmacist review.
 * Generic names are prioritised; selected common South African brand/search
 * aliases are included solely to improve intake matching.
 *
 * Reference basis: South African National Department of Health consolidated
 * Essential Medicines List (31 July 2025) and current STG/EML repository,
 * supplemented with commonly encountered private-sector medicines.
 */
(function () {
  'use strict';

  const FLAG_LABELS = {
    anticoagulant: 'Anticoagulant — bleeding/bruising relevance',
    antiplatelet: 'Antiplatelet — bleeding/bruising relevance',
    opioid: 'Opioid — sedation/fall-risk potential',
    sedating: 'May be sedating — balance/fall-risk relevance',
    bp: 'Blood-pressure medicine — dizziness/orthostasis relevance',
    glucose: 'Glucose-lowering medicine',
    steroid: 'Systemic corticosteroid — bone/tissue relevance',
    bone: 'Bone-health/osteoporosis medicine',
    immunosuppressant: 'Immunosuppressive therapy',
    chemotherapy: 'Antineoplastic/chemotherapy treatment',
    arv: 'Antiretroviral therapy',
    tb: 'Tuberculosis treatment',
    seizure: 'Antiseizure medicine',
    parkinson: 'Parkinsonism medicine'
  };

  const GROUPS = [
    {
      category: 'Pain / Analgesics',
      items: [
        ['Paracetamol', 'Non-opioid analgesic', ['Panado', 'Calpol'], []],
        ['Codeine', 'Opioid analgesic', [], ['opioid', 'sedating']],
        ['Tramadol', 'Opioid analgesic', ['Tramal'], ['opioid', 'sedating']],
        ['Morphine', 'Opioid analgesic', [], ['opioid', 'sedating']],
        ['Oxycodone', 'Opioid analgesic', ['OxyContin'], ['opioid', 'sedating']],
        ['Fentanyl', 'Opioid analgesic', ['Durogesic'], ['opioid', 'sedating']],
        ['Buprenorphine', 'Partial opioid agonist', ['Temgesic', 'Transtec'], ['opioid', 'sedating']],
        ['Methadone', 'Opioid analgesic / agonist therapy', [], ['opioid', 'sedating']],
        ['Tapentadol', 'Opioid analgesic', ['Palexia'], ['opioid', 'sedating']],
        ['Pethidine', 'Opioid analgesic', [], ['opioid', 'sedating']],
        ['Naloxone', 'Opioid antagonist', ['Narcan'], []],
        ['Paracetamol + codeine', 'Combination analgesic', [], ['opioid', 'sedating']],
        ['Tramadol + paracetamol', 'Combination analgesic', ['Tramacet'], ['opioid', 'sedating']],
        ['Ibuprofen + paracetamol', 'Combination analgesic', [], []],
        ['Ibuprofen + paracetamol + codeine', 'Combination analgesic', ['Myprodol'], ['opioid', 'sedating']]
      ]
    },
    {
      category: 'Anti-inflammatory / NSAIDs',
      items: [
        ['Aspirin', 'Salicylate / NSAID', ['Disprin'], ['antiplatelet']],
        ['Ibuprofen', 'NSAID', ['Brufen', 'Nurofen'], []],
        ['Diclofenac', 'NSAID', ['Voltaren', 'Cataflam'], []],
        ['Naproxen', 'NSAID', ['Naprosyn'], []],
        ['Celecoxib', 'COX-2 selective NSAID', ['Celebrex'], []],
        ['Etoricoxib', 'COX-2 selective NSAID', ['Arcoxia'], []],
        ['Meloxicam', 'NSAID', ['Mobic'], []],
        ['Piroxicam', 'NSAID', ['Feldene'], []],
        ['Indomethacin', 'NSAID', ['Indocid'], []],
        ['Ketorolac', 'NSAID', [], []],
        ['Ketoprofen', 'NSAID', [], []],
        ['Mefenamic acid', 'NSAID', ['Ponstan'], []],
        ['Lornoxicam', 'NSAID', ['Xefo'], []],
        ['Sulindac', 'NSAID', [], []]
      ]
    },
    {
      category: 'Muscle Relaxants / Spasticity',
      items: [
        ['Baclofen', 'Antispasticity medicine', ['Lioresal'], ['sedating']],
        ['Tizanidine', 'Centrally acting muscle relaxant', ['Sirdalud'], ['sedating', 'bp']],
        ['Orphenadrine', 'Muscle relaxant', ['Norflex'], ['sedating']],
        ['Methocarbamol', 'Muscle relaxant', ['Robaxin'], ['sedating']],
        ['Cyclobenzaprine', 'Muscle relaxant', [], ['sedating']],
        ['Dantrolene', 'Direct-acting muscle relaxant', ['Dantrium'], ['sedating']],
        ['Botulinum toxin type A', 'Neuromuscular blocker', ['Botox', 'Dysport'], []],
        ['Diazepam', 'Benzodiazepine / muscle relaxant', ['Valium'], ['sedating']]
      ]
    },
    {
      category: 'Neuropathic Pain / Migraine',
      items: [
        ['Pregabalin', 'Gabapentinoid', ['Lyrica'], ['sedating']],
        ['Gabapentin', 'Gabapentinoid', ['Neurontin'], ['sedating']],
        ['Amitriptyline', 'Tricyclic antidepressant / neuropathic pain', ['Trepiline'], ['sedating']],
        ['Nortriptyline', 'Tricyclic antidepressant / neuropathic pain', [], ['sedating']],
        ['Duloxetine', 'SNRI / neuropathic pain', ['Cymbalta'], ['sedating']],
        ['Carbamazepine', 'Antiseizure / neuralgia medicine', ['Tegretol'], ['seizure', 'sedating']],
        ['Oxcarbazepine', 'Antiseizure / neuralgia medicine', ['Trileptal'], ['seizure', 'sedating']],
        ['Topiramate', 'Antiseizure / migraine prevention', ['Topamax'], ['seizure', 'sedating']],
        ['Sodium valproate', 'Antiseizure / migraine prevention', ['Epilim'], ['seizure', 'sedating']],
        ['Sumatriptan', 'Triptan', ['Imigran'], []],
        ['Rizatriptan', 'Triptan', ['Maxalt'], []],
        ['Zolmitriptan', 'Triptan', ['Zomig'], []],
        ['Eletriptan', 'Triptan', ['Relpax'], []],
        ['Ergotamine + caffeine', 'Ergot antimigraine combination', ['Cafergot'], []],
        ['Flunarizine', 'Migraine prevention / calcium-channel blocker', ['Sibelium'], ['sedating']],
        ['Propranolol', 'Beta blocker / migraine prevention', ['Inderal'], ['bp']],
        ['OnabotulinumtoxinA', 'Migraine prevention / neuromuscular blocker', ['Botox'], []]
      ]
    },
    {
      category: 'Anticoagulants / Antiplatelets',
      items: [
        ['Warfarin', 'Vitamin K antagonist', ['Coumadin'], ['anticoagulant']],
        ['Unfractionated heparin', 'Heparin anticoagulant', ['Heparin'], ['anticoagulant']],
        ['Enoxaparin', 'Low-molecular-weight heparin', ['Clexane'], ['anticoagulant']],
        ['Dalteparin', 'Low-molecular-weight heparin', ['Fragmin'], ['anticoagulant']],
        ['Rivaroxaban', 'Direct factor Xa inhibitor', ['Xarelto'], ['anticoagulant']],
        ['Apixaban', 'Direct factor Xa inhibitor', ['Eliquis'], ['anticoagulant']],
        ['Edoxaban', 'Direct factor Xa inhibitor', ['Lixiana'], ['anticoagulant']],
        ['Dabigatran', 'Direct thrombin inhibitor', ['Pradaxa'], ['anticoagulant']],
        ['Clopidogrel', 'P2Y12 antiplatelet', ['Plavix'], ['antiplatelet']],
        ['Prasugrel', 'P2Y12 antiplatelet', ['Efient'], ['antiplatelet']],
        ['Ticagrelor', 'P2Y12 antiplatelet', ['Brilinta'], ['antiplatelet']],
        ['Dipyridamole', 'Antiplatelet / vasodilator', ['Persantin'], ['antiplatelet']],
        ['Aspirin low dose', 'Antiplatelet', ['Ecotrin'], ['antiplatelet']],
        ['Fondaparinux', 'Factor Xa inhibitor', ['Arixtra'], ['anticoagulant']]
      ]
    },
    {
      category: 'Heart / Blood Pressure',
      items: [
        ['Amlodipine', 'Calcium-channel blocker', ['Norvasc'], ['bp']],
        ['Nifedipine', 'Calcium-channel blocker', ['Adalat'], ['bp']],
        ['Felodipine', 'Calcium-channel blocker', ['Plendil'], ['bp']],
        ['Verapamil', 'Calcium-channel blocker', ['Isoptin'], ['bp']],
        ['Diltiazem', 'Calcium-channel blocker', ['Cardizem'], ['bp']],
        ['Enalapril', 'ACE inhibitor', ['Pharmapress'], ['bp']],
        ['Lisinopril', 'ACE inhibitor', ['Zestril'], ['bp']],
        ['Perindopril', 'ACE inhibitor', ['Coversyl', 'Prexum'], ['bp']],
        ['Ramipril', 'ACE inhibitor', ['Tritace'], ['bp']],
        ['Captopril', 'ACE inhibitor', ['Capoten'], ['bp']],
        ['Losartan', 'Angiotensin receptor blocker', ['Cozaar'], ['bp']],
        ['Valsartan', 'Angiotensin receptor blocker', ['Diovan'], ['bp']],
        ['Telmisartan', 'Angiotensin receptor blocker', ['Micardis'], ['bp']],
        ['Candesartan', 'Angiotensin receptor blocker', ['Atacand'], ['bp']],
        ['Irbesartan', 'Angiotensin receptor blocker', ['Aprovel'], ['bp']],
        ['Atenolol', 'Beta blocker', ['Tenormin'], ['bp']],
        ['Bisoprolol', 'Beta blocker', ['Cardicor'], ['bp']],
        ['Carvedilol', 'Alpha/beta blocker', ['Dilatrend'], ['bp']],
        ['Metoprolol', 'Beta blocker', ['Betaloc'], ['bp']],
        ['Nebivolol', 'Beta blocker', ['Nebilet'], ['bp']],
        ['Labetalol', 'Alpha/beta blocker', ['Trandate'], ['bp']],
        ['Hydrochlorothiazide', 'Thiazide diuretic', ['Ridaq'], ['bp']],
        ['Indapamide', 'Thiazide-like diuretic', ['Natrilix'], ['bp']],
        ['Furosemide', 'Loop diuretic', ['Lasix'], ['bp']],
        ['Bumetanide', 'Loop diuretic', ['Burinex'], ['bp']],
        ['Spironolactone', 'Mineralocorticoid receptor antagonist', ['Aldactone'], ['bp']],
        ['Eplerenone', 'Mineralocorticoid receptor antagonist', ['Inspra'], ['bp']],
        ['Methyldopa', 'Centrally acting antihypertensive', ['Aldomet'], ['bp', 'sedating']],
        ['Clonidine', 'Centrally acting antihypertensive', ['Catapres'], ['bp', 'sedating']],
        ['Doxazosin', 'Alpha-1 blocker', ['Cardura'], ['bp']],
        ['Hydralazine', 'Direct vasodilator', ['Apresoline'], ['bp']],
        ['Sacubitril + valsartan', 'ARNI', ['Entresto'], ['bp']],
        ['Digoxin', 'Cardiac glycoside', ['Lanoxin'], []],
        ['Amiodarone', 'Antiarrhythmic', ['Cordarone'], []],
        ['Sotalol', 'Antiarrhythmic / beta blocker', ['Sotacor'], ['bp']],
        ['Flecainide', 'Antiarrhythmic', ['Tambocor'], []],
        ['Isosorbide dinitrate', 'Nitrate antianginal', ['Isordil'], ['bp']],
        ['Isosorbide mononitrate', 'Nitrate antianginal', ['Imdur'], ['bp']],
        ['Glyceryl trinitrate', 'Nitrate antianginal', ['Nitrolingual', 'GTN'], ['bp']],
        ['Ivabradine', 'Heart-rate lowering agent', ['Procoralan'], ['bp']],
        ['Dapagliflozin (heart failure)', 'SGLT2 inhibitor', ['Forxiga'], ['glucose', 'bp']],
        ['Empagliflozin (heart failure)', 'SGLT2 inhibitor', ['Jardiance'], ['glucose', 'bp']]
      ]
    },
    {
      category: 'Cholesterol / Lipids',
      items: [
        ['Atorvastatin', 'Statin', ['Lipitor'], []],
        ['Rosuvastatin', 'Statin', ['Crestor'], []],
        ['Simvastatin', 'Statin', ['Zocor'], []],
        ['Pravastatin', 'Statin', ['Pravachol'], []],
        ['Fluvastatin', 'Statin', ['Lescol'], []],
        ['Ezetimibe', 'Cholesterol absorption inhibitor', ['Ezetrol'], []],
        ['Fenofibrate', 'Fibrate', ['Lipanthyl'], []],
        ['Bezafibrate', 'Fibrate', ['Bezalip'], []],
        ['Evolocumab', 'PCSK9 inhibitor', ['Repatha'], []],
        ['Alirocumab', 'PCSK9 inhibitor', ['Praluent'], []]
      ]
    },
    {
      category: 'Diabetes',
      items: [
        ['Metformin', 'Biguanide', ['Glucophage'], ['glucose']],
        ['Gliclazide', 'Sulfonylurea', ['Diamicron'], ['glucose']],
        ['Glimepiride', 'Sulfonylurea', ['Amaryl'], ['glucose']],
        ['Glipizide', 'Sulfonylurea', ['Minidiab'], ['glucose']],
        ['Glibenclamide', 'Sulfonylurea', ['Daonil'], ['glucose']],
        ['Pioglitazone', 'Thiazolidinedione', ['Actos'], ['glucose']],
        ['Acarbose', 'Alpha-glucosidase inhibitor', ['Glucobay'], ['glucose']],
        ['Sitagliptin', 'DPP-4 inhibitor', ['Januvia'], ['glucose']],
        ['Vildagliptin', 'DPP-4 inhibitor', ['Galvus'], ['glucose']],
        ['Saxagliptin', 'DPP-4 inhibitor', ['Onglyza'], ['glucose']],
        ['Linagliptin', 'DPP-4 inhibitor', ['Trajenta'], ['glucose']],
        ['Empagliflozin', 'SGLT2 inhibitor', ['Jardiance'], ['glucose']],
        ['Dapagliflozin', 'SGLT2 inhibitor', ['Forxiga'], ['glucose']],
        ['Canagliflozin', 'SGLT2 inhibitor', ['Invokana'], ['glucose']],
        ['Semaglutide injection', 'GLP-1 receptor agonist', ['Ozempic'], ['glucose']],
        ['Semaglutide oral', 'GLP-1 receptor agonist', ['Rybelsus'], ['glucose']],
        ['Liraglutide', 'GLP-1 receptor agonist', ['Victoza', 'Saxenda'], ['glucose']],
        ['Dulaglutide', 'GLP-1 receptor agonist', ['Trulicity'], ['glucose']],
        ['Exenatide', 'GLP-1 receptor agonist', ['Byetta', 'Bydureon'], ['glucose']],
        ['Tirzepatide', 'GIP/GLP-1 receptor agonist', ['Mounjaro'], ['glucose']],
        ['Insulin soluble / regular', 'Short-acting insulin', ['Actrapid', 'Humulin R'], ['glucose']],
        ['Insulin aspart', 'Rapid-acting insulin', ['NovoRapid'], ['glucose']],
        ['Insulin lispro', 'Rapid-acting insulin', ['Humalog'], ['glucose']],
        ['Insulin glulisine', 'Rapid-acting insulin', ['Apidra'], ['glucose']],
        ['Insulin isophane / NPH', 'Intermediate-acting insulin', ['Protaphane', 'Humulin N'], ['glucose']],
        ['Insulin glargine', 'Long-acting insulin', ['Lantus', 'Toujeo'], ['glucose']],
        ['Insulin detemir', 'Long-acting insulin', ['Levemir'], ['glucose']],
        ['Insulin degludec', 'Ultra-long-acting insulin', ['Tresiba'], ['glucose']],
        ['Glucagon', 'Antihypoglycaemic hormone', ['GlucaGen'], []]
      ]
    },
    {
      category: 'Thyroid / Endocrine',
      items: [
        ['Levothyroxine', 'Thyroid hormone', ['Eltroxin', 'Euthyrox'], []],
        ['Liothyronine', 'Thyroid hormone', ['Tertroxin'], []],
        ['Carbimazole', 'Antithyroid medicine', ['Neo-Mercazole'], []],
        ['Propylthiouracil', 'Antithyroid medicine', ['PTU'], []],
        ['Hydrocortisone', 'Corticosteroid replacement / anti-inflammatory', [], ['steroid']],
        ['Fludrocortisone', 'Mineralocorticoid', ['Florinef'], ['steroid', 'bp']],
        ['Desmopressin', 'Vasopressin analogue', ['Minirin'], []],
        ['Octreotide', 'Somatostatin analogue', ['Sandostatin'], []],
        ['Cabergoline', 'Dopamine agonist', ['Dostinex'], ['bp']],
        ['Bromocriptine', 'Dopamine agonist', ['Parlodel'], ['bp']],
        ['Testosterone', 'Androgen replacement', ['Nebido', 'AndroGel'], []],
        ['Somatropin', 'Growth hormone', ['Genotropin', 'Norditropin'], []]
      ]
    },
    {
      category: 'Corticosteroids',
      items: [
        ['Prednisone', 'Systemic corticosteroid', [], ['steroid']],
        ['Prednisolone', 'Systemic corticosteroid', ['Prelone'], ['steroid']],
        ['Methylprednisolone', 'Systemic corticosteroid', ['Solu-Medrol', 'Depo-Medrol'], ['steroid']],
        ['Dexamethasone', 'Systemic corticosteroid', ['Decadron'], ['steroid']],
        ['Betamethasone systemic', 'Systemic corticosteroid', ['Celestone'], ['steroid']],
        ['Triamcinolone injection', 'Corticosteroid injection', ['Kenalog'], ['steroid']]
      ]
    },
    {
      category: 'Bone Health / Osteoporosis',
      items: [
        ['Alendronate', 'Bisphosphonate', ['Fosamax'], ['bone']],
        ['Risedronate', 'Bisphosphonate', ['Actonel'], ['bone']],
        ['Ibandronate', 'Bisphosphonate', ['Bonviva'], ['bone']],
        ['Zoledronic acid', 'Bisphosphonate infusion', ['Aclasta', 'Zometa'], ['bone']],
        ['Pamidronate', 'Bisphosphonate infusion', ['Aredia'], ['bone']],
        ['Denosumab', 'RANKL inhibitor', ['Prolia', 'Xgeva'], ['bone']],
        ['Teriparatide', 'Parathyroid hormone analogue', ['Forteo'], ['bone']],
        ['Raloxifene', 'Selective oestrogen receptor modulator', ['Evista'], ['bone']],
        ['Calcitonin', 'Bone resorption inhibitor', ['Miacalcic'], ['bone']],
        ['Calcium carbonate', 'Calcium supplement', [], ['bone']],
        ['Calcium citrate', 'Calcium supplement', [], ['bone']],
        ['Cholecalciferol / Vitamin D3', 'Vitamin D supplement', [], ['bone']],
        ['Calcitriol', 'Active vitamin D analogue', ['Rocaltrol'], ['bone']]
      ]
    },
    {
      category: 'Mental Health / Sleep / ADHD',
      items: [
        ['Fluoxetine', 'SSRI antidepressant', ['Prozac'], []],
        ['Sertraline', 'SSRI antidepressant', ['Zoloft'], []],
        ['Citalopram', 'SSRI antidepressant', ['Cipramil'], []],
        ['Escitalopram', 'SSRI antidepressant', ['Cipralex', 'Lexamil'], []],
        ['Paroxetine', 'SSRI antidepressant', ['Aropax'], ['sedating']],
        ['Fluvoxamine', 'SSRI antidepressant', ['Faverin'], ['sedating']],
        ['Venlafaxine', 'SNRI antidepressant', ['Efexor'], []],
        ['Desvenlafaxine', 'SNRI antidepressant', ['Pristiq'], []],
        ['Bupropion', 'NDRI antidepressant', ['Wellbutrin', 'Zyban'], []],
        ['Mirtazapine', 'NaSSA antidepressant', ['Remeron'], ['sedating']],
        ['Trazodone', 'Serotonergic antidepressant', ['Trittico'], ['sedating']],
        ['Clomipramine', 'Tricyclic antidepressant', ['Anafranil'], ['sedating']],
        ['Imipramine', 'Tricyclic antidepressant', ['Tofranil'], ['sedating']],
        ['Lithium carbonate', 'Mood stabiliser', ['Priadel'], []],
        ['Quetiapine', 'Atypical antipsychotic', ['Seroquel'], ['sedating']],
        ['Olanzapine', 'Atypical antipsychotic', ['Zyprexa'], ['sedating']],
        ['Risperidone', 'Atypical antipsychotic', ['Risperdal'], ['sedating']],
        ['Aripiprazole', 'Atypical antipsychotic', ['Abilify'], []],
        ['Clozapine', 'Atypical antipsychotic', ['Clozaril'], ['sedating']],
        ['Haloperidol', 'Typical antipsychotic', ['Serenace'], ['sedating']],
        ['Chlorpromazine', 'Typical antipsychotic', ['Largactil'], ['sedating', 'bp']],
        ['Alprazolam', 'Benzodiazepine', ['Xanax'], ['sedating']],
        ['Lorazepam', 'Benzodiazepine', ['Ativan'], ['sedating']],
        ['Clonazepam', 'Benzodiazepine', ['Rivotril'], ['seizure', 'sedating']],
        ['Clobazam', 'Benzodiazepine', ['Urbanol'], ['seizure', 'sedating']],
        ['Oxazepam', 'Benzodiazepine', ['Serepax'], ['sedating']],
        ['Zolpidem', 'Hypnotic', ['Stilnox'], ['sedating']],
        ['Zopiclone', 'Hypnotic', ['Imovane'], ['sedating']],
        ['Melatonin', 'Sleep aid', [], ['sedating']],
        ['Methylphenidate', 'CNS stimulant', ['Ritalin', 'Concerta'], []],
        ['Atomoxetine', 'ADHD medicine', ['Strattera'], []],
        ['Lisdexamfetamine', 'CNS stimulant', ['Vyvanse'], []]
      ]
    },
    {
      category: 'Neurology / Seizures / Parkinsonism',
      items: [
        ['Lamotrigine', 'Antiseizure medicine', ['Epitec', 'Lamictin'], ['seizure', 'sedating']],
        ['Levetiracetam', 'Antiseizure medicine', ['Keppra'], ['seizure', 'sedating']],
        ['Phenytoin', 'Antiseizure medicine', ['Epanutin'], ['seizure', 'sedating']],
        ['Phenobarbital', 'Barbiturate antiseizure medicine', [], ['seizure', 'sedating']],
        ['Ethosuximide', 'Antiseizure medicine', ['Zarontin'], ['seizure', 'sedating']],
        ['Lacosamide', 'Antiseizure medicine', ['Vimpat'], ['seizure', 'sedating']],
        ['Clonazepam (seizures)', 'Benzodiazepine antiseizure medicine', ['Rivotril'], ['seizure', 'sedating']],
        ['Levodopa + carbidopa', 'Dopaminergic antiparkinson medicine', ['Sinemet'], ['parkinson', 'bp']],
        ['Levodopa + benserazide', 'Dopaminergic antiparkinson medicine', ['Madopar'], ['parkinson', 'bp']],
        ['Pramipexole', 'Dopamine agonist', ['Sifrol'], ['parkinson', 'sedating', 'bp']],
        ['Ropinirole', 'Dopamine agonist', ['Requip'], ['parkinson', 'sedating', 'bp']],
        ['Rotigotine', 'Dopamine agonist patch', ['Neupro'], ['parkinson', 'sedating', 'bp']],
        ['Selegiline', 'MAO-B inhibitor', ['Eldepryl'], ['parkinson']],
        ['Rasagiline', 'MAO-B inhibitor', ['Azilect'], ['parkinson']],
        ['Entacapone', 'COMT inhibitor', ['Comtan'], ['parkinson']],
        ['Amantadine', 'Antiparkinson / antiviral medicine', ['Symmetrel'], ['parkinson', 'sedating']],
        ['Donepezil', 'Acetylcholinesterase inhibitor', ['Aricept'], []],
        ['Rivastigmine', 'Acetylcholinesterase inhibitor', ['Exelon'], []],
        ['Galantamine', 'Acetylcholinesterase inhibitor', ['Reminyl'], []],
        ['Memantine', 'NMDA antagonist', ['Ebixa'], ['sedating']],
        ['Riluzole', 'ALS medicine', ['Rilutek'], []],
        ['Acetazolamide', 'Carbonic anhydrase inhibitor', ['Diamox'], ['bp']]
      ]
    },
    {
      category: 'Vertigo / Nausea',
      items: [
        ['Betahistine', 'Histamine analogue / antivertigo medicine', ['Serc'], []],
        ['Cinnarizine', 'Antihistamine / antivertigo medicine', ['Stugeron'], ['sedating']],
        ['Prochlorperazine', 'Antiemetic / phenothiazine', ['Stemetil'], ['sedating', 'bp']],
        ['Promethazine', 'Sedating antihistamine / antiemetic', ['Phenergan'], ['sedating']],
        ['Cyclizine', 'Antihistamine / antiemetic', ['Valoid'], ['sedating']],
        ['Ondansetron', '5-HT3 antagonist antiemetic', ['Zofran'], []],
        ['Metoclopramide', 'Prokinetic antiemetic', ['Maxolon'], ['sedating']],
        ['Domperidone', 'Prokinetic antiemetic', ['Motilium'], []]
      ]
    },
    {
      category: 'Respiratory / Allergy',
      items: [
        ['Salbutamol', 'Short-acting beta2 agonist', ['Ventolin'], []],
        ['Terbutaline', 'Short-acting beta2 agonist', ['Bricanyl'], []],
        ['Formoterol', 'Long-acting beta2 agonist', ['Foradil'], []],
        ['Salmeterol', 'Long-acting beta2 agonist', ['Serevent'], []],
        ['Budesonide inhaled', 'Inhaled corticosteroid', ['Pulmicort'], []],
        ['Beclometasone inhaled', 'Inhaled corticosteroid', ['Becotide'], []],
        ['Fluticasone inhaled', 'Inhaled corticosteroid', ['Flixotide'], []],
        ['Budesonide + formoterol', 'ICS/LABA inhaler', ['Symbicort'], []],
        ['Fluticasone + salmeterol', 'ICS/LABA inhaler', ['Seretide'], []],
        ['Fluticasone + vilanterol', 'ICS/LABA inhaler', ['Relvar Ellipta'], []],
        ['Ipratropium', 'Short-acting muscarinic antagonist', ['Atrovent'], []],
        ['Tiotropium', 'Long-acting muscarinic antagonist', ['Spiriva'], []],
        ['Umeclidinium', 'Long-acting muscarinic antagonist', ['Incruse Ellipta'], []],
        ['Ipratropium + fenoterol', 'SAMA/SABA inhaler', ['Berodual'], []],
        ['Montelukast', 'Leukotriene receptor antagonist', ['Singulair'], []],
        ['Theophylline', 'Methylxanthine bronchodilator', ['Nuelin'], []],
        ['Cetirizine', 'Antihistamine', ['Zyrtec'], ['sedating']],
        ['Levocetirizine', 'Antihistamine', ['Xyzal'], ['sedating']],
        ['Loratadine', 'Antihistamine', ['Clarityne'], []],
        ['Desloratadine', 'Antihistamine', ['Aerius'], []],
        ['Fexofenadine', 'Antihistamine', ['Telfast'], []],
        ['Chlorphenamine', 'Sedating antihistamine', ['Allergex'], ['sedating']],
        ['Hydroxyzine', 'Sedating antihistamine', ['Aterax'], ['sedating']],
        ['Fluticasone nasal', 'Intranasal corticosteroid', ['Avamys', 'Flixonase'], []],
        ['Mometasone nasal', 'Intranasal corticosteroid', ['Nasonex'], []],
        ['Adrenaline auto-injector', 'Emergency anaphylaxis medicine', ['EpiPen'], []]
      ]
    },
    {
      category: 'Gastrointestinal',
      items: [
        ['Omeprazole', 'Proton-pump inhibitor', ['Losec'], []],
        ['Esomeprazole', 'Proton-pump inhibitor', ['Nexiam'], []],
        ['Pantoprazole', 'Proton-pump inhibitor', ['Controloc'], []],
        ['Lansoprazole', 'Proton-pump inhibitor', ['Lanzor'], []],
        ['Rabeprazole', 'Proton-pump inhibitor', ['Pariet'], []],
        ['Famotidine', 'H2 receptor antagonist', ['Pepcid'], []],
        ['Cimetidine', 'H2 receptor antagonist', ['Tagamet'], []],
        ['Aluminium hydroxide + magnesium hydroxide', 'Antacid', ['Maalox'], []],
        ['Sodium alginate combination', 'Reflux suppressant / antacid', ['Gaviscon'], []],
        ['Sucralfate', 'Mucosal protectant', ['Antepsin'], []],
        ['Hyoscine butylbromide', 'Antispasmodic', ['Buscopan'], []],
        ['Loperamide', 'Antidiarrhoeal', ['Imodium'], []],
        ['Macrogol / polyethylene glycol', 'Osmotic laxative', ['Movicol'], []],
        ['Lactulose', 'Osmotic laxative', ['Duphalac'], []],
        ['Bisacodyl', 'Stimulant laxative', ['Dulcolax'], []],
        ['Senna', 'Stimulant laxative', ['Senokot'], []],
        ['Mesalazine', 'Aminosalicylate', ['Asacol', 'Pentasa'], []],
        ['Sulfasalazine (IBD)', 'Aminosalicylate / DMARD', ['Salazopyrin'], ['immunosuppressant']],
        ['Budesonide oral', 'Locally acting corticosteroid', ['Entocort'], ['steroid']],
        ['Azathioprine (IBD)', 'Immunosuppressant', ['Imuran'], ['immunosuppressant']],
        ['Pancreatin', 'Pancreatic enzyme replacement', ['Creon'], []],
        ['Ursodeoxycholic acid', 'Bile acid', ['Ursofalk'], []],
        ['Oral rehydration salts', 'Electrolyte replacement', ['ORS'], []]
      ]
    },
    {
      category: 'Antibiotics / Anti-infectives',
      items: [
        ['Amoxicillin', 'Penicillin antibiotic', ['Amoxil'], []],
        ['Amoxicillin + clavulanic acid', 'Penicillin/beta-lactamase inhibitor', ['Augmentin'], []],
        ['Phenoxymethylpenicillin', 'Penicillin antibiotic', ['Penicillin V'], []],
        ['Flucloxacillin', 'Penicillin antibiotic', ['Floxapen'], []],
        ['Benzathine benzylpenicillin', 'Depot penicillin antibiotic', ['Bicillin'], []],
        ['Cefalexin', 'First-generation cephalosporin', ['Keflex'], []],
        ['Cefuroxime', 'Second-generation cephalosporin', ['Zinnat'], []],
        ['Ceftriaxone', 'Third-generation cephalosporin', ['Rocephin'], []],
        ['Azithromycin', 'Macrolide antibiotic', ['Zithromax'], []],
        ['Clarithromycin', 'Macrolide antibiotic', ['Klacid'], []],
        ['Erythromycin', 'Macrolide antibiotic', ['Erythrocin'], []],
        ['Doxycycline', 'Tetracycline antibiotic', ['Vibramycin'], []],
        ['Tetracycline', 'Tetracycline antibiotic', [], []],
        ['Ciprofloxacin', 'Fluoroquinolone antibiotic', ['Cipro'], []],
        ['Levofloxacin', 'Fluoroquinolone antibiotic', ['Tavanic'], []],
        ['Moxifloxacin', 'Fluoroquinolone antibiotic', ['Avelox'], []],
        ['Metronidazole', 'Nitroimidazole antibiotic/antiprotozoal', ['Flagyl'], []],
        ['Clindamycin', 'Lincosamide antibiotic', ['Dalacin C'], []],
        ['Co-trimoxazole', 'Sulfonamide/trimethoprim antibiotic', ['Bactrim', 'Septrin'], []],
        ['Nitrofurantoin', 'Urinary antibacterial', ['Macrodantin'], []],
        ['Fosfomycin', 'Urinary antibacterial', ['Monuril'], []],
        ['Fluconazole', 'Azole antifungal', ['Diflucan'], []],
        ['Itraconazole', 'Azole antifungal', ['Sporanox'], []],
        ['Terbinafine oral', 'Allylamine antifungal', ['Lamisil'], []],
        ['Aciclovir', 'Antiviral', ['Zovirax'], []],
        ['Valaciclovir', 'Antiviral', ['Valtrex'], []],
        ['Oseltamivir', 'Influenza antiviral', ['Tamiflu'], []],
        ['Albendazole', 'Anthelmintic', ['Zentel'], []],
        ['Praziquantel', 'Anthelmintic', ['Biltricide'], []]
      ]
    },
    {
      category: 'HIV / Antiretrovirals',
      items: [
        ['Tenofovir disoproxil + lamivudine + dolutegravir', 'Fixed-dose antiretroviral combination', ['TLD'], ['arv']],
        ['Tenofovir disoproxil + emtricitabine + efavirenz', 'Fixed-dose antiretroviral combination', ['Atripla'], ['arv']],
        ['Bictegravir + emtricitabine + tenofovir alafenamide', 'Fixed-dose antiretroviral combination', ['Biktarvy'], ['arv']],
        ['Abacavir + lamivudine', 'Fixed-dose NRTI combination', ['Kivexa'], ['arv']],
        ['Tenofovir disoproxil + emtricitabine', 'Fixed-dose NRTI combination / PrEP', ['Truvada'], ['arv']],
        ['Dolutegravir + lamivudine', 'Fixed-dose antiretroviral combination', ['Dovato'], ['arv']],
        ['Tenofovir disoproxil', 'NRTI', ['TDF', 'Viread'], ['arv']],
        ['Tenofovir alafenamide', 'NRTI', ['TAF'], ['arv']],
        ['Lamivudine', 'NRTI', ['3TC', 'Epivir'], ['arv']],
        ['Emtricitabine', 'NRTI', ['FTC', 'Emtriva'], ['arv']],
        ['Abacavir', 'NRTI', ['ABC', 'Ziagen'], ['arv']],
        ['Zidovudine', 'NRTI', ['AZT', 'Retrovir'], ['arv']],
        ['Dolutegravir', 'Integrase inhibitor', ['DTG', 'Tivicay'], ['arv']],
        ['Efavirenz', 'NNRTI', ['EFV', 'Stocrin'], ['arv', 'sedating']],
        ['Nevirapine', 'NNRTI', ['NVP', 'Viramune'], ['arv']],
        ['Rilpivirine', 'NNRTI', ['Edurant'], ['arv']],
        ['Atazanavir + ritonavir', 'Boosted protease inhibitor regimen', ['ATV/r'], ['arv']],
        ['Lopinavir + ritonavir', 'Boosted protease inhibitor combination', ['Kaletra', 'LPV/r'], ['arv']],
        ['Darunavir + ritonavir', 'Boosted protease inhibitor regimen', ['DRV/r'], ['arv']],
        ['Cabotegravir', 'Long-acting integrase inhibitor / PrEP', ['Apretude', 'Vocabria'], ['arv']]
      ]
    },
    {
      category: 'Tuberculosis',
      items: [
        ['Rifampicin', 'Rifamycin antituberculosis medicine', ['RIF'], ['tb']],
        ['Isoniazid', 'Antituberculosis medicine', ['INH'], ['tb']],
        ['Pyrazinamide', 'Antituberculosis medicine', ['PZA'], ['tb']],
        ['Ethambutol', 'Antituberculosis medicine', ['EMB'], ['tb']],
        ['Rifampicin + isoniazid + pyrazinamide + ethambutol', 'Fixed-dose TB combination', ['Rifafour', 'RHZE'], ['tb']],
        ['Rifampicin + isoniazid', 'Fixed-dose TB combination', ['RH'], ['tb']],
        ['Rifapentine + isoniazid', 'TB preventive therapy combination', ['3HP'], ['tb']],
        ['Bedaquiline', 'Drug-resistant TB medicine', ['Sirturo'], ['tb']],
        ['Delamanid', 'Drug-resistant TB medicine', ['Deltyba'], ['tb']],
        ['Pretomanid', 'Drug-resistant TB medicine', ['Dovprela'], ['tb']],
        ['Clofazimine', 'Drug-resistant TB / antimycobacterial medicine', ['Lamprene'], ['tb']],
        ['Linezolid', 'Oxazolidinone antibiotic / DR-TB medicine', ['Zyvox'], ['tb']],
        ['Levofloxacin (TB)', 'Fluoroquinolone / DR-TB medicine', [], ['tb']],
        ['Moxifloxacin (TB)', 'Fluoroquinolone / DR-TB medicine', [], ['tb']],
        ['Cycloserine', 'Drug-resistant TB medicine', ['Seromycin'], ['tb']]
      ]
    },
    {
      category: 'Rheumatology / Immunosuppressants',
      items: [
        ['Methotrexate', 'Conventional DMARD', [], ['immunosuppressant']],
        ['Hydroxychloroquine', 'Antimalarial DMARD', ['Plaquenil'], ['immunosuppressant']],
        ['Sulfasalazine', 'Conventional DMARD', ['Salazopyrin'], ['immunosuppressant']],
        ['Leflunomide', 'Conventional DMARD', ['Arava'], ['immunosuppressant']],
        ['Azathioprine', 'Immunosuppressant', ['Imuran'], ['immunosuppressant']],
        ['Mycophenolate mofetil', 'Immunosuppressant', ['CellCept'], ['immunosuppressant']],
        ['Cyclosporine', 'Calcineurin inhibitor', ['Sandimmun', 'Neoral'], ['immunosuppressant']],
        ['Tacrolimus systemic', 'Calcineurin inhibitor', ['Prograf'], ['immunosuppressant']],
        ['Cyclophosphamide', 'Alkylating immunosuppressant', ['Endoxan'], ['immunosuppressant', 'chemotherapy']],
        ['Colchicine', 'Antigout / anti-inflammatory medicine', ['Colcrys'], []],
        ['Allopurinol', 'Urate-lowering medicine', ['Zyloprim'], []],
        ['Febuxostat', 'Urate-lowering medicine', ['Adenuric'], []],
        ['Adalimumab', 'TNF inhibitor biologic', ['Humira'], ['immunosuppressant']],
        ['Etanercept', 'TNF inhibitor biologic', ['Enbrel'], ['immunosuppressant']],
        ['Infliximab', 'TNF inhibitor biologic', ['Remicade'], ['immunosuppressant']],
        ['Golimumab', 'TNF inhibitor biologic', ['Simponi'], ['immunosuppressant']],
        ['Rituximab', 'Anti-CD20 biologic', ['MabThera'], ['immunosuppressant']],
        ['Tocilizumab', 'IL-6 receptor inhibitor', ['Actemra'], ['immunosuppressant']],
        ['Secukinumab', 'IL-17A inhibitor', ['Cosentyx'], ['immunosuppressant']],
        ['Ustekinumab', 'IL-12/23 inhibitor', ['Stelara'], ['immunosuppressant']],
        ['Tofacitinib', 'JAK inhibitor', ['Xeljanz'], ['immunosuppressant']],
        ['Baricitinib', 'JAK inhibitor', ['Olumiant'], ['immunosuppressant']],
        ['Upadacitinib', 'JAK inhibitor', ['Rinvoq'], ['immunosuppressant']],
        ['Abatacept', 'T-cell costimulation modulator', ['Orencia'], ['immunosuppressant']]
      ]
    },
    {
      category: 'Oncology / Hormonal Therapy',
      items: [
        ['Tamoxifen', 'Selective oestrogen receptor modulator', ['Nolvadex'], []],
        ['Anastrozole', 'Aromatase inhibitor', ['Arimidex'], []],
        ['Letrozole', 'Aromatase inhibitor', ['Femara'], []],
        ['Exemestane', 'Aromatase inhibitor', ['Aromasin'], []],
        ['Bicalutamide', 'Androgen receptor inhibitor', ['Casodex'], []],
        ['Leuprorelin', 'GnRH agonist', ['Lucrin'], []],
        ['Goserelin', 'GnRH agonist', ['Zoladex'], []],
        ['Capecitabine', 'Antimetabolite chemotherapy', ['Xeloda'], ['chemotherapy']],
        ['Fluorouracil systemic', 'Antimetabolite chemotherapy', ['5-FU'], ['chemotherapy']],
        ['Doxorubicin', 'Anthracycline chemotherapy', ['Adriamycin'], ['chemotherapy']],
        ['Paclitaxel', 'Taxane chemotherapy', ['Taxol'], ['chemotherapy']],
        ['Docetaxel', 'Taxane chemotherapy', ['Taxotere'], ['chemotherapy']],
        ['Cisplatin', 'Platinum chemotherapy', [], ['chemotherapy']],
        ['Carboplatin', 'Platinum chemotherapy', [], ['chemotherapy']],
        ['Trastuzumab', 'HER2-targeted therapy', ['Herceptin'], ['chemotherapy']],
        ['Imatinib', 'Tyrosine kinase inhibitor', ['Glivec'], ['chemotherapy']],
        ['Pembrolizumab', 'PD-1 inhibitor immunotherapy', ['Keytruda'], ['chemotherapy', 'immunosuppressant']],
        ['Nivolumab', 'PD-1 inhibitor immunotherapy', ['Opdivo'], ['chemotherapy', 'immunosuppressant']]
      ]
    },
    {
      category: 'Women’s Health / Contraception',
      items: [
        ['Ethinylestradiol + levonorgestrel', 'Combined oral contraceptive', [], []],
        ['Ethinylestradiol + drospirenone', 'Combined oral contraceptive', ['Yasmin', 'Yaz'], []],
        ['Ethinylestradiol + desogestrel', 'Combined oral contraceptive', ['Marvelon'], []],
        ['Ethinylestradiol + cyproterone acetate', 'Combined hormonal medicine', ['Diane-35'], []],
        ['Levonorgestrel emergency contraception', 'Emergency contraceptive', ['NorLevo'], []],
        ['Ulipristal acetate', 'Emergency contraceptive', ['ellaOne'], []],
        ['Medroxyprogesterone acetate depot', 'Injectable progestogen contraceptive', ['Depo-Provera'], []],
        ['Norethisterone enanthate', 'Injectable progestogen contraceptive', ['Nur-Isterate'], []],
        ['Etonogestrel implant', 'Progestogen implant', ['Implanon NXT'], []],
        ['Levonorgestrel intrauterine system', 'Hormonal intrauterine system', ['Mirena'], []],
        ['Norethisterone', 'Progestogen', ['Primolut N'], []],
        ['Micronised progesterone', 'Progestogen', ['Utrogestan'], ['sedating']],
        ['Conjugated oestrogens', 'Menopausal hormone therapy', ['Premarin'], []],
        ['Estradiol', 'Oestrogen replacement', ['Estrofem'], []],
        ['Estradiol + dydrogesterone', 'Combined menopausal hormone therapy', ['Femoston'], []],
        ['Tibolone', 'Menopausal hormone therapy', ['Livial'], []],
        ['Clomifene', 'Ovulation induction medicine', ['Clomid'], []],
        ['Letrozole (fertility)', 'Aromatase inhibitor / ovulation induction', ['Femara'], []]
      ]
    },
    {
      category: 'Urology / Men’s Health',
      items: [
        ['Tamsulosin', 'Alpha-1 blocker for BPH', ['Flomax'], ['bp']],
        ['Alfuzosin', 'Alpha-1 blocker for BPH', ['Xatral'], ['bp']],
        ['Finasteride', '5-alpha-reductase inhibitor', ['Proscar', 'Propecia'], []],
        ['Dutasteride', '5-alpha-reductase inhibitor', ['Avodart'], []],
        ['Solifenacin', 'Antimuscarinic for overactive bladder', ['Vesicare'], []],
        ['Oxybutynin', 'Antimuscarinic for overactive bladder', ['Ditropan'], ['sedating']],
        ['Tolterodine', 'Antimuscarinic for overactive bladder', ['Detrusitol'], []],
        ['Mirabegron', 'Beta3 agonist for overactive bladder', ['Betmiga'], ['bp']],
        ['Sildenafil', 'PDE5 inhibitor', ['Viagra'], ['bp']],
        ['Tadalafil', 'PDE5 inhibitor', ['Cialis'], ['bp']],
        ['Vardenafil', 'PDE5 inhibitor', ['Levitra'], ['bp']],
        ['Potassium citrate', 'Urinary alkaliniser', ['Urocit-K'], []]
      ]
    },
    {
      category: 'Dermatology',
      items: [
        ['Isotretinoin', 'Oral retinoid', ['Roaccutane', 'Oratane'], []],
        ['Acitretin', 'Oral retinoid', ['Neotigason'], []],
        ['Adapalene', 'Topical retinoid', ['Differin'], []],
        ['Adapalene + benzoyl peroxide', 'Topical acne combination', ['Epiduo'], []],
        ['Benzoyl peroxide', 'Topical acne medicine', ['Benzac'], []],
        ['Clindamycin topical', 'Topical antibiotic', ['Dalacin T'], []],
        ['Mupirocin', 'Topical antibiotic', ['Bactroban'], []],
        ['Fusidic acid', 'Topical antibiotic', ['Fucidin'], []],
        ['Clotrimazole topical', 'Topical antifungal', ['Canesten'], []],
        ['Miconazole topical', 'Topical antifungal', ['Daktarin'], []],
        ['Terbinafine topical', 'Topical antifungal', ['Lamisil'], []],
        ['Hydrocortisone topical', 'Topical corticosteroid', [], []],
        ['Betamethasone valerate topical', 'Topical corticosteroid', ['Betnovate'], []],
        ['Mometasone topical', 'Topical corticosteroid', ['Elocon'], []],
        ['Clobetasol propionate topical', 'Very potent topical corticosteroid', ['Dermovate'], []],
        ['Tacrolimus topical', 'Topical calcineurin inhibitor', ['Protopic'], ['immunosuppressant']],
        ['Calcipotriol', 'Topical vitamin D analogue', ['Dovonex'], []],
        ['Calcipotriol + betamethasone', 'Topical psoriasis combination', ['Daivobet'], []]
      ]
    },
    {
      category: 'Eye / Ear / Nose',
      items: [
        ['Latanoprost eye drops', 'Prostaglandin analogue for glaucoma', ['Xalatan'], []],
        ['Bimatoprost eye drops', 'Prostaglandin analogue for glaucoma', ['Lumigan'], []],
        ['Timolol eye drops', 'Beta blocker for glaucoma', ['Timoptol'], ['bp']],
        ['Dorzolamide eye drops', 'Carbonic anhydrase inhibitor', ['Trusopt'], []],
        ['Dorzolamide + timolol eye drops', 'Glaucoma combination', ['Cosopt'], ['bp']],
        ['Brimonidine eye drops', 'Alpha2 agonist for glaucoma', ['Alphagan'], ['bp']],
        ['Chloramphenicol eye drops', 'Ophthalmic antibiotic', ['Chloromycetin'], []],
        ['Tobramycin eye drops', 'Ophthalmic antibiotic', ['Tobrex'], []],
        ['Tobramycin + dexamethasone eye drops', 'Ophthalmic antibiotic/corticosteroid', ['Tobradex'], []],
        ['Artificial tears', 'Ocular lubricant', ['Systane', 'Tears Naturale'], []],
        ['Ciprofloxacin ear drops', 'Otic antibiotic', ['Cilodex'], []],
        ['Betamethasone + neomycin ear drops', 'Otic antibiotic/corticosteroid combination', [], []],
        ['Xylometazoline nasal', 'Topical nasal decongestant', ['Otrivin'], []],
        ['Oxymetazoline nasal', 'Topical nasal decongestant', ['Iliadin'], []]
      ]
    },
    {
      category: 'Vitamins / Supplements / Other',
      items: [
        ['Thiamine / Vitamin B1', 'Vitamin supplement', [], []],
        ['Pyridoxine / Vitamin B6', 'Vitamin supplement', [], []],
        ['Cyanocobalamin / Vitamin B12', 'Vitamin supplement', [], []],
        ['Hydroxocobalamin / Vitamin B12', 'Vitamin supplement', [], []],
        ['Folic acid', 'Vitamin supplement', [], []],
        ['Ferrous sulfate', 'Iron supplement', [], []],
        ['Ferrous fumarate', 'Iron supplement', [], []],
        ['Magnesium supplement', 'Mineral supplement', [], []],
        ['Potassium chloride', 'Electrolyte supplement', [], []],
        ['Multivitamin', 'Vitamin/mineral supplement', [], []],
        ['Omega-3 fatty acids', 'Nutritional supplement', ['Fish oil'], []],
        ['Glucosamine', 'Joint-health supplement', [], []],
        ['Chondroitin', 'Joint-health supplement', [], []],
        ['Creatine', 'Sports supplement', [], []],
        ['Coenzyme Q10', 'Nutritional supplement', ['CoQ10'], []],
        ['Cannabis / cannabinoid product', 'Cannabinoid product', ['CBD', 'THC', 'Medical cannabis'], ['sedating']],
        ['Herbal / traditional medicine', 'Complementary medicine', [], []],
        ['Homeopathic medicine', 'Complementary medicine', [], []]
      ]
    }
  ];

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const database = [];
  const ids = Object.create(null);
  GROUPS.forEach(function (group) {
    group.items.forEach(function (item) {
      const generic = item[0];
      let id = slug(generic);
      if (ids[id]) id += '-' + slug(group.category);
      ids[id] = true;
      const aliases = Array.isArray(item[2]) ? item[2] : [];
      const flags = Array.isArray(item[3]) ? item[3] : [];
      database.push({
        id: id,
        generic: generic,
        category: group.category,
        drugClass: item[1] || '',
        aliases: aliases,
        flags: flags,
        searchText: [generic, group.category, item[1] || ''].concat(aliases).join(' ').toLowerCase()
      });
    });
  });

  database.sort(function (a, b) {
    return a.generic.localeCompare(b.generic, 'en', { sensitivity: 'base' });
  });

  window.CHIROCLINIC_MEDICATION_DB_VERSION = '2026.08.25';
  window.CHIROCLINIC_MEDICATION_DATABASE = database;
  window.CHIROCLINIC_MEDICATION_CATEGORIES = GROUPS.map(function (g) { return g.category; });
  window.CHIROCLINIC_MEDICATION_FLAG_LABELS = FLAG_LABELS;
})();

