'use server'

import { serverEnv, providerEnv } from '@core/config/env'
import { TriageReplySchema } from '@/modules/patient-portal/portal.schema'
import { recordQuestion } from '@/modules/patient-portal/portal.service'
import type { TriageLevel } from '@/modules/patient-portal/portal.types'
import { DEFAULT_LANG, isLang, type Lang } from '../lib/i18n/locales'
import { getDictionary } from '../lib/i18n/dictionaries'
import { getPatientSession } from '../lib/session'

export interface TriageResult {
  triageLevel: TriageLevel
  responseText: string
  clinicPhone: string
}

const REPLY_LANGUAGE: Record<Lang, string> = {
  en: 'English',
  hi: 'Hindi, written in Devanagari script',
  mr: 'Marathi, written in Devanagari script',
}

const buildSystemPrompt = (lang: Lang) => `You are a helpful maternity care assistant for an antenatal clinic in India. Your job is to:
1. Classify the patient's query into exactly one of: CRITICAL, IMPORTANT, or NORMAL
2. Respond with a brief, empathetic, plain-language reply in ${REPLY_LANGUAGE[lang]} (2-3 sentences max). Reply in this language even if the patient writes in another language or in romanised text. Keep the JSON keys and the triage value in English.

RULES — strictly follow these:
- NEVER prescribe medicines, dosages, or clinical treatments
- NEVER diagnose a condition
- NEVER say whether a result is "normal" or "abnormal" — only the doctor can judge that
- ALWAYS recommend the patient speak with her doctor for medical decisions
- For general non-medical questions (nutrition, lifestyle, schemes) you may answer briefly and helpfully

TRIAGE DEFINITIONS:
- CRITICAL: Symptoms that may need immediate attention (bleeding, severe pain, fits, no fetal movement, high fever, breathlessness, vision changes, swelling in face/hands)
- IMPORTANT: Concerns that should be addressed soon — within 24 hours (mild fever, persistent headache, vomiting, reduced fetal movement compared to usual)
- NORMAL: Routine questions, general wellbeing, diet, scheme information, advice the doctor already gave — can wait for the next scheduled visit

RESPONSE FORMAT — reply ONLY with valid JSON, nothing else:
{
  "triage": "CRITICAL" | "IMPORTANT" | "NORMAL",
  "response": "Your reply text here"
}`

/** Keyword-based fallback triage when no Gemini key is configured. */
function keywordTriage(query: string, lang: Lang): TriageResult & { clinicPhone: string } {
  const q = query.toLowerCase()
  const clinicPhone = serverEnv().CLINIC_PHONE_NUMBER
  const replies = getDictionary(lang).chat.fallback

  // Matched whatever language is selected: a mother may type in any of them.
  const criticalWords = [
    'bleeding', 'blood', 'pain', 'fits', 'unconscious', 'faint', 'emergency', 'no movement', 'not moving', 'breathless', 'vision', 'swelling',
    'खून', 'रक्त', 'दर्द', 'वेदना', 'झटके', 'बेहोश', 'बेशुद्ध', 'हलचल नहीं', 'हालचाल नाही', 'सांस', 'श्वास', 'धुंधला', 'धूसर', 'सूजन', 'सूज',
  ]
  const importantWords = [
    'fever', 'vomit', 'headache', 'reduced movement', 'nausea', 'burning', 'discharge', 'itching',
    'बुखार', 'ताप', 'उल्टी', 'उलटी', 'सिरदर्द', 'डोकेदुखी', 'मतली', 'मळमळ', 'जलन', 'जळजळ', 'खुजली', 'खाज',
  ]

  if (criticalWords.some(w => q.includes(w))) {
    return { triageLevel: 'CRITICAL', responseText: replies.critical, clinicPhone }
  }
  if (importantWords.some(w => q.includes(w))) {
    return { triageLevel: 'IMPORTANT', responseText: replies.important, clinicPhone }
  }
  return { triageLevel: 'NORMAL', responseText: replies.normal, clinicPhone }
}

export async function processPatientQuery(
  query: string,
  requestedLang?: string,
): Promise<TriageResult & { clinicPhone: string }> {
  const clinicPhone = serverEnv().CLINIC_PHONE_NUMBER
  const { GEMINI_API_KEY: geminiKey, GEMINI_MODEL: geminiModel } = providerEnv()
  // Server actions take client input; never trust it to be a known language.
  const lang = isLang(requestedLang) ? requestedLang : DEFAULT_LANG

  const result = geminiKey
    ? await geminiTriage(query, lang, geminiKey, geminiModel, clinicPhone)
    : // No API key — keyword fallback (visibly labelled in UI).
      keywordTriage(query, lang)

  // Logged whichever path answered: a CRITICAL question caught by the keyword
  // fallback matters to the clinic as much as one Gemini classified.
  const session = await getPatientSession()
  if (session) {
    try {
      await recordQuestion(session, {
        queryText: query,
        botResponse: result.responseText,
        triageLevel: result.triageLevel,
      })
    } catch (err) {
      // Non-fatal: the patient still gets a response even if saving fails.
      console.error('Failed to save patient query:', err)
    }
  }

  return result
}

async function geminiTriage(
  query: string,
  lang: Lang,
  apiKey: string,
  model: string,
  clinicPhone: string,
): Promise<TriageResult & { clinicPhone: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        // In a header rather than the URL, so it never lands in a request log.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildSystemPrompt(lang) }] },
          contents: [{ role: 'user', parts: [{ text: query }] }],
          // Gemini 3 models spend thinking tokens from this budget, and
          // Devanagari costs several times more than English; 512 cut the
          // JSON off mid-string.
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 },
        }),
      },
    )

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)

    const json = await res.json()
    const parts: { text?: string; thought?: boolean }[] = json.candidates?.[0]?.content?.parts ?? []
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')

    // Model output is untrusted input (ARCH-6).
    const parsed = TriageReplySchema.parse(JSON.parse(text))
    return { triageLevel: parsed.triage, responseText: parsed.response, clinicPhone }
  } catch (err) {
    console.error('Gemini triage failed, using keyword fallback:', err)
    return keywordTriage(query, lang)
  }
}
