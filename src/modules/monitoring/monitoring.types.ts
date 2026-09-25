/**
 * Home monitoring — daily readings a patient takes herself, between visits.
 *
 * Pure TypeScript. No zod, no database row shapes, no framework.
 *
 * Distinct from `visit_vitals` (modules/visits): those are a clinician's own
 * measurement, attributed to a consultation. These are hers — taken with her
 * own machine, on her own schedule — and are never presented as a clinical
 * reading a doctor recorded (ARCH-10: the source of a value travels with it).
 *
 * Which metric applies to her is read off the diagnoses a clinician has
 * already flagged on the pregnancy (modules/diagnoses), never guessed from
 * anything else — the system does not decide she is diabetic or hypertensive
 * on its own (PRD §3). It only recognises the clinician's own words well
 * enough to turn "Gestational diabetes" into "she needs a glucose log".
 */

export type HomeReadingMetric = 'BLOOD_GLUCOSE' | 'BLOOD_PRESSURE'

export type GlucoseContext = 'FASTING' | 'POST_BREAKFAST' | 'POST_LUNCH' | 'POST_DINNER' | 'RANDOM'

export const GLUCOSE_CONTEXT_LABELS: Record<GlucoseContext, string> = {
  FASTING: 'Fasting',
  POST_BREAKFAST: 'After breakfast',
  POST_LUNCH: 'After lunch',
  POST_DINNER: 'After dinner',
  RANDOM: 'Random',
}

/** One value logged from home. Exactly one of the two payloads is present. */
export interface HomeReading {
  readonly id: string
  readonly recordedAt: string
  readonly glucose: { readonly mgDl: number; readonly context: GlucoseContext } | null
  readonly bloodPressure: { readonly systolicMmHg: number; readonly diastolicMmHg: number } | null
}

export interface MonitoringMetricPanel {
  readonly metric: HomeReadingMetric
  readonly readings: readonly HomeReading[]
}

export const HOME_READING_METRIC_LABELS: Record<HomeReadingMetric, string> = {
  BLOOD_GLUCOSE: 'Blood sugar',
  BLOOD_PRESSURE: 'Blood pressure',
}

/**
 * Keyword match against a clinician's flagged diagnosis text.
 *
 * A flagged diagnosis is free text — picked from a suggestion list or typed
 * (modules/diagnoses) — so this matches on keyword rather than an exact
 * label: "Gestational diabetes", "GDM" and "Overt diabetes" must all switch
 * the sugar log on, and "Gestational hypertension", "Pre-eclampsia" and
 * "PIH" must all switch the BP log on. A label that matches neither enables
 * nothing — no monitoring is the correct default, not a guessed one.
 */
const GLUCOSE_KEYWORDS = ['diabet', 'gdm']
const BLOOD_PRESSURE_KEYWORDS = ['hypertens', 'eclampsia', 'pih']

export function metricsForDiagnoses(labels: readonly string[]): readonly HomeReadingMetric[] {
  const metrics = new Set<HomeReadingMetric>()
  for (const raw of labels) {
    const label = raw.toLowerCase()
    if (GLUCOSE_KEYWORDS.some((k) => label.includes(k))) metrics.add('BLOOD_GLUCOSE')
    if (BLOOD_PRESSURE_KEYWORDS.some((k) => label.includes(k))) metrics.add('BLOOD_PRESSURE')
  }
  // Fixed order: sugar before pressure, regardless of which diagnosis was
  // flagged first, so the dashboard's tile order never shuffles between visits.
  return (['BLOOD_GLUCOSE', 'BLOOD_PRESSURE'] as const).filter((m) => metrics.has(m))
}

/** `126 mg/dL (fasting)`. */
export function formatGlucose(reading: HomeReading['glucose']): string {
  if (!reading) return ''
  return `${reading.mgDl} mg/dL (${GLUCOSE_CONTEXT_LABELS[reading.context]})`
}

/** `120/80 mmHg`. */
export function formatBloodPressure(reading: HomeReading['bloodPressure']): string {
  if (!reading) return ''
  return `${reading.systolicMmHg}/${reading.diastolicMmHg} mmHg`
}
