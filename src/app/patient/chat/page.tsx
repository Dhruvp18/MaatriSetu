import { getChatHistory } from '@/modules/patient-portal/portal.service'
import { getPatientSession } from '../lib/session'
import { getPatientI18n } from '../lib/i18n/server'
import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  const [session, { lang, t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const history = session ? await getChatHistory(session) : []

  return <ChatInterface initialHistory={history} lang={lang} t={t.chat} />
}
