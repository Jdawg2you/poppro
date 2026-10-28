/* Bright Life Health & Wellness - underwriting screen data (sandbox, Jesse 28 Oct). Read from
   Health Insurance/Bright Life Docs/07_Underwriting/BL_Medical_Questionnaire_2026-09-14.pdf (Health History Disclosure
   Form, 2 pp.) - the Rx tags were read off the rendered pages, since the text extraction drops which rows carry them.
   The form's own rules: "Check Yes if you have the condition OR take a listed medicine - either one counts." "Brand
   names are just examples - a similar drug for the same purpose still counts." "An orange Rx tag means the medicine
   alone is enough to check Yes, even with no diagnosis." So on an Rx row a matching medicine counts by itself; on the
   other rows it needs the condition.
   Part A = right now or the next 12 months. Part B = pregnancy/fertility, now or within 12 months. Part C = past 5
   years or ongoing. Underwriting is stricter than the form: the trainer (webinar 22 Oct) counts an annual specialist
   follow-up as ongoing care with no time limit, and an AI look-back screens first - so Bright Life is never green. */
var BL_NO_HIRE=['WA','VT','AK','DE','NH','MN','MD','HI'];   /* webinar 22 Oct: "cannot recruit in" - read off a slide, a floor not a verified list */
var BL_ROWS=[
 {p:'A',t:'Organ failure or transplant needed',c:/organ failure|transplant (list|needed|wait)|needs? (a )?transplant/i},
 {p:'A',t:'On a transplant waiting list',c:/transplant (waiting )?list|waiting for a transplant/i},
 {p:'A',t:'Gene or cell therapy',rx:true,c:/gene therapy|cell therapy|car-?t\b/i,m:/zolgensma|luxturna|hemgenix|casgevy|lyfgenia|roctavian|elevidys|kymriah|yescarta|tecartus|breyanzi|abecma|carvykti/i},
 {p:'A',t:'Cancer treatment now (chemo, radiation, or cancer pills)',rx:true,c:/chemo|radiation|active cancer|cancer treatment/i,
   m:/xeloda|capecitabine|ibrance|palbociclib|tamoxifen|soltamox|letrozole|femara|anastrozole|arimidex|exemestane|aromasin|kisqali|ribociclib|verzenio|abemaciclib|keytruda|opdivo|imbruvica|revlimid|gleevec|imatinib|tagrisso|lupron|zytiga|xtandi|hydroxyurea|hydrea|methotrexate.*cancer/i},
 {p:'A',t:'Kidney failure (dialysis, stage 4–5)',c:/dialysis|kidney failure|renal failure|esrd|stage (4|5|iv|v) (ckd|kidney)|ckd (stage )?(4|5)/i},
 {p:'A',t:'Lifelong bleeding disorder',rx:true,c:/hemophilia|von willebrand|bleeding disorder|clotting disorder/i,m:/hemlibra|emicizumab|advate|novoeight|alprolix|eloctate|altuviiio|vonvendi|amicar|aminocaproic/i},
 {p:'A',t:'Biologic, specialty or immune-suppressing medication',rx:true,
   m:/humira|adalimumab|dupixent|dupilumab|stelara|ustekinumab|enbrel|etanercept|remicade|infliximab|cosentyx|secukinumab|skyrizi|risankizumab|rinvoq|upadacitinib|xeljanz|tofacitinib|taltz|tremfya|entyvio|ocrevus|kesimpta|orencia|actemra|cimzia|simponi|xolair|nucala|fasenra|tezspire|benlysta|methotrexate|azathioprine|imuran|cellcept|mycophenolate|tacrolimus|prograf|cyclosporine|sirolimus|otezla/i},
 {p:'A',t:'Inpatient mental health or substance-use care',c:/inpatient (mental|psych)|psychiatric hosp|residential (treatment|rehab)|\bIOP\b|\bPHP\b|partial hospitali|intensive outpatient/i},
 {p:'A',t:'High blood pressure in the lungs',rx:true,c:/pulmonary (arterial )?hypertension|\bPAH\b/i,m:/opsumit|macitentan|tyvaso|treprostinil|remodulin|orenitram|letairis|ambrisentan|tracleer|bosentan|adempas|riociguat|uptravi|selexipag|winrevair|revatio/i},
 {p:'A',t:'Rare or inherited disease treatment',rx:true,c:/gaucher|fabry|pompe|\bPNH\b|\baHUS\b|spinal muscular|\bSMA\b/i,m:/soliris|eculizumab|ultomiris|cerezyme|imiglucerase|fabrazyme|spinraza|strensiq|crysvita|nexviazyme/i},
 {p:'C',t:'Cancer in the last 5 years (not basal cell)',rx:true,c:/^(?!.*basal)(?=.*(cancer|carcinoma|melanoma|lymphoma|leukemia|myeloma|sarcoma|tumou?r))/i,
   m:/tamoxifen|soltamox|letrozole|femara|anastrozole|arimidex|exemestane|aromasin/i},
 {p:'C',t:'Heart or blood-vessel condition, blood thinner, or 3+ heart medicines',rx:true,
   c:/heart attack|myocardial|\bMI\b|bypass|cabg|heart failure|\bCHF\b|stroke|\bTIA\b|\bCVA\b|irregular heart|arrh?ythm|a-?fib|atrial|valve|tavr|mitral|watchman|pacemaker|defibrillator|lvad|heart pump|cardiomyopathy|coronary|\bCAD\b|stent|angioplasty/i,
   m:/eliquis|apixaban|xarelto|rivaroxaban|warfarin|coumadin|jantoven|pradaxa|dabigatran|savaysa|edoxaban|plavix|clopidogrel|brilinta|ticagrelor|effient|prasugrel|entresto/i,heart3:true},
 {p:'C',t:'Homebound, needs daily help, or hospice',c:/homebound|bedridden|hospice|palliative|needs help (with )?(bathing|dressing|feeding)/i},
 {p:'C',t:'Autoimmune condition (or immune-suppressing / 3+ months of steroids)',rx:true,
   c:/lupus|\bSLE\b|multiple sclerosis|\bMS\b|crohn|colitis|rheumatoid|\bRA\b|psoriatic arthritis|autoimmune|sj[oö]gren|scleroderma|myasthenia/i,
   m:/methotrexate|azathioprine|imuran|plaquenil|hydroxychloroquine|sulfasalazine|leflunomide|arava|mycophenolate|cellcept/i},
 {p:'C',t:'Blood or immune disorder (sickle cell, hemophilia, aplastic anemia, HIV)',c:/sickle cell|hemophilia|aplastic anemia|\bHIV\b|\bAIDS\b/i},
 {p:'C',t:'Organ failure or past transplant (or anti-rejection medicine)',rx:true,c:/transplant/i,m:/tacrolimus|prograf|envarsus|cyclosporine|neoral|sandimmune|mycophenolate|cellcept|myfortic|sirolimus|rapamune|zortress|everolimus/i},
 {p:'C',t:'Ongoing organ support (dialysis, ECMO, implanted heart pump)',c:/dialysis|ecmo|lvad|heart pump/i},
 {p:'C',t:'Chronic lung disease (or a triple inhaler / biologic asthma shot)',rx:true,c:/copd|emphysema|cystic fibrosis|bronchiectasis|pulmonary fibrosis|interstitial lung|chronic bronchitis/i,
   m:/trelegy|breztri|dupixent|dupilumab|nucala|mepolizumab|fasenra|benralizumab|xolair|omalizumab|tezspire/i},
 {p:'C',t:'Chronic liver disease (cirrhosis, hepatitis B/C, fatty liver with scarring)',c:/cirrhosis|hepatitis ?[bc]\b|hep ?[bc]\b|\bHBV\b|\bHCV\b|\bNASH\b|steatohepatitis|liver fibrosis|fatty liver.*scar/i},
 {p:'C',t:'Ongoing pain, bone, joint or back condition (incl. any back/neck injection or procedure)',
   c:/sciatica|osteoporosis|back (pain|injury|disorder|surgery|injection)|neck (pain|disorder|injection)|cervical|lumbar|spinal (stenosis|fusion)|\bdisc\b|herniat|arthritis|joint replacement|(knee|hip|shoulder) replacement|muscular dystrophy|cerebral palsy|dermatomyositis|compartment syndrome|fibromyalgia|chronic pain/i},
 {p:'C',t:'Substance use disorder',c:/alcohol|drug (abuse|dependen)|substance|addiction|opioid use/i},
 {p:'C',t:'Type 1 diabetes (incl. LADA) or an insulin pump',rx:true,c:/type ?(1|i)\b.*diab|\bT1D\b|\bLADA\b|insulin pump/i,m:/omnipod|tandem|t:slim|medtronic 7|insulin pump/i},
 {p:'C',t:'Major surgery in 5 years with ongoing care, or planned in 12 months',pend:true},
 {p:'C',t:'Brain or nerve disorder (Parkinson’s, epilepsy, stroke, dementia, ALS)',c:/parkinson|epilep|seizure|stroke|dementia|alzheimer|\bALS\b|huntington/i},
 {p:'C',t:'Mental health condition needing ongoing care, or 2+ regular medicines for it',rx:true,c:/schizo|bipolar|psychosis/i,m:/lithium|clozapine|clozaril/i,mh2:true},
 {p:'C',t:'Endometriosis, uterine fibroids or Peyronie’s',c:/endometriosis|fibroid|peyronie/i},
 {p:'C',t:'Skin: ongoing wound care, psoriasis, or skin cancer (not basal cell)',c:/^(?!.*basal)(?=.*(psoriasis|skin cancer|chronic wound|non-?healing|squamous))/i}
];
