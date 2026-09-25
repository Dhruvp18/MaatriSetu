import type { DeliveryMode, PregnancyOutcome } from '@/modules/pregnancies/pregnancy.types'
import type { DoseFrequency, MedicationRoute } from '@/modules/orders/order.types'
import type { Article, GuideSlug } from '../locales'

const articles: Record<GuideSlug, Article> = {
  nutrition: {
    title: 'Nutrition & Diet',
    blocks: [
      { kind: 'lead', text: "Eating right is essential for your health and your baby's growth." },
      {
        kind: 'list',
        items: [
          '**Eat often:** Have 3 regular meals and 2 healthy snacks daily.',
          '**Stay hydrated:** Drink at least 8-10 glasses of water every day.',
          '**Iron-rich foods:** Include spinach (palak), jaggery (gud), dates, and beans to prevent anemia.',
          '**Vitamins:** Eat colorful fruits and vegetables daily for essential vitamins.',
        ],
      },
      {
        kind: 'tip',
        title: 'Important Tip',
        text: 'Take your Calcium and Iron-Folic Acid (IFA) tablets as prescribed, but **never take them together**. Keep a gap of at least 2 hours between them.',
      },
    ],
  },
  tips: {
    title: 'Daily Care Tips',
    blocks: [
      { kind: 'lead', text: 'Small changes in your daily routine can make a big difference.' },
      {
        kind: 'list',
        items: [
          '**Sleep position:** Try to sleep on your left side. It improves blood flow to your baby and your kidneys.',
          '**Stay active:** Take short walks (20-30 minutes) every day unless your doctor advised bed rest.',
          '**Clothing:** Wear comfortable, loose-fitting cotton clothes and flat shoes.',
          '**Avoid heavy work:** Do not lift heavy objects or do strenuous physical work that tires you out.',
          '**Rest:** Take at least 2 hours of rest during the day and sleep for 8 hours at night.',
        ],
      },
    ],
  },
  myths: {
    title: 'Myth Busters',
    blocks: [
      {
        kind: 'myth',
        myth: 'Ghee makes normal delivery easier.',
        fact: 'Drinking excessive ghee does not lubricate the birth canal. It only causes unwanted weight gain and acidity.',
      },
      {
        kind: 'myth',
        myth: 'Ripe papaya causes miscarriage.',
        fact: 'Completely ripe papaya is safe in moderation. However, **unripe** or semi-ripe papaya should be avoided.',
      },
    ],
  },
  breastfeeding: {
    title: 'Breastfeeding Guide',
    blocks: [
      { kind: 'lead', text: "Mother's milk is the best gift you can give your baby." },
      {
        kind: 'list',
        items: [
          '**Start early:** Begin breastfeeding within the first hour of normal birth.',
          '**Exclusive feeding:** Give **only** breast milk for the first 6 months. No water, honey, ghutti, or animal milk is needed.',
          '**On demand:** Feed your baby whenever they cry or show signs of hunger (8-12 times a day).',
        ],
      },
    ],
  },
  vaccines: {
    title: 'Vaccination Schedule',
    blocks: [
      { kind: 'lead', text: 'Vaccines protect both you and your baby from dangerous infections.' },
      {
        kind: 'card',
        title: 'Tetanus & Diphtheria (Td)',
        items: [
          '**Td-1:** Given early in pregnancy during your first ANC visit.',
          '**Td-2:** Given 4 weeks after the first dose.',
          '**Booster:** If you had a pregnancy with two Td doses in the last 3 years, you only need one Booster dose this time.',
        ],
      },
      { kind: 'note', text: 'Keep your ANC card safe! It contains your complete vaccination record.' },
    ],
  },
  'hospital-bag': {
    title: 'Hospital Bag Checklist',
    blocks: [
      { kind: 'lead', text: "Pack your bag by the 8th month so you are ready when it's time!" },
      {
        kind: 'group',
        title: '📄 Documents',
        items: [
          'Your MaatriSetu ANC Card',
          'Aadhaar Card or ID proof',
          'All previous ultrasound scans and blood test reports',
        ],
      },
      {
        kind: 'group',
        title: '👩 For Mother',
        items: [
          '2-3 loose, front-open cotton nightgowns (for easy breastfeeding)',
          'Maternity sanitary pads (1-2 packs)',
          'Undergarments and comfortable clothes for going home',
          'Basic toiletries (toothbrush, soap, towel, comb)',
          'A warm shawl or sweater if it is cold',
        ],
      },
      {
        kind: 'group',
        title: '👶 For Baby',
        items: [
          '4-5 washed, soft cotton clothes (jhablas)',
          'Soft cotton nappies or newborn diapers',
          '2-3 soft receiving blankets to swaddle the baby',
          'Cap, socks, and mittens',
        ],
      },
    ],
  },
}

