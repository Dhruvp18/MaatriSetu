import type { DoseFrequency, FoodRelation } from '@modules/orders/order.types'

/**
 * Master packs — a doctor's own one-click prescription sets.
 *
 * A pack is the doctor's shorthand for what she writes again and again: any
 * mix of medicine lines, lab and scan orders, counselling points and advice.
 * It belongs to the doctor who made it and nobody else sees it.
 *
 * It is never a recommendation: nothing in the product chooses a pack, offers
 * one for a condition, or applies one on its own (PRD §3). Applying a pack only
 * fills today's consultation, every line still editable, and nothing is
 * ordered until Save & Next.
 *
 * This file is shared with the browser, so it holds types and pure functions only.
 */

/** The consultation's counselling checkboxes, by the key a pack stores. */
export type CounsellingKey = 'DFKC' | 'NUTRITION' | 'LEFT_LATERAL_REST' | 'DANGER_SIGNS'

export const COUNSELLING: ReadonlyArray<{ readonly key: CounsellingKey; readonly label: string }> = [
  { key: 'DFKC', label: 'Daily fetal kick count explained' },
  { key: 'NUTRITION', label: 'Nutrition counselling' },
  { key: 'LEFT_LATERAL_REST', label: 'Left lateral rest' },
  { key: 'DANGER_SIGNS', label: 'Danger signs explained' },
]

/** One medicine line, in the consultation's own shape. */
export interface PackMedicine {
  readonly medicineName: string
  readonly form: string | null
  readonly doseAmount: number | null
  readonly doseUnit: string | null
  readonly frequency: DoseFrequency
  readonly foodRelation: FoodRelation
  readonly durationDays: number | null
  readonly instructions: string | null
}

export interface MasterPack {
  readonly id: string
  readonly name: string
  readonly medicines: readonly PackMedicine[]
  readonly labOrders: readonly string[]
  readonly scanOrders: readonly string[]
  readonly counselling: readonly CounsellingKey[]
  readonly advice: string | null
  readonly version: number
  readonly updatedAt: string
}

/** What a pack holds, in a few words: `3 medicines · 7 labs · 1 scan`. */
export function describePack(pack: Pick<MasterPack, 'medicines' | 'labOrders' | 'scanOrders' | 'counselling' | 'advice'>): string {
  const count = (n: number, one: string, many: string) => (n > 0 ? `${n} ${n === 1 ? one : many}` : null)
  return (
    [
      count(pack.medicines.length, 'medicine', 'medicines'),
      count(pack.labOrders.length, 'lab', 'labs'),
      count(pack.scanOrders.length, 'scan', 'scans'),
      count(pack.counselling.length, 'counselling point', 'counselling points'),
      pack.advice ? 'advice' : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'empty'
  )
}

/** Today's plan as it stands on screen, before a pack is applied. */
export interface PlanSnapshot {
  readonly medicineNames: readonly string[]
  readonly labOrders: readonly string[]
  readonly scanOrders: readonly string[]
  readonly counselling: readonly CounsellingKey[]
  readonly advice: string
}

export interface AppliedPack {
  /** Medicine lines to append — only the ones not already on today's Rx. */
  readonly medicines: readonly PackMedicine[]
  readonly labOrders: readonly string[]
  readonly scanOrders: readonly string[]
  readonly counselling: readonly CounsellingKey[]
  readonly advice: string
  /** Everything the pack brought in, by name, for the notice. */
  readonly added: readonly string[]
  /** Everything already in today's plan and therefore left alone. */
  readonly skipped: readonly string[]
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Merge a pack into today's plan.
 *
 * Whatever is already there wins: a medicine already on the Rx keeps the
 * doctor's own dose and schedule, and a test already ordered is not ordered
 * twice. Those are reported as skipped so she can see why nothing changed.
 */
export function applyPack(plan: PlanSnapshot, pack: MasterPack): AppliedPack {
  const added: string[] = []
  const skipped: string[] = []

  const medicines: PackMedicine[] = []
  for (const line of pack.medicines) {
    const taken = [...plan.medicineNames, ...medicines.map((m) => m.medicineName)]
    if (taken.some((name) => same(name, line.medicineName))) {
      skipped.push(line.medicineName)
    } else {
      medicines.push(line)
      added.push(line.medicineName)
    }
  }

  const merge = (current: readonly string[], incoming: readonly string[]): string[] => {
    const next = [...current]
    for (const entry of incoming) {
      if (next.some((value) => same(value, entry))) {
        skipped.push(entry)
      } else {
        next.push(entry)
        added.push(entry)
      }
    }
    return next
  }

  const labOrders = merge(plan.labOrders, pack.labOrders)
  const scanOrders = merge(plan.scanOrders, pack.scanOrders)

  const counselling = [...plan.counselling]
  for (const key of pack.counselling) {
    const label = COUNSELLING.find((c) => c.key === key)?.label ?? key
    if (counselling.includes(key)) {
      skipped.push(label)
    } else {
      counselling.push(key)
      added.push(label)
    }
  }

  let advice = plan.advice
  const packAdvice = pack.advice?.trim()
  if (packAdvice) {
    if (advice.toLowerCase().includes(packAdvice.toLowerCase())) {
      skipped.push('Advice')
    } else {
      // One line: the consultation's advice field is a single-line input.
      advice = advice.trim() ? `${advice.trim()}; ${packAdvice}` : packAdvice
      added.push('Advice')
    }
  }

  return { medicines, labOrders, scanOrders, counselling, advice, added, skipped }
}
