import { Activity, Droplet } from 'lucide-react'

import { getMonitoring } from '@/modules/patient-portal/portal.service'
import { HOME_READING_METRIC_LABELS } from '@/modules/monitoring/monitoring.types'

import { getPatientSession } from '../lib/session'
import { getPatientI18n } from '../lib/i18n/server'

import { MeasureForm } from './measure-form'
import { TrendChart } from './trend-chart'

/**
 * Daily home monitoring — a tile for each condition a clinician has flagged
 * that needs a reading between visits (gestational diabetes → sugar,
 * a hypertensive disorder → blood pressure). See `metricsForDiagnoses` for
 * how the flagged diagnosis decides which tiles appear; there is no tile at
 * all for a patient with neither condition flagged.
 */
export default async function MonitoringPage() {
  const [session, { lang, t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const m = t.monitoring

  if (!session) {
    return <div className="p-4 pt-8 text-center text-slate-500">{t.common.sessionExpired}</div>
  }

  const { hasActivePregnancy, panels } = await getMonitoring(session)

  if (!hasActivePregnancy || panels.length === 0) {
    return (
      <div className="flex flex-col items-center p-6 pt-16 text-center">
        <div className="text-5xl mb-4">📈</div>
        <h1 className="text-xl font-bold text-slate-800 font-serif mb-2">{m.title}</h1>
        <p className="max-w-xs text-sm text-slate-500 italic">{m.notEnabled}</p>
      </div>
    )
  }

  return (
    <div className="p-4 pt-8 pb-10">
      <h1 className="mb-1 text-xl font-bold text-slate-800 font-serif">{m.title}</h1>
      <p className="mb-6 text-sm text-slate-500 italic">{m.subtitle}</p>

      <div className="flex flex-col gap-5">
        {panels.map((panel) => (
          <section key={panel.metric} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              {panel.metric === 'BLOOD_GLUCOSE' ? (
                <Droplet aria-hidden className="h-5 w-5 text-[#b84c63]" />
              ) : (
                <Activity aria-hidden className="h-5 w-5 text-[#8a3c4a]" />
              )}
              <h2 className="font-bold text-slate-800">{HOME_READING_METRIC_LABELS[panel.metric]}</h2>
            </div>

            <div className="mb-4">
              <MeasureForm
                metric={panel.metric}
                labels={{
                  measure: m.measure,
                  save: m.save,
                  saving: m.saving,
                  saved: m.saved,
                  close: m.close,
                  glucoseValue: m.glucoseValue,
                  glucoseContext: m.glucoseContext,
                  bloodPressure: m.bloodPressureLabel,
                  systolic: m.systolic,
                  diastolic: m.diastolic,
                }}
              />
            </div>

            <TrendChart
              metric={panel.metric}
              readings={panel.readings}
              lang={lang}
              labels={{
                week: m.week,
                month: m.month,
                all: m.sincePregnancy,
                noReadings: m.noReadings,
                unitGlucose: m.unitGlucose,
                unitBp: m.unitBp,
              }}
            />
          </section>
        ))}
      </div>
    </div>
  )
}
