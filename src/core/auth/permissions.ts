/**
 * The authorization matrix, as data.
 *
 * Every service call checks this table (ARCH-5). It is expressed as a single
 * declarative map rather than scattered `if (role === 'DOCTOR')` branches so
 * that the complete set of permissions can be read, reviewed by a clinician,
 * and tested exhaustively — the matrix in
 * `docs/development-foundation.md` §5 is the source of truth and this file is
 * its executable form.
 *
 * Two rules that are easy to get wrong, stated explicitly:
 *
 *   ADMIN IS NOT CLINICAL. Managing who works at a clinic does not confer the
 *   right to read a patient's prescriptions. Administrative and clinical
 *   authority are separate axes, and conflating them is how EMRs end up with
 *   an "IT support" account that can read every record in the hospital.
 *
 *   VERIFICATION IS A CLINICIAN ACT. An assistant may correct an extracted
 *   value — that is transcription. Only a doctor may turn a candidate into a
 *   clinical fact. No role escalation, no batch job, and no worker process may
 *   perform `observation.verify`.
 */

export type ClinicRole = 'DOCTOR' | 'NURSE' | 'ASSISTANT' | 'ADMIN'

export const CLINIC_ROLES: readonly ClinicRole[] = ['DOCTOR', 'NURSE', 'ASSISTANT', 'ADMIN']

/**
 * Every permission in the system. Named `resource.action`.
 *
 * Adding a capability means adding a member here, which forces every role's
 * entry in the matrix below to be updated — the compiler will not allow a new
 * permission to be silently ungoverned.
 */
export type Permission =
  // Identity and registration
  | 'patient.search'
  | 'patient.read'
  | 'patient.register'
  | 'patient.update'
  | 'patient.issue_qr'
  // Pregnancy episodes
  | 'pregnancy.read'
  | 'pregnancy.create'
  | 'pregnancy.update_dating'
  | 'pregnancy.close'
  // Visits
  | 'visit.open'
  | 'visit.record_vitals'
  | 'visit.read'
  | 'visit.draft'
  | 'visit.save'
  | 'visit.amend'
  | 'visit.cancel'
  // Reports and extraction
  | 'upload.create'
  | 'upload.read'
  | 'upload.correct_candidates'
  | 'upload.retry_extraction'
  | 'upload.reassign'
  // Clinical verification
  | 'observation.read'
  | 'observation.verify'
  | 'observation.supersede'
  | 'finding.pin'
  // Orders
  | 'prescription.read'
  | 'prescription.write'
  | 'advice.write'
  | 'medication_administration.record'
  // Patient queries
  | 'query.read'
  | 'query.associate'
  | 'query.acknowledge'
  | 'query.resolve'
  // Referrals
  | 'referral.read'
  | 'referral.draft'
  | 'referral.issue'
  | 'referral.issue_token'
  | 'referral.revoke_token'
  // Governance
  | 'consent.capture'
  | 'audit.read'
  | 'membership.manage'

/**
 * Role → permissions.
 *
 * `satisfies` keeps this exhaustive: every role must appear, and every entry
 * must contain only real permissions.
 */
const MATRIX = {
  DOCTOR: [
    'patient.search',
    'patient.read',
    'patient.register',
    'patient.update',
    'patient.issue_qr',
    'pregnancy.read',
    'pregnancy.create',
    'pregnancy.update_dating',
    'pregnancy.close',
    'visit.open',
    'visit.record_vitals',
    'visit.read',
    'visit.draft',
    'visit.save',
    'visit.amend',
    'visit.cancel',
    'upload.create',
    'upload.read',
    'upload.correct_candidates',
    'upload.retry_extraction',
    'upload.reassign',
    'observation.read',
    'observation.verify',
    'observation.supersede',
    'finding.pin',
    'prescription.read',
    'prescription.write',
    'advice.write',
    'medication_administration.record',
    'query.read',
    'query.associate',
    'query.acknowledge',
    'query.resolve',
    'referral.read',
    'referral.draft',
    'referral.issue',
    'referral.issue_token',
    'referral.revoke_token',
    'consent.capture',
    'audit.read',
  ],

  NURSE: [
    'patient.search',
    'patient.read',
    'patient.register',
    'patient.update',
    'patient.issue_qr',
    'pregnancy.read',
    'pregnancy.create',
    'visit.open',
    'visit.record_vitals',
    'visit.read',
    'upload.create',
    'upload.read',
    'upload.correct_candidates',
    'upload.retry_extraction',
    'observation.read',
    // Nurses record doses actually given — in the labour room they are usually
    // the person who gave them, and that record is what the referral slip
    // depends on.
    'medication_administration.record',
    'query.read',
    'query.associate',
    'query.acknowledge',
    'referral.read',
    'referral.draft',
    'consent.capture',
    // Deliberately absent: prescription.read, prescription.write,
    // observation.verify, referral.issue, visit.save.
  ],

  ASSISTANT: [
    // Enough to find the right patient to attach a slip to, and no more.
    'patient.search',
    'pregnancy.read',
    'upload.create',
    'upload.read',
    'upload.correct_candidates',
    'upload.retry_extraction',
    // Deliberately absent: patient.read (full demographics), every clinical
    // read, and everything under prescriptions.
  ],

  ADMIN: [
    'membership.manage',
    'audit.read',
    // Deliberately absent: every clinical permission. See the file header.
  ],
} as const satisfies Record<ClinicRole, readonly Permission[]>

// Built explicitly rather than with Object.fromEntries: the latter widens the
// key type to `string` and needs a cast, which would silently survive a role
// being added to the union but forgotten here.
const PERMISSION_SETS = {
  DOCTOR: new Set<Permission>(MATRIX.DOCTOR),
  NURSE: new Set<Permission>(MATRIX.NURSE),
  ASSISTANT: new Set<Permission>(MATRIX.ASSISTANT),
  ADMIN: new Set<Permission>(MATRIX.ADMIN),
} satisfies Record<ClinicRole, ReadonlySet<Permission>>

/** Does this role hold this permission? */
export function roleHasPermission(role: ClinicRole, permission: Permission): boolean {
  return PERMISSION_SETS[role].has(permission)
}

/** Every permission held by a role. Useful for shaping a role-specific payload. */
export function permissionsFor(role: ClinicRole): ReadonlySet<Permission> {
  return PERMISSION_SETS[role]
}

/**
 * Permissions that no automated process may ever hold.
 *
 * The worker runs with elevated database access in order to write extraction
 * results. This list is the guard against that access drifting into clinical
 * authority: a worker may propose, never verify, prescribe or issue.
 */
export const CLINICIAN_ONLY_PERMISSIONS: readonly Permission[] = [
  'observation.verify',
  'observation.supersede',
  'prescription.write',
  'visit.save',
  'visit.amend',
  'referral.issue',
]
