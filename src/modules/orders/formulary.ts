import type { DoseFrequency, FoodRelation } from './order.types'

/**
 * The clinic's quick-pick prescription list.
 *
 * A doctor-maintained list of lines this clinic writes every day, so a routine
 * prescription is one tap instead of seven fields. It is the clinic's own
 * shorthand, not a recommendation: nothing in the product selects from it,
 * suggests an item, or checks a dose against a condition (PRD §3). Every line
 * lands in the form fully editable before it is saved.
 *
 * PLACEHOLDER. These entries stand in until the clinic supplies its own list;
 * replace them wholesale rather than editing around them.
 */

export interface FormularyItem {
  readonly id: string
  /** 'Tab', 'Cap', 'Syp', 'Inj'. */
  readonly form: string
  readonly medicineName: string
  readonly doseAmount: number | null
  readonly doseUnit: string | null
  readonly frequency: DoseFrequency
  readonly foodRelation: FoodRelation
  readonly durationDays: number | null
}

export const CLINIC_FORMULARY: readonly FormularyItem[] = [
  { id: 'folic-5', form: 'Tab', medicineName: 'Folic acid', doseAmount: 5, doseUnit: 'mg', frequency: 'OD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'iron-fa', form: 'Tab', medicineName: 'Ferrous ascorbate + Folic acid', doseAmount: 100, doseUnit: 'mg', frequency: 'OD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'calcium-d3', form: 'Tab', medicineName: 'Calcium carbonate + Vitamin D3', doseAmount: 500, doseUnit: 'mg', frequency: 'BD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'dha', form: 'Cap', medicineName: 'DHA (Omega-3)', doseAmount: 200, doseUnit: 'mg', frequency: 'OD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'doxy-pyr', form: 'Tab', medicineName: 'Doxylamine + Pyridoxine', doseAmount: 10, doseUnit: 'mg', frequency: 'HS', foodRelation: 'NOT_SPECIFIED', durationDays: 10 },
  { id: 'pantoprazole', form: 'Tab', medicineName: 'Pantoprazole', doseAmount: 40, doseUnit: 'mg', frequency: 'OD', foodRelation: 'BEFORE_FOOD', durationDays: 10 },
  { id: 'paracetamol', form: 'Tab', medicineName: 'Paracetamol', doseAmount: 500, doseUnit: 'mg', frequency: 'SOS', foodRelation: 'AFTER_FOOD', durationDays: 5 },
  { id: 'antacid', form: 'Syp', medicineName: 'Antacid (Mag. hydroxide + Al. hydroxide)', doseAmount: 10, doseUnit: 'ml', frequency: 'TDS', foodRelation: 'AFTER_FOOD', durationDays: 7 },
  { id: 'b-complex', form: 'Tab', medicineName: 'Vitamin B-complex', doseAmount: null, doseUnit: null, frequency: 'OD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'lactulose', form: 'Syp', medicineName: 'Lactulose', doseAmount: 15, doseUnit: 'ml', frequency: 'HS', foodRelation: 'NOT_SPECIFIED', durationDays: 7 },
  { id: 'labetalol', form: 'Tab', medicineName: 'Labetalol', doseAmount: 100, doseUnit: 'mg', frequency: 'BD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'methyldopa', form: 'Tab', medicineName: 'Methyldopa', doseAmount: 250, doseUnit: 'mg', frequency: 'TDS', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'metformin', form: 'Tab', medicineName: 'Metformin', doseAmount: 500, doseUnit: 'mg', frequency: 'BD', foodRelation: 'AFTER_FOOD', durationDays: 30 },
  { id: 'insulin', form: 'Inj', medicineName: 'Insulin', doseAmount: null, doseUnit: 'units', frequency: 'SOS', foodRelation: 'BEFORE_FOOD', durationDays: 30 },
]

export interface PrescriptionBundle {
  readonly id: string
  readonly name: string
  readonly itemIds: readonly string[]
}

export const PRESCRIPTION_BUNDLES: readonly PrescriptionBundle[] = [
  {
    id: 'anaemia',
    name: 'Anaemia',
    itemIds: ['iron-fa', 'b-complex']
  },
  {
    id: 'hypertension',
    name: 'Hypertension',
    itemIds: ['labetalol', 'methyldopa']
  },
  {
    id: 'diabetes',
    name: 'Diabetes',
    itemIds: ['metformin', 'insulin']
  }
]

/**
 * Formulary lines whose name matches what has been typed, best match first.
 *
 * Used for the medicine field's typeahead. A typed name that matches nothing
 * is still a valid medicine — the list is a shortcut, never a constraint.
 */
export function searchFormulary(query: string, limit = 6): readonly FormularyItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  return CLINIC_FORMULARY.map((item) => {
    const name = item.medicineName.toLowerCase()
    const score = name.startsWith(q)
      ? 0
      : name.split(/[\s+()/-]+/).some((word) => word.startsWith(q))
        ? 1
        : name.includes(q)
          ? 2
          : 3
    return { item, score }
  })
    .filter((entry) => entry.score < 3)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((entry) => entry.item)
}
