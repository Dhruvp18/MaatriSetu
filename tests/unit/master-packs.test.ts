import { describe, expect, it } from 'vitest'

import { MasterPackInputSchema, SaveMasterPackSchema } from '@modules/master-packs/master-pack.schema'
import { type MasterPack, applyPack, describePack } from '@modules/master-packs/master-pack.types'
import { STARTER_PACKS } from '@modules/master-packs/starter-packs'

const iron = {
  medicineName: 'Ferrous ascorbate + Folic acid',
  form: 'Tab',
  doseAmount: 100,
  doseUnit: 'mg',
  frequency: 'OD',
  foodRelation: 'AFTER_FOOD',
  durationDays: 30,
  instructions: null,
} as const

const calcium = { ...iron, medicineName: 'Calcium carbonate + Vitamin D3', frequency: 'BD' } as const

const pack: MasterPack = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'ANC pack',
  medicines: [iron, calcium],
  labOrders: ['CBC', 'TSH'],
  scanOrders: ['NT scan'],
  counselling: ['DFKC', 'NUTRITION'],
  advice: 'Iron-rich diet',
  version: 1,
  updatedAt: '2026-09-25T00:00:00Z',
}

const empty = { medicineNames: [], labOrders: [], scanOrders: [], counselling: [], advice: '' }

describe('applying a master pack', () => {
  it('adds everything to an empty plan', () => {
    const result = applyPack(empty, pack)
    expect(result.medicines).toHaveLength(2)
    expect(result.labOrders).toEqual(['CBC', 'TSH'])
    expect(result.scanOrders).toEqual(['NT scan'])
    expect(result.counselling).toEqual(['DFKC', 'NUTRITION'])
    expect(result.advice).toBe('Iron-rich diet')
    expect(result.skipped).toEqual([])
  })

  it('skips what is already in the plan, whatever its case, and says so', () => {
    const result = applyPack(
      {
        medicineNames: ['ferrous ascorbate + folic acid '],
        labOrders: ['cbc'],
        scanOrders: [],
        counselling: ['DFKC'],
        advice: 'Rest. iron-rich diet',
      },
      pack,
    )
    expect(result.medicines.map((m) => m.medicineName)).toEqual(['Calcium carbonate + Vitamin D3'])
    // The doctor's own spelling stays; the pack's is not added beside it.
    expect(result.labOrders).toEqual(['cbc', 'TSH'])
    expect(result.counselling).toEqual(['DFKC', 'NUTRITION'])
    expect(result.advice).toBe('Rest. iron-rich diet')
    expect(result.skipped).toEqual([
      'Ferrous ascorbate + Folic acid',
      'CBC',
      'Daily fetal kick count explained',
      'Advice',
    ])
  })

  it('appends advice on the same line, since the field is one line', () => {
    expect(applyPack({ ...empty, advice: 'Review in 4 weeks' }, pack).advice).toBe(
      'Review in 4 weeks; Iron-rich diet',
    )
  })

  it('does not add the same medicine twice from one pack', () => {
    const doubled = { ...pack, medicines: [iron, { ...iron, medicineName: 'FERROUS ASCORBATE + FOLIC ACID' }] }
    const result = applyPack(empty, doubled)
    expect(result.medicines).toHaveLength(1)
    expect(result.skipped).toContain('FERROUS ASCORBATE + FOLIC ACID')
  })

  it('applying twice adds nothing the second time', () => {
    const first = applyPack(empty, pack)
    const second = applyPack(
      {
        medicineNames: first.medicines.map((m) => m.medicineName),
        labOrders: first.labOrders,
        scanOrders: first.scanOrders,
        counselling: first.counselling,
        advice: first.advice,
      },
      pack,
    )
    expect(second.added).toEqual([])
    expect(second.medicines).toEqual([])
  })
})

describe('master pack validation', () => {
  it('refuses an empty pack', () => {
    expect(MasterPackInputSchema.safeParse({ name: 'Nothing' }).success).toBe(false)
  })

  it('accepts a pack of only lab orders', () => {
    expect(MasterPackInputSchema.safeParse({ name: 'Labs', labOrders: ['CBC'] }).success).toBe(true)
  })

  it('refuses a dose amount without its unit', () => {
    const result = MasterPackInputSchema.safeParse({
      name: 'Bad',
      medicines: [{ ...iron, doseUnit: null }],
    })
    expect(result.success).toBe(false)
  })

  it('needs a version with every edit, and none with a new pack', () => {
    const body = { name: 'Labs', labOrders: ['CBC'] }
    expect(SaveMasterPackSchema.safeParse({ pack: body }).success).toBe(true)
    expect(
      SaveMasterPackSchema.safeParse({ packId: '00000000-0000-4000-8000-000000000001', pack: body }).success,
    ).toBe(false)
  })

  it('every starter pack is itself a valid pack', () => {
    expect(STARTER_PACKS.length).toBeGreaterThan(0)
    for (const starter of STARTER_PACKS) {
      expect(MasterPackInputSchema.safeParse(starter).success, starter.name).toBe(true)
      expect(starter.medicines.length, starter.name).toBeGreaterThan(0)
    }
  })

  it('summarises what a pack holds', () => {
    expect(describePack(pack)).toBe('2 medicines · 2 labs · 1 scan · 2 counselling points · advice')
  })
})
