import { describe, expect, it } from 'vitest'

import {
  CLINICIAN_ONLY_PERMISSIONS,
  CLINIC_ROLES,
  type ClinicRole,
  type Permission,
  permissionsFor,
  roleHasPermission,
} from '@core/auth/permissions'

/**
 * These tests encode the authorization matrix from
 * docs/development-foundation.md §5. They are deliberately written as
 * prohibitions rather than as a restatement of the table: a test that merely
 * mirrors the implementation catches nothing, whereas each case below fails
 * loudly if someone widens a role to make a feature easier to build.
 */

const rolesExcept = (...except: ClinicRole[]): ClinicRole[] =>
  CLINIC_ROLES.filter((role) => !except.includes(role))

describe('verification is a clinician act', () => {
  it('permits only a doctor to verify an observation', () => {
    expect(roleHasPermission('DOCTOR', 'observation.verify')).toBe(true)

    for (const role of rolesExcept('DOCTOR')) {
      expect(roleHasPermission(role, 'observation.verify')).toBe(false)
    }
  })

  it('lets an assistant correct a candidate but never verify one', () => {
    // Correction is transcription. Verification turns a proposal into a
    // clinical fact and belongs to the clinician alone.
    expect(roleHasPermission('ASSISTANT', 'upload.correct_candidates')).toBe(true)
    expect(roleHasPermission('ASSISTANT', 'observation.verify')).toBe(false)
  })

  it('permits only a doctor to save or amend a consultation', () => {
    for (const permission of ['visit.save', 'visit.amend'] as const) {
      expect(roleHasPermission('DOCTOR', permission)).toBe(true)
      for (const role of rolesExcept('DOCTOR')) {
        expect(roleHasPermission(role, permission)).toBe(false)
      }
    }
  })
})

describe('administration does not imply clinical access', () => {
  it('grants an admin membership management and audit review only', () => {
    expect(permissionsFor('ADMIN')).toEqual(new Set(['membership.manage', 'audit.read']))
  })

  it('denies an admin every clinical read and write', () => {
    const clinical: Permission[] = [
      'patient.read',
      'pregnancy.read',
      'visit.read',
      'visit.save',
      'observation.read',
      'observation.verify',
      'prescription.read',
      'prescription.write',
      'referral.issue',
      'query.read',
    ]

    for (const permission of clinical) {
      expect(roleHasPermission('ADMIN', permission)).toBe(false)
    }
  })

  it('denies every non-admin role the ability to manage membership', () => {
    for (const role of rolesExcept('ADMIN')) {
      expect(roleHasPermission(role, 'membership.manage')).toBe(false)
    }
  })
})

describe('prescription data is restricted by default', () => {
  it('exposes prescriptions to doctors only', () => {
    expect(roleHasPermission('DOCTOR', 'prescription.read')).toBe(true)
    expect(roleHasPermission('DOCTOR', 'prescription.write')).toBe(true)

    for (const role of rolesExcept('DOCTOR')) {
      expect(roleHasPermission(role, 'prescription.read')).toBe(false)
      expect(roleHasPermission(role, 'prescription.write')).toBe(false)
    }
  })
})

describe('assistants get the minimum needed to attach a slip', () => {
  it('allows patient search but not full demographic read', () => {
    expect(roleHasPermission('ASSISTANT', 'patient.search')).toBe(true)
    expect(roleHasPermission('ASSISTANT', 'patient.read')).toBe(false)
  })

  it('denies assistants every clinical surface', () => {
    const denied: Permission[] = [
      'visit.open',
      'visit.record_vitals',
      'visit.read',
      'observation.read',
      'query.read',
      'referral.read',
      'referral.draft',
      'consent.capture',
    ]

    for (const permission of denied) {
      expect(roleHasPermission('ASSISTANT', permission)).toBe(false)
    }
  })
})

describe('nurses run registration and intake, not clinical decisions', () => {
  it('permits registration, visits, vitals and uploads', () => {
    const allowed: Permission[] = [
      'patient.register',
      'patient.issue_qr',
      'pregnancy.create',
      'visit.open',
      'visit.record_vitals',
      'upload.create',
      'consent.capture',
    ]

    for (const permission of allowed) {
      expect(roleHasPermission('NURSE', permission)).toBe(true)
    }
  })

  it('permits recording a dose actually given', () => {
    // In the labour room the nurse is usually the person who gave it, and that
    // record is what the emergency referral slip depends on.
    expect(roleHasPermission('NURSE', 'medication_administration.record')).toBe(true)
  })

  it('denies issuing a referral and changing dating', () => {
    expect(roleHasPermission('NURSE', 'referral.draft')).toBe(true)
    expect(roleHasPermission('NURSE', 'referral.issue')).toBe(false)
    expect(roleHasPermission('NURSE', 'pregnancy.update_dating')).toBe(false)
  })
})

describe('clinician-only permissions are never held by a non-doctor', () => {
  it('reserves every clinician-only permission to DOCTOR', () => {
    // This is the guard against the worker's elevated database access drifting
    // into clinical authority.
    for (const permission of CLINICIAN_ONLY_PERMISSIONS) {
      expect(roleHasPermission('DOCTOR', permission)).toBe(true)

      for (const role of rolesExcept('DOCTOR')) {
        expect(roleHasPermission(role, permission)).toBe(false)
      }
    }
  })
})

describe('matrix integrity', () => {
  it('defines a permission set for every role', () => {
    for (const role of CLINIC_ROLES) {
      expect(permissionsFor(role)).toBeInstanceOf(Set)
    }
  })

  it('gives no role an empty permission set', () => {
    for (const role of CLINIC_ROLES) {
      expect(permissionsFor(role).size).toBeGreaterThan(0)
    }
  })
})
