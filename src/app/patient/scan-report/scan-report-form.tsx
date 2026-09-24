'use client'

import { useState, useRef, useTransition } from 'react'
import { Camera, FileText, CheckCircle, Loader2 } from 'lucide-react'
import { uploadPatientReport } from './actions'
import type { Dict } from '../lib/i18n/dictionaries'

export function ScanReportForm({ t }: { t: Dict['scanReport'] }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!file) return

    startTransition(() => {
      const formData = new FormData()
      formData.append('reportImage', file)
      uploadPatientReport(formData).catch(() => {
        alert(t.uploadFailed)
      })
    })
  }

  return (
    <div className="p-4 pt-8 pb-20">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">{t.title}</h1>
      <p className="text-sm text-slate-500 italic mb-6">{t.subtitle}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />

        {previewUrl ? (
          <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm relative">
            <img src={previewUrl} alt={t.previewAlt} className="w-full h-auto rounded-xl max-h-[60vh] object-contain bg-slate-50" />
            <button
              type="button"
              onClick={() => { setFile(null); setPreviewUrl(null); }}
              className="absolute top-4 right-4 bg-white/90 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm"
            >
              {t.retake}
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center p-8 gap-3 h-[40vh] cursor-pointer active:bg-slate-100 transition-colors"
          >
            <div className="bg-white p-4 rounded-full shadow-sm">
              <Camera className="w-8 h-8 text-slate-400" />
            </div>
            <div className="text-center mt-2">
              <p className="text-base font-bold text-slate-700">{t.tapToScan}</p>
              <p className="text-xs text-slate-500 mt-1">{t.tapHint}</p>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
          <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            {t.reviewNote}
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || isPending}
          className="bg-[#b84c63] text-white rounded-xl py-3.5 font-bold text-sm shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity active:scale-[0.98]"
        >
          {isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {t.uploading}</>
          ) : (
            <><CheckCircle className="w-5 h-5" /> {t.submit}</>
          )}
        </button>
      </form>
    </div>
  )
}
