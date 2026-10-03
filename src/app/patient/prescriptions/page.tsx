import { getPrescriptions } from '@/modules/patient-portal/portal.service'
import { formatDosing } from '@/modules/orders/order.types'
import { getPatientSession } from '../lib/session'
import { Pill, Calendar, Clock, AlertTriangle } from 'lucide-react'
import { getPatientI18n } from '../lib/i18n/server'
import { fmt } from '../lib/i18n/locales'

export default async function PrescriptionsPage() {
  const [session, { t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const rx = t.prescriptions
  if (!session) {
    return <div className="p-4 pt-8 text-center text-slate-500">{t.common.sessionExpired}</div>
  }

  const { hasActivePregnancy, prescriptions } = await getPrescriptions(session)

  if (!hasActivePregnancy) {
    return (
      <div className="p-4 pt-8 text-center">
        <h1 className="text-xl font-bold text-slate-800 font-serif mb-4">{rx.title}</h1>
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
          <Pill className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 italic">{t.common.noActivePregnancy}</p>
        </div>
      </div>
    )
  }

  // Already her active medication, one line per medicine — the cockpit's own list.
  const ongoing = prescriptions
  // Calcium blocks iron absorption, so whenever she is on either, say to space them.
  const takesIronOrCalcium = ongoing.some(p => /iron|ferr|calcium/i.test(p.medicineName))

  return (
    <div className="p-4 pt-8 pb-20">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">{rx.title}</h1>
      <p className="text-sm text-slate-500 italic mb-6">{rx.subtitle}</p>

      {/* Ongoing Prescriptions */}
      <h2 className="text-sm font-bold text-emerald-700 mb-3 px-1 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-500" /> {rx.ongoing}
      </h2>

      {takesIronOrCalcium && (
        <div className="bg-amber-50 rounded-xl p-3 mb-3 flex items-start gap-2 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-900 leading-relaxed">{rx.ironCalciumApart}</p>
        </div>
      )}

      {ongoing.length > 0 ? (
        <div className="space-y-3 mb-8">
          {ongoing.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl p-4 border border-emerald-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400" />
              <div className="mb-2 pl-2">
                <h3 className="text-base font-bold text-slate-800">{p.medicineName}</h3>
                {p.dose && <p className="text-xs text-slate-500">{p.dose.kind === 'SPECIFIED' ? `${p.dose.amount} ${p.dose.unit}` : rx.doseAsDirected}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 pl-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="numeric">{t.enums.route[p.route]} · {formatDosing(p.frequency)}</span>
                </div>
                {p.durationDays && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{fmt(rx.forDays, { n: p.durationDays })}</span>
                  </div>
                )}
              </div>

              {p.instructions && (
                <div className="bg-amber-50 rounded-lg p-2.5 ml-2 mt-2 flex items-start gap-2 border border-amber-100">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 italic leading-relaxed">
                    {p.instructions}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center mb-8">
          <p className="text-sm text-slate-500 italic">{rx.noOngoing}</p>
        </div>
      )}
    </div>
  )
}
