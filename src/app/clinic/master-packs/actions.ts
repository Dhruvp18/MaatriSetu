'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { deleteMasterPack, listMyMasterPacks, saveMasterPack } from '@modules/master-packs/master-pack.service'
import type { MasterPack } from '@modules/master-packs/master-pack.types'

/**
 * The master-pack manager's writes, opened from the profile menu on any
 * clinic page.
 *
 * Each hands its input straight to the service, which parses it (ARCH-6) and
 * checks permission (ARCH-5). The whole clinic area is revalidated after a
 * write so an open cockpit's pack strip shows the change.
 */

export type PackActionResult<T = null> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

function describe(error: AppError): string {
  if (error.kind === 'VALIDATION' && Array.isArray(error.details)) {
    const first = error.details[0] as { message?: unknown } | undefined
    if (typeof first?.message === 'string') return `${error.message} ${first.message}`
  }
  return error.message
}

type ActiveActor = Extract<Awaited<ReturnType<typeof resolveSession>>, { status: 'ACTIVE' }>['actor']

async function run<T>(work: (actor: ActiveActor) => Promise<T>, revalidate: boolean): Promise<PackActionResult<T>> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { ok: false, message: 'Your session has ended. Sign in again.' }
  }

  let value: T
  try {
    value = await work(session.actor)
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: describe(error) }
    throw error
  }

  if (revalidate) revalidatePath('/clinic', 'layout')
  return { ok: true, value }
}

export async function listMasterPacksAction(): Promise<PackActionResult<MasterPack[]>> {
  return run((actor) => listMyMasterPacks(actor), false)
}

export async function saveMasterPackAction(input: unknown): Promise<PackActionResult<string>> {
  return run((actor) => saveMasterPack(actor, input), true)
}

export async function deleteMasterPackAction(input: unknown): Promise<PackActionResult> {
  return run(async (actor) => {
    await deleteMasterPack(actor, input)
    return null
  }, true)
}
