'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, User, Send, Mic, AlertTriangle, CalendarHeart, Info } from 'lucide-react'
import { processPatientQuery } from './actions'
import type { PatientQuery } from '@/modules/patient-portal/portal.types'
import type { Lang } from '../lib/i18n/locales'
import type { Dict } from '../lib/i18n/dictionaries'

type Message = {
  id: string
  role: 'user' | 'bot'
  text: string
  triageLevel?: 'CRITICAL' | 'IMPORTANT' | 'NORMAL'
  clinicPhone?: string
}

function historyToMessages(history: readonly PatientQuery[]): Message[] {
  const msgs: Message[] = []
  for (const row of history) {
    msgs.push({ id: `u-${row.id}`, role: 'user', text: row.queryText })
    msgs.push({ id: `b-${row.id}`, role: 'bot', text: row.botResponse, triageLevel: row.triageLevel })
  }
  return msgs
}

export function ChatInterface({
  initialHistory,
  lang,
  t,
}: {
  initialHistory: readonly PatientQuery[]
  lang: Lang
  t: Dict['chat']
}) {
  // Built from props rather than held in state so it follows a language switch.
  const welcome: Message = { id: 'welcome', role: 'bot', text: t.welcome }
  const [conversation, setMessages] = useState<Message[]>(() => historyToMessages(initialHistory))
  const messages = [welcome, ...conversation]
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      // Who is asking comes from the signed session on the server, never from here.
      const result = await processPatientQuery(text, lang)
      const botMsg: Message = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: result.responseText,
        triageLevel: result.triageLevel,
        clinicPhone: result.clinicPhone,
      }
      setMessages(prev => [...prev, botMsg])
    } catch {
      setMessages(prev => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'bot', text: t.error },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    // 44px language bar above, 70px bottom nav below.
    <div className="flex flex-col h-[calc(100dvh-114px)] bg-[#fdfcfa]">
      {/* Header */}
      <div className="p-4 pt-8 bg-white border-b border-slate-100 flex-shrink-0">
        <h1 className="text-xl font-bold text-[#8a3c4a] font-serif mb-0.5">{t.title}</h1>
        <p className="text-xs text-slate-400 italic">{t.subtitle}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 self-end ${msg.role === 'user' ? 'bg-[#ffe8ed] text-[#b84c63]' : 'bg-[#eaf4ff] text-[#456b9c]'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[78%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${msg.role === 'user' ? 'bg-[#ffe8ed] text-slate-800 rounded-tr-sm' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'}`}>
              <p className="leading-relaxed">{msg.text}</p>

              {msg.triageLevel === 'CRITICAL' && (
                <a
                  href={`tel:${msg.clinicPhone}`}
                  className="mt-2 flex items-center gap-2 bg-rose-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-rose-700 transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {t.bookNow}
                </a>
              )}

              {msg.triageLevel === 'IMPORTANT' && (
                <a
                  href={`tel:${msg.clinicPhone}`}
                  className="mt-2 flex items-center gap-2 bg-amber-500 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-600 transition"
                >
                  <CalendarHeart className="w-3.5 h-3.5 shrink-0" />
                  {t.visitTomorrow}
                </a>
              )}

              {msg.triageLevel === 'NORMAL' && msg.role === 'bot' && msg.id !== 'welcome' && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 italic">
                  <Info className="w-3 h-3 shrink-0" /> {t.nextFollowUp}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-2 flex-row">
            <div className="w-8 h-8 rounded-full bg-[#eaf4ff] text-[#456b9c] flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-slate-100 flex-shrink-0">
        <form onSubmit={handleSend} className="flex gap-2 items-center bg-slate-50 rounded-full border border-slate-200 px-4 py-2.5">
          <input
            type="text"
            placeholder={t.placeholder}
            className="flex-1 bg-transparent border-none focus:outline-none text-sm text-slate-700 placeholder:text-slate-400"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isTyping}
          />
          {input.trim() ? (
            <button type="submit" className="text-[#b84c63] hover:text-[#8a3c4a] disabled:opacity-40 transition" disabled={isTyping}>
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button type="button" className="text-[#b84c63]" aria-label={t.voiceInput}>
              <Mic className="w-5 h-5" />
            </button>
          )}
        </form>
        <p className="text-[9px] text-slate-400 text-center mt-1.5 italic px-4">
          {t.disclaimer}
        </p>
      </div>
    </div>
  )
}
