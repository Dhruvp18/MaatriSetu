import { z } from 'zod'

/** What the portal accepts from a phone. Parsed, never cast (ARCH-6). */

export const PatientQueryTextSchema = z
  .string()
  .trim()
  .min(1, 'Type a question first.')
  .max(2000, 'That message is too long.')

export const QrResolveSchema = z.object({
  clinicId: z.uuid(),
  token: z.string().min(16).max(256),
})

/** Her UHID plus her portal password. Neither is parsed further — a wrong shape and a wrong value fail the same authentication check. */
export const PatientLoginSchema = z.object({
  uhid: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
})

/** Same ceiling and formats as a staff upload (report.schema.ts). */
export const PORTAL_UPLOAD_MAX_BYTES = 12 * 1024 * 1024

export const PORTAL_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const

export const PortalUploadSchema = z.object({
  contentType: z.enum(PORTAL_UPLOAD_TYPES),
  byteSize: z.number().int().positive().max(PORTAL_UPLOAD_MAX_BYTES),
})

/** The chatbot model's reply. Model output is untrusted input. */
export const TriageReplySchema = z.object({
  triage: z.enum(['CRITICAL', 'IMPORTANT', 'NORMAL']),
  response: z.string().trim().min(1),
})