const outcome: Record<PregnancyOutcome, string> = {
  LIVE_BIRTH: 'Live birth',
  STILLBIRTH: 'Stillbirth',
  ABORTION_SPONTANEOUS: 'Miscarriage',
  ABORTION_INDUCED: 'Abortion',
  ECTOPIC: 'Ectopic pregnancy',
  MOLAR: 'Molar pregnancy',
  UNKNOWN: 'Unknown',
}

const deliveryMode: Record<DeliveryMode, string> = {
  VAGINAL: 'Normal delivery',
  ASSISTED_VAGINAL: 'Assisted delivery',
  LSCS_EMERGENCY: 'Emergency C-section',
  LSCS_ELECTIVE: 'Planned C-section',
  UNKNOWN: 'Unknown',
}

const route: Record<MedicationRoute, string> = {
  ORAL: 'By mouth',
  IV: 'Drip (IV)',
  IM: 'Injection (IM)',
  SC: 'Injection under skin',
  PR: 'Rectal',
  PV: 'Vaginal',
  TOPICAL: 'Apply on skin',
  INHALED: 'Inhaled',
  OTHER: 'As directed',
}

const frequency: Record<DoseFrequency, string> = {
  OD: 'Once a day',
  BD: 'Twice a day',
  TDS: 'Three times a day',
  QID: 'Four times a day',
  HS: 'At night',
  SOS: 'Only if needed',
  PRN: 'As required',
  STAT: 'Once, immediately',
  WEEKLY: 'Once a week',
  OTHER: 'As directed',
}

