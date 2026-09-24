import { describe, expect, it } from 'vitest'

import { toRecordedList, toYesNo } from '@modules/history/history.mapper'
import { describeRecordedList } from '@modules/history/history.types'
import { searchFormulary } from '@modules/orders/formulary'
import { LAB_INVESTIGATIONS, searchInvestigations } from '@modules/orders/investigations'
import { formatDosing } from '@modules/orders/order.types'

import { formatWeight } from '../../src/components/cockpit/header-banner'

describe('investigation type-ahead completes like a search box', () => {
  it('offers CBC first for "c"', () => {
    expect(searchInvestigations(LAB_INVESTIGATIONS, 'c')[0]?.name).toBe('CBC')
  })

  it('matches on aliases, not only names', () => {
    expect(searchInvestigations(LAB_INVESTIGATIONS, 'thyroid').map((i) => i.name)).toContain('TSH')
  })

  it('does not offer a test already ordered', () => {
    expect(searchInvestigations(LAB_INVESTIGATIONS, 'c', ['CBC']).map((i) => i.name)).not.toContain('CBC')
  })

  it('offers nothing for an empty query', () => {
    expect(searchInvestigations(LAB_INVESTIGATIONS, '  ')).toEqual([])
  })
})

describe('the formulary is a shortcut, not a constraint', () => {
  it('finds a drug by any word of its name', () => {
    expect(searchFormulary('ascorbate').map((i) => i.id)).toContain('iron-fa')
  })

  it('finds nothing for an unlisted drug, which may still be typed', () => {
    expect(searchFormulary('warfarin')).toEqual([])
  })
})

describe('dosing is written in the prescription-pad notation', () => {
  it('pairs the pattern with the abbreviation', () => {
    expect(formatDosing('OD')).toBe('1-0-0 (OD)')
    expect(formatDosing('BD')).toBe('1-0-1 (BD)')
    expect(formatDosing('TDS')).toBe('1-1-1 (TDS)')
    expect(formatDosing('HS')).toBe('0-0-1 (HS)')
  })

  it('invents no pattern for a dose that is not daily', () => {
    expect(formatDosing('SOS')).toBe('SOS')
    expect(formatDosing('WEEKLY')).toBe('Weekly')
  })
})

describe('weight is shown against her own baseline', () => {
  it('writes a gain as baseline + change', () => {
    expect(formatWeight(55, 60)?.text).toBe('55 + 5 kg')
  })

  it('writes a loss with a minus', () => {
    expect(formatWeight(60, 58.5)?.text).toBe('60 − 1.5 kg')
  })

  it('labels a baseline shown in place of today’s weight', () => {
    expect(formatWeight(55, null)).toEqual({ text: '55 kg', note: 'initial' })
  })

  it('shows today’s weight alone when there is no baseline', () => {
    expect(formatWeight(null, 60)?.text).toBe('60 kg')
  })
})

describe('"not recorded" and "none" stay different (ARCH-10)', () => {
  it('maps a NULL list to not recorded, and an empty one to none', () => {
    expect(describeRecordedList(toRecordedList(null))).toBe('Not recorded')
    expect(describeRecordedList(toRecordedList([]))).toBe('None')
  })

  it('drops codes outside the allowed set rather than trusting them', () => {
    expect(toRecordedList(['PIH', 'MADE_UP'], ['PIH'] as const)).toEqual({ kind: 'RECORDED', items: ['PIH'] })
  })

  it('keeps no and not-asked apart', () => {
    expect(toYesNo(false)).toBe('NO')
    expect(toYesNo(null)).toBe('NOT_RECORDED')
  })
})
