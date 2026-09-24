import { getReports } from '@/modules/patient-portal/portal.service'
import { getPatientSession } from '../lib/session'
import { FileText, Activity } from 'lucide-react'
import { getPatientI18n } from '../lib/i18n/server'
import { fmt, formatDate } from '../lib/i18n/locales'

export default async function ReportsPage() {
  const [session, { lang, t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const r = t.reports
  if (!session) {
    return <div className="p-4 pt-8 text-center text-slate-500">{t.common.sessionExpired}</div>
  }

  const { hasActivePregnancy, observations, scans } = await getReports(session)

  if (!hasActivePregnancy) {
    return (
      <div className="p-4 pt-8 text-center">
        <h1 className="text-xl font-bold text-slate-800 font-serif mb-4">{r.title}</h1>
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 italic">{t.common.noActivePregnancy}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pt-8 pb-20">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">{r.title}</h1>
      <p className="text-sm text-slate-500 italic mb-6">{r.subtitle}</p>

      {/* Scans */}
      <h2 className="text-sm font-bold text-indigo-700 mb-3 px-1 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-indigo-500" /> {r.scans}
      </h2>

      {scans.length > 0 ? (
        <div className="space-y-3 mb-8">
          {scans.map((scan) => (
            <div key={scan.id} className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-sm relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400" />
              <div className="flex justify-between items-start pl-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{scan.scanType}</h3>
                  <p className="text-[10px] text-slate-500">{fmt(r.scanDate, { date: formatDate(scan.scanDate, lang) })}</p>
                </div>
                <div className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                  {scan.sourceUploadId ? r.uploaded : r.recorded}
                </div>
              </div>

              <div className="pl-2 grid grid-cols-2 gap-2 mt-1 border-t border-slate-50 pt-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">{r.placenta}</p>
                  <p className="text-xs font-semibold text-slate-700">{scan.placentaPosition || t.common.notAvailable}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">{r.afi}</p>
                  <p className="text-xs font-semibold text-slate-700">{scan.afiCm ? `${scan.afiCm} cm` : t.common.notAvailable}</p>
                </div>
                {scan.efwGrams && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">{r.fetalWeight}</p>
                    <p className="text-xs font-semibold text-slate-700">{scan.efwGrams}g</p>
                  </div>
                )}
                {scan.fetalHeartRateBpm && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">{r.fetalHeartRate}</p>
                    <p className="text-xs font-semibold text-slate-700">{scan.fetalHeartRateBpm} bpm</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center mb-8">
          <p className="text-sm text-slate-500 italic">{r.noScans}</p>
        </div>
      )}

      {/* Lab Results */}
      <h2 className="text-sm font-bold text-rose-700 mb-3 px-1 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-rose-500" /> {r.labResults}
      </h2>

      {observations.length > 0 ? (
        <div className="space-y-3">
          {observations.map((obs) => (
            <div key={obs.id} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                  <Activity className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">{obs.testCode}</p>
                  <p className="text-[10px] text-slate-400">{formatDate(obs.observedDate, lang)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#8a3c4a]">
                  {obs.value.kind === 'NUMERIC' ? obs.value.value : obs.value.text}
                </p>
                {obs.value.kind === 'NUMERIC' && (
                  <p className="text-[10px] text-slate-400 font-mono uppercase">{obs.value.unit}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center mb-8">
          <p className="text-sm text-slate-500 italic">{r.noLabs}</p>
        </div>
      )}
    </div>
  )
}
