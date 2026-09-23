import { getPatientSession } from '../lib/session'
import { getPatientChatHistory } from '../lib/data'
import { ChatInterface } from './chat-interface'

export default async function ChatPage() {
  const session = await getPatientSession()
  const history = session ? await getPatientChatHistory(session) : []

  return (
    <ChatInterface
      patientId={session?.patientId ?? null}
      clinicId={session?.clinicId ?? null}
      initialHistory={history}
    />
  )
}
