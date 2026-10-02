'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import {
  recordImmunization,
  removeFamilyHistory,
  removeHistoryEntry,
  saveFamilyHistory,
  saveMenstrualHistory,
  savePastHistory,
  saveObstetricHistory,
  setHistoryFlag,
} from '@modules/history/history.service'
import { flagDiagnoses, resolveFlaggedDiagnosis } from '@modules/diagnoses/diagnosis.service'
import { saveBirthPlan, updatePregnancyProfile } from '@modules/pregnancies/pregnancy.service'
import { transcribeDictation } from '@modules/voice/voice.service'

/**
 * The cockpit's writes that are not part of Save & Next.
 *
 * History and immunizations are facts about the woman, recorded whenever they
 * are learned — at the counter, before the doctor sees her, or mid-consultation.
 * Tying them to the consultation commit would lose a history taken by a nurse
 * for a patient the doctor never got to that day.
 *
 * Each action hands its input straight to the service, which parses it (ARCH-6)
 * and checks permission (ARCH-5). The cockpit is revalidated so the accordion
 * shows what was just written.
 */

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

/** The error's own sentence, plus the first validation issue when there is one. */
function describe(error: AppError): string {
  if (error.kind === 'VALIDATION' && Array.isArray(error.details)) {
    const first = error.details[0] as { message?: unknown; path?: unknown } | undefined
    if (typeof first?.message === 'string') {
      const field = Array.isArray(first.path) ? first.path.filter((p) => typeof p === 'string').at(-1) : null
      return `${error.message} ${field ? `(${field}) ` : ''}${first.message}`
    }
  }
  return error.message
}

type ActiveActor = Extract<Awaited<ReturnType<typeof resolveSession>>, { status: 'ACTIVE' }>['actor']

async function run(
  patientId: string,
  write: (actor: ActiveActor) => Promise<unknown>,
): Promise<ActionResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { ok: false, message: 'Your session has ended. Sign in again.' }
  }

  try {
    await write(session.actor)
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: describe(error) }
    throw error
  }

  revalidatePath(`/clinic/patients/${patientId}/cockpit`)
  // Flags and history show on the clinic's patient list too.
  revalidatePath('/clinic')
  return { ok: true }
}

export async function saveObstetricHistoryAction(input: {
  patientId: string
  historyId: string | null
  expectedVersion: number | null
  entry: unknown
}): Promise<ActionResult> {
  return run(input.patientId, (actor) => saveObstetricHistory(actor, input))
}

export async function saveMenstrualHistoryAction(input: {
  patientId: string
  historyId: string | null
  expectedVersion: number | null
  entry: unknown
}): Promise<ActionResult> {
  return run(input.patientId, (actor) => saveMenstrualHistory(actor, input))
}

export async function recordImmunizationAction(
  patientId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(patientId, (actor) => recordImmunization(actor, input))
}

export async function saveFamilyHistoryAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => saveFamilyHistory(actor, input))
}

export async function removeFamilyHistoryAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => removeFamilyHistory(actor, input))
}

export async function savePastHistoryAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => savePastHistory(actor, input))
}

export async function removeHistoryEntryAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => removeHistoryEntry(actor, input))
}

export async function setHistoryFlagAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => setHistoryFlag(actor, input))
}

/** Height, marriage and conception — facts about this pregnancy, saved at once. */
export async function updatePregnancyProfileAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => updatePregnancyProfile(actor, input))
}

/** The birth preparedness plan for this pregnancy. */
export async function saveBirthPlanAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => saveBirthPlan(actor, input))
}

/**
 * Flag diagnoses onto the banner. Written at once rather than with Save & Next:
 * a flag is a standing fact on her record, and the doctor expects to see it on
 * the banner as soon as she raises it.
 */
export async function flagDiagnosesAction(patientId: string, input: unknown): Promise<ActionResult> {
  return run(patientId, (actor) => flagDiagnoses(actor, input))
}

export async function resolveFlaggedDiagnosisAction(patientId: string, flagId: string): Promise<ActionResult> {
  return run(patientId, (actor) => resolveFlaggedDiagnosis(actor, flagId))
}

export type DictationResult =
  | { readonly ok: true; readonly text: string; readonly isFixture: boolean }
  | { readonly ok: false; readonly message: string }

/**
 * One piece of a doctor's dictation, as text.
 *
 * Nothing is stored: the audio is discarded after transcription, and the text
 * goes back into the field it was dictated into, where it commits with the
 * consultation or not at all.
 */
export async function transcribeDictationAction(formData: FormData): Promise<DictationResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { ok: false, message: 'Your session has ended. Sign in again.' }
  }

  const audio = formData.get('audio')
  if (!(audio instanceof Blob)) return { ok: false, message: 'Nothing was recorded.' }

  try {
    const dictation = await transcribeDictation(
      session.actor,
      new Uint8Array(await audio.arrayBuffer()),
      audio.type || 'audio/wav',
    )
    return { ok: true, text: dictation.text, isFixture: dictation.isFixture }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message }
    throw error
  }
}
