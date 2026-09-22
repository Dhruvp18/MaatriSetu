import { describe, expect, it } from 'vitest'

import { LEXICON_VERSION, route } from '@modules/voice/triage-lexicon'

/**
 * The routing rules, tested as behaviour rather than as a restatement of the
 * phrase list.
 *
 * The bias under test is one-directional: every ambiguity must resolve toward a
 * human reading the message sooner. A false PRIORITY_REVIEW costs a clinician
 * fifteen seconds; a false INFORMATIONAL can bury a danger sign in a queue
 * nobody opens.
 */

describe('danger signs reach a human quickly', () => {
  it('routes the PRD danger signs as priority', () => {
    const messages = [
      'I have bleeding since morning',
      'I have a severe headache and my vision is blurring',
      'The baby has no movement since last night',
      'She had a fit this morning',
      'My water broke',
    ]

    for (const message of messages) {
      expect(route(null, message).bucket).toBe('PRIORITY_REVIEW')
    }
  })

  it('matches her own words when translation failed', () => {
    // A failed translation must not blind the routing — the original is always
    // matched too.
    expect(route('मला खूप डोकेदुखी आहे', null).bucket).toBe('PRIORITY_REVIEW')
    expect(route('रक्तस्राव होत आहे', null).bucket).toBe('PRIORITY_REVIEW')
    expect(route('બાળકની હલનચલન ઓછી લાગે છે', null).bucket).toBe('PRIORITY_REVIEW')
  })

  it('records which phrases matched, so the decision can be explained', () => {
    const decision = route(null, 'I have bleeding and a severe headache')

    expect(decision.matchedPhrases.length).toBeGreaterThan(0)
    expect(decision.lexiconVersion).toBe(LEXICON_VERSION)
  })
})

describe('urgency wins over routine content', () => {
  it('routes a mixed message as priority', () => {
    // "My head is splitting, also when is my next visit" is an urgent message
    // that happens to contain an appointment question.
    const decision = route(
      null,
      'I have a severe headache, also please tell me my next appointment date',
    )

    expect(decision.bucket).toBe('PRIORITY_REVIEW')
  })
})

describe('routine questions are recognised but never answered automatically', () => {
  it('routes medication timing and appointments as informational', () => {
    expect(route(null, 'Can I take calcium and iron together?').bucket).toBe('INFORMATIONAL')
    expect(route(null, 'Madam when is my next visit').bucket).toBe('INFORMATIONAL')
    expect(route('तारीख काय आहे', null).bucket).toBe('INFORMATIONAL')
  })

  it('still carries the phrases that produced the decision', () => {
    // Even the informational bucket must be explainable — a clinician may
    // disagree with the routing and needs to see why it happened.
    expect(route(null, 'about my calcium tablet').matchedPhrases.length).toBeGreaterThan(0)
  })
})

describe('silence is not reassurance', () => {
  it('sends an unmatched message to a human rather than filing it as routine', () => {
    const decision = route(null, 'Madam I wanted to ask you something please call me')

    expect(decision.bucket).toBe('NEEDS_REVIEW')
    expect(decision.matchedPhrases).toEqual([])
  })

  it('sends an empty transcription to a human', () => {
    // A note that transcribed to nothing is the most suspicious case of all.
    expect(route(null, null).bucket).toBe('NEEDS_REVIEW')
    expect(route('', '').bucket).toBe('NEEDS_REVIEW')
  })

  it('never returns INFORMATIONAL for an unrecognised phrase', () => {
    for (const message of [
      'hello',
      'ठीक आहे',
      'I am fine today',
      '...',
    ]) {
      expect(route(null, message).bucket).not.toBe('INFORMATIONAL')
    }
  })
})

describe('matching tolerates how people actually write', () => {
  it('ignores case and punctuation', () => {
    expect(route(null, 'BLEEDING!!!').bucket).toBe('PRIORITY_REVIEW')
    expect(route(null, 'Severe   headache...').bucket).toBe('PRIORITY_REVIEW')
  })
})

describe('the lexicon is versioned', () => {
  it('declares itself unreviewed until a clinician signs it off', () => {
    // A release gate, not a formality: routing patient messages on phrases no
    // clinician has read is not something to do quietly.
    expect(LEXICON_VERSION).toContain('unreviewed')
  })
})
