'use client'

import { Camera, CameraOff, Loader2 } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'

import { resolveScan, type ScanState } from './actions'

/**
 * Scan a patient card or file sticker with the device camera.
 *
 * Uses the browser's BarcodeDetector where it exists (Chrome on Android,
 * ChromeOS and macOS; Edge). Where it does not, the typed/keyboard-wedge field
 * below still works — the detector is a convenience, never the only way in.
 *
 * The decoded token is posted to the same server action as a hardware scanner,
 * in the request body, never in a URL (see ./actions.ts).
 */

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector
  }
}

const initial: ScanState = { error: null }

export function CameraScan() {
  const [state, formAction, pending] = useActionState(resolveScan, initial)
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const token = useRef<HTMLInputElement>(null)
  const supported = typeof window !== 'undefined' && !!window.BarcodeDetector

  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let stopped = false

    const run = async () => {
      if (!window.BarcodeDetector) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch {
        setMessage('The camera could not be opened. Check the browser permission.')
        setActive(false)
        return
      }
      if (!video.current) return
      video.current.srcObject = stream
      await video.current.play()

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        if (stopped || !video.current) return
        try {
          const codes = await detector.detect(video.current)
          const value = codes[0]?.rawValue
          if (value && token.current && form.current) {
            token.current.value = value
            stopped = true
            setActive(false)
            form.current.requestSubmit()
            return
          }
        } catch {
          // A frame that fails to decode is normal; try the next one.
        }
        setTimeout(tick, 250)
      }
      void tick()
    }
    void run()

    return () => {
      stopped = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [active])

  return (
    <div className="flex flex-col gap-2">
      <form ref={form} action={formAction} className="hidden">
        <input ref={token} name="token" />
      </form>

      {active ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
          <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80" />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {supported ? (
          <button
            type="button"
            onClick={() => {
              setMessage(null)
              setActive((value) => !value)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800 hover:bg-brand-100"
          >
            {active ? <CameraOff aria-hidden className="h-4 w-4" /> : <Camera aria-hidden className="h-4 w-4" />}
            {active ? 'Stop camera' : 'Scan with camera'}
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">
            Camera scanning is not available in this browser — use a desk scanner or type the code.
          </span>
        )}
        {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin text-brand-700" /> : null}
      </div>

      {message ? <p className="text-xs text-alert-700">{message}</p> : null}
      {state.error ? (
        <p role="alert" className="text-xs text-alert-700">
          {state.error}
        </p>
      ) : null}
    </div>
  )
}
