/**
 * The investigations a clinician orders, for type-ahead.
 *
 * Typing "c" should offer CBC before Coombs, the way a search box offers the
 * common completion first — so the list is in rough order of how often an
 * antenatal OPD orders each one, and search keeps that order within a match
 * tier. A test that is not listed can still be typed and ordered; this is a
 * shortcut for spelling, not a menu of what is allowed.
 *
 * Nothing here says which test is indicated (PRD §3). It completes words.
 */

export interface Investigation {
  /** What is written on the order, e.g. `CBC`. */
  readonly name: string
  /** Shown beside the name in the suggestion list. */
  readonly detail?: string
  /** Other things a clinician might start typing for the same test. */
  readonly aliases?: readonly string[]
}

export const LAB_INVESTIGATIONS: readonly Investigation[] = [
  { name: 'CBC', detail: 'Complete blood count', aliases: ['complete blood count', 'hemogram', 'haemogram'] },
  { name: 'Hb', detail: 'Haemoglobin', aliases: ['haemoglobin', 'hemoglobin'] },
  { name: 'Urine routine & microscopy', aliases: ['urine r/m', 'urine rm', 'ur'] },
  { name: 'Blood group & Rh typing', aliases: ['abo', 'rh', 'blood group'] },
  { name: 'OGTT 75 g', detail: 'Oral glucose tolerance', aliases: ['glucose tolerance', 'gtt'] },
  { name: 'FBS', detail: 'Fasting blood sugar', aliases: ['fasting sugar', 'fasting blood sugar'] },
  { name: 'PPBS', detail: 'Post-prandial blood sugar', aliases: ['post prandial', 'pp sugar'] },
  { name: 'RBS', detail: 'Random blood sugar', aliases: ['random sugar'] },
  { name: 'HbA1c', aliases: ['glycated', 'a1c'] },
  { name: 'TSH', detail: 'Thyroid stimulating hormone', aliases: ['thyroid'] },
  { name: 'T3 / T4', detail: 'Thyroid profile', aliases: ['thyroid profile', 'ft4', 'free t4'] },
  { name: 'HIV 1 & 2', aliases: ['hiv'] },
  { name: 'HBsAg', detail: 'Hepatitis B surface antigen', aliases: ['hepatitis b', 'hbsag'] },
  { name: 'Anti-HCV', detail: 'Hepatitis C', aliases: ['hepatitis c', 'hcv'] },
  { name: 'VDRL', detail: 'Syphilis screen', aliases: ['syphilis', 'rpr'] },
  { name: 'Serum ferritin', aliases: ['ferritin', 'iron studies'] },
  { name: 'Peripheral smear', aliases: ['ps', 'smear'] },
  { name: 'Platelet count', aliases: ['platelets'] },
  { name: 'HPLC', detail: 'Haemoglobinopathy screen', aliases: ['thalassemia', 'thalassaemia', 'hb electrophoresis'] },
  { name: 'Indirect Coombs test', detail: 'ICT', aliases: ['ict', 'coombs', 'antibody titre'] },
  { name: 'LFT', detail: 'Liver function tests', aliases: ['liver function'] },
  { name: 'RFT', detail: 'Renal function tests', aliases: ['kft', 'kidney function', 'renal function'] },
  { name: 'Serum creatinine', aliases: ['creatinine'] },
  { name: 'Serum uric acid', aliases: ['uric acid'] },
  { name: 'Urine protein : creatinine ratio', aliases: ['upcr', 'pcr', 'protein creatinine'] },
  { name: '24-hour urine protein', aliases: ['24 hr urine', 'urine protein'] },
  { name: 'Urine culture & sensitivity', aliases: ['urine c/s', 'culture'] },
  { name: 'Coagulation profile (PT / INR, aPTT)', aliases: ['pt inr', 'aptt', 'coagulation'] },
  { name: 'Serum electrolytes', aliases: ['electrolytes', 'sodium', 'potassium'] },
  { name: 'Serum calcium', aliases: ['calcium'] },
  { name: 'Vitamin D (25-OH)', aliases: ['vit d', 'vitamin d'] },
  { name: 'Vitamin B12', aliases: ['b12', 'cobalamin'] },
  { name: 'CRP', detail: 'C-reactive protein', aliases: ['c reactive protein'] },
  { name: 'Double marker', aliases: ['dual marker', 'papp-a'] },
  { name: 'Quadruple marker', aliases: ['quad marker', 'triple marker'] },
  { name: 'NIPT', detail: 'Non-invasive prenatal testing', aliases: ['cell free dna', 'cfdna'] },
  { name: 'Rubella IgG', aliases: ['rubella'] },
  { name: 'TORCH panel', aliases: ['torch', 'toxoplasma', 'cmv'] },
  { name: 'Group B Strep swab', aliases: ['gbs'] },
  { name: 'High vaginal swab', aliases: ['hvs'] },
]

export const SCAN_INVESTIGATIONS: readonly Investigation[] = [
  { name: 'Obstetric USG', aliases: ['usg', 'ultrasound', 'sonography'] },
  { name: 'Dating scan', aliases: ['viability', 'early scan'] },
  { name: 'NT / NB scan', detail: '11–13+6 weeks', aliases: ['nt', 'nuchal', 'nasal bone'] },
  { name: 'Anomaly scan (TIFFA / Level II)', detail: '18–22 weeks', aliases: ['tiffa', 'level 2', 'level ii', 'anomaly'] },
  { name: 'Growth scan', aliases: ['growth', 'fetal growth'] },
  { name: 'Growth scan with Doppler', aliases: ['doppler', 'umbilical doppler'] },
  { name: 'Biophysical profile (BPP)', aliases: ['bpp', 'biophysical'] },
  { name: 'NST', detail: 'Non-stress test', aliases: ['non stress', 'ctg', 'cardiotocography'] },
  { name: 'Cervical length (TVS)', aliases: ['cervical length', 'tvs', 'transvaginal'] },
  { name: 'Fetal echocardiography', aliases: ['fetal echo', 'echo'] },
]

/**
 * Investigations matching what has been typed, best match first.
 *
 * Tiers: the name starts with it, a word in the name starts with it, an alias
 * starts with it, then anything containing it. Within a tier the catalogue's
 * own order is kept, which is what puts CBC ahead of Coombs for "c".
 */
export function searchInvestigations(
  catalog: readonly Investigation[],
  query: string,
  exclude: readonly string[] = [],
  limit = 7,
): readonly Investigation[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const taken = new Set(exclude.map((name) => name.toLowerCase()))

  return catalog
    .map((item, index) => {
      const name = item.name.toLowerCase()
      const aliases = (item.aliases ?? []).map((a) => a.toLowerCase())
      const tier = name.startsWith(q)
        ? 0
        : name.split(/[\s/&(),:-]+/).some((word) => word.startsWith(q))
          ? 1
          : aliases.some((alias) => alias.startsWith(q))
            ? 2
            : name.includes(q) || aliases.some((alias) => alias.includes(q)) ||
                (item.detail ?? '').toLowerCase().includes(q)
              ? 3
              : 4
      return { item, tier, index }
    })
    .filter((entry) => entry.tier < 4 && !taken.has(entry.item.name.toLowerCase()))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item)
}