export const en = {
  brand: 'MaatriSetu',
  languageLabel: 'Language',
  common: {
    sessionExpired: 'Session expired. Please scan your QR again.',
    noActivePregnancy: 'No active pregnancy on record.',
    notAvailable: 'N/A',
  },
  nav: {
    home: 'My ANC',
    info: 'Information',
    chat: 'Message Us',
  },
  home: {
    scanTitle: 'Scan Your File QR',
    scanBody: 'Scan the QR code on your ANC paper file to view your health records.',
    welcome: 'Welcome back',
    uhid: 'UHID',
    currentPregnancy: 'Current Pregnancy',
    gestationAge: '{weeks}w {days}d',
    gestation: 'gestation',
    datingNotEstablished: 'Dating not established',
    expected: 'Expected:',
    noActivePregnancy: 'No active pregnancy on record',
    lastVisit: 'Last Visit',
    nextFollowUp: 'Next Follow-up',
    tiles: {
      profile: { label: 'My Profile', desc: 'View and manage your details' },
      prescriptions: { label: 'My Prescriptions', desc: 'View your medicines and advice' },
      scanReport: { label: 'Scan New Report', desc: 'Scan and upload your reports' },
      reports: { label: 'My Reports', desc: 'View uploaded reports and scans' },
      monitoring: { label: 'Daily Monitoring', desc: 'Log today’s reading and see your trend' },
    },
    tagline: '"A healthier you for a brighter tomorrow"',
  },
  profile: {
    title: 'My Profile',
    notFound: 'Patient record not found.',
    uhid: 'UHID: {uhid}',
    age: 'Age',
    ageEstimated: '{years} yrs (est)',
    phone: 'Phone',
    notProvided: 'Not provided',
    abhaId: 'ABHA ID',
    abhaVerified: 'Verified',
    medicalSummary: 'Medical Summary',
    bloodType: 'Blood Type',
    allergies: 'Allergies',
    allergiesNoted: '{count} noted',
    none: 'None',
    unknown: 'Unknown',
    obstetricHistory: 'Obstetric History',
    pregnancyNo: 'Pregnancy {n}',
    outcome: 'Outcome:',
    mode: 'Mode:',
    birthWeight: 'Birth Weight:',
    complications: 'Complications:',
    noHistory: 'No prior obstetric history on record.',
    logout: 'Log Out',
  },
  prescriptions: {
    title: 'My Prescriptions',
    subtitle: 'Medicines advised by your doctor',
    ongoing: 'Ongoing Medicines',
    past: 'Past Medicines',
    active: 'Active',
    doseAsDirected: 'Dose as directed',
    forDays: 'For {n} days',
    noOngoing: 'No ongoing medicines right now.',
  },
  reports: {
    title: 'My Reports',
    subtitle: 'Lab results and scans',
    scans: 'Ultrasound Scans',
    scanDate: 'Scan Date: {date}',
    uploaded: 'Uploaded',
    recorded: 'Recorded',
    placenta: 'Placenta',
    afi: 'AFI',
    fetalWeight: 'Fetal Weight',
    fetalHeartRate: 'Fetal Heart Rate',
    noScans: 'No ultrasound scans recorded yet.',
    labResults: 'Lab Results',
    noLabs: 'No lab results recorded yet.',
  },
  scanReport: {
    title: 'Scan Report',
    subtitle: 'Upload your lab results or ultrasound scans',
    previewAlt: 'Report Preview',
    retake: 'Retake',
    tapToScan: 'Tap to scan report',
    tapHint: 'Take a clear photo of your document',
    reviewNote: 'Your clinic will review the uploaded document and add the results to your medical record.',
    uploading: 'Uploading...',
    submit: 'Submit Report',
    uploadFailed: 'Failed to upload report. Please try again.',
  },
  chat: {
    title: 'Message Us',
    subtitle: 'Ask · Share · Get Guidance',
    welcome: "Hello! I'm here to help with questions about your pregnancy. I'll let you know if something needs urgent attention, or if it can wait for your next visit. What's on your mind?",
    error: 'Sorry, I had trouble processing that. Please try again.',
    bookNow: 'Book an appointment now',
    visitTomorrow: 'Schedule a visit for tomorrow',
    nextFollowUp: 'Will be addressed at your next follow-up',
    placeholder: 'Type your question...',
    voiceInput: 'Voice input (not yet enabled)',
    disclaimer: 'This assistant does not give medical advice. Always consult your doctor.',
    fallback: {
      critical: 'Your symptoms need immediate attention. Please come to the clinic or call us right away.',
      important: 'This should be looked at soon. Please try to visit the clinic tomorrow or call us if it gets worse.',
      normal: 'Thank you for reaching out. Our team will address your question at your next scheduled follow-up visit.',
    },
  },
  scan: {
    body: 'Please scan the **QR code sticker** on your paper ANC file to access your health records.',
    hint: 'Your doctor or nurse can print a new sticker for you if needed.',
    tagline: '"Your care, in your hands." ❤',
    noSticker: "Don't have a sticker to scan?",
    chooseInstead: 'Sign in instead',
    orDivider: 'or',
  },
  login: {
    title: 'Patient Sign In',
    subtitle: 'Enter your patient ID and password to view your dashboard.',
    uhidLabel: 'Patient ID (UHID)',
    uhidPlaceholder: 'MH-2026-XXXXX',
    passwordLabel: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
  },
  info: {
    title: 'Information & Support',
    subtitle: 'Helpful guides, tips, and your rights',
    dangerTitle: 'Danger Signs (Call Doctor Immediately)',
    dangerSigns: [
      'Heavy bleeding or spotting',
      'Severe abdominal pain or cramping',
      'Leaking fluid from the vagina',
      'Sudden swelling of face, hands, or feet',
      'Severe headaches or blurred vision',
      'Baby stops moving or moves much less',
      'High fever or chills',
    ],
    trimesterTips: {
      1: '🌱 First trimester: Folic acid is very important right now. Take your supplements every day and eat leafy greens.',
      2: '🤰 Second trimester: Your baby can now hear sounds! Keep taking iron tablets and sleep on your left side for better blood flow.',
      3: "👼 Third trimester: Count your baby's kicks daily — 10 kicks in 2 hours is a good sign. Prepare your bag for delivery.",
    },
    guides: {
      nutrition: 'Nutrition & Diet',
      tips: 'Daily Tips',
      myths: 'Myth Busters',
      breastfeeding: 'Breastfeeding',
      vaccines: 'Vaccines',
      'hospital-bag': 'Hospital Bag',
    } as Record<GuideSlug, string>,
    schemes: {
      pmmvy: {
        name: 'Pradhan Mantri Matru Vandana Yojana (PMMVY)',
        desc: 'Financial support of ₹5,000 in 3 instalments for pregnant and lactating women for their first living child.',
      },
      jsy: {
        name: 'Janani Suraksha Yojana (JSY)',
        desc: 'Financial assistance for eligible women who deliver in a government health facility — cash benefit goes directly to the mother.',
      },
      jssk: {
        name: 'Janani Shishu Suraksha Karyakram (JSSK)',
        desc: 'Entitlement to free delivery, C-section, medicines, diagnostics, blood, diet, and transport at government health facilities.',
      },
      pmsma: {
        name: 'Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)',
        desc: 'Free comprehensive ANC check-up including ultrasound, blood tests, and specialist consultation on the 9th of every month.',
      },
      suman: {
        name: 'SUMAN — Surakshit Matritva Aashwasan',
        desc: 'Your rights: respectful care, zero discrimination, free essential medicines, referral transport, and zero out-of-pocket cost.',
      },
    },
  },
  feed: {
    title: 'Pregnancy Feed',
    subtitle: 'Bite-sized guidance, myths and your rights — swipe through at your own pace.',
    readFullGuide: 'Read the full guide',
    seeDosingSchedule: 'See the exact dosing schedule',
    tagMythBuster: 'Myth buster',
    tagBodyChanges: 'Body changes',
    tagScreening: 'Screening',
    tagGovernmentScheme: 'Government scheme',
    tagEmotionalWellbeing: 'Emotional wellbeing',
    colostrumCaption:
      "Her first milk — thick, golden, and packed with antibodies. A newborn's stomach is only marble-sized on day one, so every drop counts.",
    lineaNigraTitle: 'The dark line on your belly',
    lineaNigraCaption:
      'A faint vertical line down your belly, caused by pregnancy hormones. Completely harmless — it fades naturally after delivery.',
    papSmearTitle: 'What is a Pap smear?',
    papSmearCaption:
      'A routine, painless cervical check that takes under 3 minutes — safe even during an early antenatal visit.',
    vaccinesCaption:
      'Two vaccines that protect you both: Td guards against tetanus, and the flu shot is safe every trimester and passes immunity to your baby.',
    emotionalWellbeingTitle: 'It’s okay to not feel glowing every day',
    emotionalWellbeingCaption:
      'Mood swings and feeling overwhelmed are a normal hormonal change — not a reflection of the mother you will be.',
    eatForTwoCaption: 'Myth-busted: you do not need to double your food. About 300–450 extra quality calories a day is enough.',
  },
  monitoring: {
    title: 'Daily Monitoring',
    subtitle: 'Readings your doctor asked you to track between visits',
    notEnabled: 'No daily monitoring has been set up for you. Your doctor turns this on if you need it.',
    measure: 'Measure',
    save: 'Save reading',
    saving: 'Saving…',
    saved: 'Saved',
    close: 'Close',
    glucoseValue: 'Blood sugar',
    glucoseContext: 'When was this taken?',
    bloodPressureLabel: 'Blood pressure',
    systolic: 'Systolic',
    diastolic: 'Diastolic',
    week: 'Week',
    month: 'Month',
    sincePregnancy: 'Since pregnancy started',
    noReadings: 'No readings logged in this period yet.',
    unitGlucose: 'mg/dL',
    unitBp: 'mmHg',
  },
  article: {
    header: 'Guide',
    back: 'Back to information',
    myth: 'Myth:',
    fact: 'Fact:',
    articles,
  },
  enums: { outcome, deliveryMode, route, frequency },
}

export type Dict = typeof en
