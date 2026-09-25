import { CLINIC_FORMULARY } from '@modules/orders/formulary'

import type { MasterPackInput } from './master-pack.schema'

/**
 * The packs every doctor starts with.
 *
 * Copied into a doctor's own list the first time she opens her packs, and from
 * then on they are hers: renamed, edited or deleted like any pack she made.
 * Deleting them all does not bring them back.
 *
 * PLACEHOLDER, like the formulary they are built from: the clinic's own sets
 * replace them.
 */

const STARTERS: ReadonlyArray<{
  name: string
  itemIds: readonly string[]
  labOrders?: readonly string[]
  scanOrders?: readonly string[]
}> = [
  {
    name: 'Normal ANC',
    itemIds: ['iron-fa', 'calcium-d3'],
    labOrders: ['CBC', 'Urine routine & microscopy', 'Blood group & Rh typing', 'HIV 1 & 2', 'HBsAg', 'VDRL', 'TSH'],
    scanOrders: ['Obstetric USG'],
  },
  {
    name: 'Anaemia',
    itemIds: ['iron-fa', 'b-complex'],
    labOrders: ['Serum ferritin', 'Peripheral smear', 'HPLC'],
  },
  {
    name: 'Hypertension',
    itemIds: ['labetalol', 'methyldopa'],
    labOrders: ['Urine protein : creatinine ratio', 'LFT', 'RFT'],
  },
  {
    name: 'Diabetes',
    itemIds: ['metformin', 'insulin'],
    labOrders: ['HbA1c', 'FBS', 'PPBS'],
  },
]

export const STARTER_PACKS: readonly MasterPackInput[] = STARTERS.map((starter) => ({
  name: starter.name,
  medicines: starter.itemIds
    .map((id) => CLINIC_FORMULARY.find((item) => item.id === id))
    .filter((item) => item !== undefined)
    .map((item) => ({
      medicineName: item.medicineName,
      form: item.form,
      doseAmount: item.doseAmount,
      // A unit with no amount is not a dose (the prescription schema refuses it).
      doseUnit: item.doseAmount !== null ? item.doseUnit : null,
      frequency: item.frequency,
      foodRelation: item.foodRelation,
      durationDays: item.durationDays,
      instructions: null,
    })),
  labOrders: [...(starter.labOrders ?? [])],
  scanOrders: [...(starter.scanOrders ?? [])],
  counselling: [],
  advice: null,
}))
