import { getPatientSession } from '../lib/session'
import { findActivePregnancy } from '@/modules/pregnancies/pregnancy.repository'
import { listObservations, listScans, listUploadsForPregnancy } from '@/modules/reports/report.repository'
import { serviceClient } from '@core/db/clients'
import { FileText, Activity, Droplet, FileSymlink } from 'lucide-react'
import type { Observation, ScanReport } from '@/modules/reports/report.types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function ReportsPage() {
  const session = await getPatientSession()
  if (!session) {
    return <div className="p-4 pt-8 text-center text-slate-500">Session expired. Please scan your QR again.</div>
  }

  const db = serviceClient()
  const pregnancy = await findActivePregnancy(db, session.clinicId, session.patientId)

  if (!pregnancy) {
    return (
      <div className="p-4 pt-8 text-center">
        <h1 className="text-xl font-bold text-slate-800 font-serif mb-4">My Reports</h1>
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 italic">No active pregnancy on record.</p>
        </div>
      </div>
    )
  }

  // We pass empty Set for pins since patients don't care about pins
  const emptyPins = new Set<string>()
  const [observations, scans] = await Promise.all([
    listObservations(db, session.clinicId, pregnancy.id, emptyPins),
    listScans(db, session.clinicId, pregnancy.id, emptyPins),
  ])

  return (
    <div className="p-4 pt-8 pb-20">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">My Reports</h1>
      <p className="text-sm text-slate-500 italic mb-6">Lab results and scans</p>

      {/* Scans */}
      <h2 className="text-sm font-bold text-indigo-700 mb-3 px-1 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-indigo-500" /> Ultrasound Scans
      </h2>
      
      {scans.length > 0 ? (
        <div className="space-y-3 mb-8">
          {scans.map((scan) => (
            <div key={scan.id} className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-sm relative overflow-hidden flex flex-col gap-2">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400" />
              <div className="flex justify-between items-start pl-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{scan.scanType}</h3>
                  <p className="text-[10px] text-slate-500">Scan Date: {formatDate(scan.scanDate)}</p>
                </div>
                <div className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                  {scan.sourceUploadId ? 'Uploaded' : 'Recorded'}
                </div>
              </div>
              
              <div className="pl-2 grid grid-cols-2 gap-2 mt-1 border-t border-slate-50 pt-2">
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">Placenta</p>
                  <p className="text-xs font-semibold text-slate-700">{scan.placentaPosition || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-0.5">AFI</p>
                  <p className="text-xs font-semibold text-slate-700">{scan.afiCm ? `${scan.afiCm} cm` : 'N/A'}</p>
                </div>
                {scan.efwGrams && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Fetal Weight</p>
                    <p className="text-xs font-semibold text-slate-700">{scan.efwGrams}g</p>
                  </div>
                )}
                {scan.fetalHeartRateBpm && (
                  <div>
                    <p className="text-[10px] text-slate-400 mb-0.5">Fetal Heart Rate</p>
                    <p className="text-xs font-semibold text-slate-700">{scan.fetalHeartRateBpm} bpm</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center mb-8">
          <p className="text-sm text-slate-500 italic">No ultrasound scans recorded yet.</p>
        </div>
      )}

      {/* Lab Results */}
      <h2 className="text-sm font-bold text-rose-700 mb-3 px-1 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-rose-500" /> Lab Results
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
                  <p className="text-[10px] text-slate-400">{formatDate(obs.observedDate)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#8a3c4a]">{obs.valueNumeric ?? obs.valueText}</p>
                {obs.unit && <p className="text-[10px] text-slate-400 font-mono uppercase">{obs.unit}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center mb-8">
          <p className="text-sm text-slate-500 italic">No lab results recorded yet.</p>
        </div>
      )}
    </div>
  )
}
