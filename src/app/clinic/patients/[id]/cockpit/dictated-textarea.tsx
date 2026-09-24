'use client'

import { Loader2, Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { type Recorder, startRecording } from '@components/cockpit/wav-recorder'

import { transcribeDictationAction } from './history-actions'

/**
 * A consultation text field the doctor can speak into.
 *
 * Press the mic, speak, press stop: the recording is transcribed and appended
 * to whatever is already typed, never replacing it. The text lands in the
 * field for the doctor to read and correct, and is saved only with the
 * consultation — the audio itself is not kept.
 *
 * The field is a plain named <textarea>, so it submits with the consultation
 * form like any other input.
 */

type Phase = 'idle' | 'recording' | 'transcribing'

export function DictatedTextarea({
  name,
  label,
  defaultValue,
  placeholder,
  rows = 3,
  hint,
}: {
  name: string
  label: string
  defaultValue?: string | null
  placeholder?: string
  rows?: number
  hint?: string
}) {
  const [value, setValue] = useState(defaultValue ?? '')
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fixture, setFixture] = useState(false)
  const recorder = useRef<Recorder | null>(null)

  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [phase])

  // Release the microphone if the doctor navigates away mid-recording.
  useEffect(() => () => recorder.current?.cancel(), [])

  async function start() {
    setError(null)
    try {
      recorder.current = await startRecording()
      setSeconds(0)
      setPhase('recording')
    } catch {
      setError('The microphone could not be opened. Check the browser permission.')
    }
  }

  async function stop() {
    const active = recorder.current
    recorder.current = null
    if (!active) return

    setPhase('transcribing')
    const pieces = await active.stop()
    const texts: string[] = []

    for (const piece of pieces) {
      const form = new FormData()
      form.append('audio', piece, 'dictation.wav')
      const result = await transcribeDictationAction(form)
      if (!result.ok) {
        setError(result.message)
        break
      }
      if (result.isFixture) setFixture(true)
      if (result.text) texts.push(result.text)
    }

    if (texts.length > 0) {
      const spoken = texts.join(' ')
      setValue((current) => (current.trim() ? `${current.trimEnd()}\n${spoken}` : spoken))
    }
    setPhase('idle')
  }

  const id = `field-${name}`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-heading text-xs font-bold tracking-wider text-slate-800 uppercase">
          {label}
        </label>
        <button
          type="button"
          onClick={phase === 'recording' ? stop : start}
          disabled={phase === 'transcribing'}
          aria-label={phase === 'recording' ? `Stop dictating ${label}` : `Dictate ${label}`}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-60 ${
            phase === 'recording'
              ? 'border-alert-200 bg-alert-600 text-white hover:bg-alert-700'
              : 'border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100'
          }`}
        >
          {phase === 'recording' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="numeric">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
              <Square aria-hidden className="h-3 w-3 fill-current" />
              Stop
            </>
          ) : phase === 'transcribing' ? (
            <>
              <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              Transcribing…
            </>
          ) : (
            <>
              <Mic aria-hidden className="h-3.5 w-3.5" />
              Voice
            </>
          )}
        </button>
      </div>

      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="numeric w-full rounded border border-slate-300 bg-white/80 px-2.5 py-1.5 text-xs leading-relaxed text-slate-900 transition-colors outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
      />

      {error ? <p role="alert" className="text-[11px] text-alert-700">{error}</p> : null}
      {fixture ? (
        <p className="text-[11px] font-medium text-caution-700">
          Sample text inserted — the speech service is in demo mode. This is not what you said.
        </p>
      ) : null}
      {hint && !error ? <p className="text-[10.5px] text-slate-500">{hint}</p> : null}
    </div>
  )
}
