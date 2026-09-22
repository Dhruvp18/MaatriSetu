/**
 * The keyword lexicon that routes patient voice notes.
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it is emphatically not
 * ---------------------------------------------------------------------------
 * This decides HOW URGENTLY A HUMAN SHOULD READ a message. It does not decide
 * what the patient has, it does not score risk, and it never answers her. A
 * match means "a clinician should look at this sooner"; it does not mean
 * "this patient has pre-eclampsia".
 *
 * That distinction is why the buckets are named for reader urgency rather than
 * for clinical severity, and why the matched phrases and the lexicon version
 * are stored on every message — a routing decision that cannot be explained
 * afterwards is not auditable, and PRD §3 forbids the system from making
 * clinical judgments on its own.
 *
 * It is plain substring matching over a list a clinician can read and edit.
 * Deliberately not a model: a classifier would be unreviewable, would drift
 * silently, and would put the product on the wrong side of the non-CDSS
 * boundary the Health-a-thon rules draw.
 *
 * ---------------------------------------------------------------------------
 * Bias
 * ---------------------------------------------------------------------------
 * Every ambiguity resolves toward a human reading it sooner. An unmatched
 * message is NEEDS_REVIEW, never INFORMATIONAL — silence is not reassurance.
 * A priority phrase always wins, even alongside an informational one, because
 * "my head is splitting, also when is my next visit" is an urgent message.
 *
 * ---------------------------------------------------------------------------
 * Review status
 * ---------------------------------------------------------------------------
 * These phrases are a DEVELOPER'S FIRST DRAFT and have not been reviewed by a
 * clinician. `docs/development-foundation.md` lists clinical review of the
 * lexicon as a release gate before any patient pilot. Bump LEXICON_VERSION on
 * every change so stored routing decisions stay explainable.
 */

export const LEXICON_VERSION = 'lexicon-v1-unreviewed'

/** How urgently a human should read this. Not a clinical assessment. */
export type RoutingBucket = 'INFORMATIONAL' | 'NEEDS_REVIEW' | 'PRIORITY_REVIEW'

export interface RoutingDecision {
  readonly bucket: RoutingBucket
  /** Exactly which phrases matched, so the decision can be explained. */
  readonly matchedPhrases: readonly string[]
  readonly lexiconVersion: string
}

/**
 * Phrases that should put a message in front of a clinician quickly.
 *
 * Drawn from the danger signs the PRD names: bleeding, severe headache, absent
 * fetal movements, fits. Written in the languages mothers actually send —
 * Marathi, Hindi, Gujarati — and in English, because the translation is matched
 * too.
 */
const PRIORITY_PHRASES: readonly string[] = [
  // Bleeding
  'bleeding', 'blood', 'रक्तस्राव', 'रक्त', 'खून', 'લોહી', 'રક્ત',
  // Severe headache and visual disturbance
  'severe headache', 'bad headache', 'blurred', 'blurring', 'vision',
  'डोकेदुखी', 'सिरदर्द', 'माथु दुखे', 'अंधारी', 'धुंधला', 'દુખાવો માથા',
  // Fetal movements
  'no movement', 'not moving', 'reduced movement', 'movements have',
  'हालचाल', 'हलचल', 'હલનચલન', 'बाळाची हालचाल',
  // Fits / convulsions / loss of consciousness
  'fit', 'fits', 'convulsion', 'seizure', 'unconscious', 'fainted',
  'झटके', 'दौरा', 'बेशुद्ध', 'ખેંચ',
  // Leaking liquor / membrane rupture
  'water broke', 'water breaking', 'leaking', 'पाणी गेले', 'पानी',
  // Severe pain and fever
  'severe pain', 'unbearable', 'high fever', 'तीव्र वेदना', 'तेज बुखार', 'ताप',
  // Reduced or absent urine
  'not passing urine', 'no urine',
]

/**
 * Phrases that identify a routine informational question.
 *
 * These only ever *downgrade* a message that matched nothing urgent. They never
 * trigger an automatic reply: automated clinical responses to patients are
 * disabled (MESSAGING_PROVIDER), and enabling them needs approved wording, a
 * staffed escalation owner and delivery-failure handling first.
 */
const INFORMATIONAL_PHRASES: readonly string[] = [
  // Appointments
  'next appointment', 'next visit', 'when should i come', 'date',
  'तारीख', 'अपॉइंटमेंट', 'कधी यायचे', 'તારીખ',
  // Medication timing
  'calcium', 'iron', 'tablet', 'medicine', 'with food', 'after food',
  'कॅल्शियम', 'लोह', 'गोळी', 'दवा', 'गोली', 'કેલ્શિયમ', 'દવા',
  // Diet
  'diet', 'eat', 'food', 'आहार', 'खाणे', 'खाना', 'ખોરાક',
  // Vaccination
  'injection', 'vaccine', 'टीका', 'लस', 'રસી',
]

/**
 * Route a message.
 *
 * Both the original transcript and the English translation are matched. If the
 * translation failed, her own words are still checked — a translation failure
 * must not blind the routing.
 */
export function route(original: string | null, english: string | null): RoutingDecision {
  const haystack = normalise([original, english].filter(Boolean).join(' \n '))

  const priorityHits = PRIORITY_PHRASES.filter((phrase) =>
    haystack.includes(normalise(phrase)),
  )

  // A priority phrase wins outright. A message mentioning both bleeding and
  // the next appointment date is an urgent message.
  if (priorityHits.length > 0) {
    return {
      bucket: 'PRIORITY_REVIEW',
      matchedPhrases: priorityHits,
      lexiconVersion: LEXICON_VERSION,
    }
  }

  const informationalHits = INFORMATIONAL_PHRASES.filter((phrase) =>
    haystack.includes(normalise(phrase)),
  )

  if (informationalHits.length > 0) {
    return {
      bucket: 'INFORMATIONAL',
      matchedPhrases: informationalHits,
      lexiconVersion: LEXICON_VERSION,
    }
  }

  // Nothing matched. A human reads it. Silence is not reassurance, and a
  // lexicon can only ever recognise what someone thought to write down.
  return { bucket: 'NEEDS_REVIEW', matchedPhrases: [], lexiconVersion: LEXICON_VERSION }
}

/**
 * Lowercase, and flatten punctuation and whitespace to single spaces.
 *
 * Indic scripts are left otherwise untouched: they are caseless, and stripping
 * combining marks would change the words themselves.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
