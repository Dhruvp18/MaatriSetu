'use client'

/**
 * Microphone capture as 16 kHz mono WAV.
 *
 * WAV rather than MediaRecorder's native output, because Chrome only records
 * WebM/Opus and neither speech provider the clinic uses accepts it reliably,
 * whereas every one of them accepts PCM WAV.
 *
 * A take is split into pieces of at most `MAX_SECONDS`: the synchronous speech
 * API rejects longer audio, and a 25-second 16 kHz piece is ~800 kB, under the
 * server-action body limit. The pieces are transcribed in order and joined.
 */

const TARGET_RATE = 16_000
const MAX_SECONDS = 25

export interface Recorder {
  stop(): Promise<Blob[]>
  cancel(): void
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })

  const context = new AudioContext()
  const source = context.createMediaStreamSource(stream)
  // ScriptProcessorNode is deprecated but universally available, and an
  // AudioWorklet would need a separately served module for a few lines of copy.
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
  }
  source.connect(processor)
  processor.connect(context.destination)

  const release = () => {
    processor.disconnect()
    source.disconnect()
    stream.getTracks().forEach((track) => track.stop())
    void context.close()
  }

  return {
    async stop() {
      release()
      const samples = downsample(concat(chunks), context.sampleRate, TARGET_RATE)
      const perPiece = TARGET_RATE * MAX_SECONDS
      const pieces: Blob[] = []
      for (let start = 0; start < samples.length; start += perPiece) {
        pieces.push(encodeWav(samples.subarray(start, start + perPiece), TARGET_RATE))
      }
      return pieces
    },
    cancel: release,
  }
}

function concat(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/** Averaging decimation. Speech needs nothing cleverer at these rates. */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from <= to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), input.length)
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j] ?? 0
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
