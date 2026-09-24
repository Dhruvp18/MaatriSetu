import { getPatientSession } from '../lib/session'
import { getPatientChatHistory } from '../lib/data'
import { getPatientI18n } from '../lib/i18n/server'
import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  const [session, { lang, t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const history = session ? await getPatientChatHistory(session) : []

  return (
    <ChatInterface
      patientId={session?.patientId ?? null}
      clinicId={session?.clinicId ?? null}
      initialHistory={history}
      lang={lang}
      t={t.chat}
    />
  )
}
