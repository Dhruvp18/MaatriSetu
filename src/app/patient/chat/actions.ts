'use server'

import { serviceClient } from '@core/db/clients'
import { serverEnv, providerEnv } from '@core/config/env'

export type TriageLevel = 'CRITICAL' | 'IMPORTANT' | 'NORMAL'

export interface TriageResult {
  triageLevel: TriageLevel
  responseText: string
  clinicPhone: string
}

const SYSTEM_PROMPT = `You are a helpful maternity care assistant for an antenatal clinic in India. Your job is to:
1. Classify the patient's query into exactly one of: CRITICAL, IMPORTANT, or NORMAL
2. Respond with a brief, empathetic, plain-language reply in English (2-3 sentences max)

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
function keywordTriage(query: string): TriageResult & { clinicPhone: string } {
  const q = query.toLowerCase()
  const clinicPhone = serverEnv().CLINIC_PHONE_NUMBER

  const criticalWords = ['bleeding', 'blood', 'pain', 'fits', 'unconscious', 'faint', 'emergency', 'no movement', 'not moving', 'breathless', 'vision', 'swelling']
  const importantWords = ['fever', 'vomit', 'headache', 'reduced movement', 'nausea', 'burning', 'discharge', 'itching']

  if (criticalWords.some(w => q.includes(w))) {
    return { triageLevel: 'CRITICAL', responseText: 'Your symptoms need immediate attention. Please come to the clinic or call us right away.', clinicPhone }
  }
  if (importantWords.some(w => q.includes(w))) {
    return { triageLevel: 'IMPORTANT', responseText: "This should be looked at soon. Please try to visit the clinic tomorrow or call us if it gets worse.", clinicPhone }
  }
  return { triageLevel: 'NORMAL', responseText: 'Thank you for reaching out. Our team will address your question at your next scheduled follow-up visit.', clinicPhone }
}

export async function processPatientQuery(
  query: string,
  patientId: string | null,
  clinicId: string | null,
): Promise<TriageResult & { clinicPhone: string }> {
  const clinicPhone = serverEnv().CLINIC_PHONE_NUMBER
  const geminiKey = providerEnv().GEMINI_API_KEY

  let triageLevel: TriageLevel
  let responseText: string

  if (!geminiKey) {
    // No API key — use keyword fallback (visibly labelled in UI)
    return keywordTriage(query)
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: query }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 256 },
        }),
      },
    )

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)

    const json = await res.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const parsed = JSON.parse(text)

    triageLevel = parsed.triage as TriageLevel
    responseText = parsed.response as string

    if (!['CRITICAL', 'IMPORTANT', 'NORMAL'].includes(triageLevel)) {
      throw new Error('Invalid triage level from Gemini')
    }
  } catch (err) {
    console.error('Gemini triage failed, using keyword fallback:', err)
    return keywordTriage(query)
  }

  // Persist to database
  if (patientId && clinicId) {
    try {
      const db = serviceClient()
      await db.from('patient_queries').insert({
        clinic_id: clinicId,
        patient_id: patientId,
        query_text: query,
        bot_response: responseText,
        triage_level: triageLevel,
      })
    } catch (err) {
      // Non-fatal: the patient still gets a response even if saving fails
      console.error('Failed to save patient query to database:', err)
    }
  }

  return { triageLevel, responseText, clinicPhone }
}
