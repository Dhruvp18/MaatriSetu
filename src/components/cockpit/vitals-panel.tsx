import { Activity } from 'lucide-react'

import { formatDipstick, type VitalsReading } from '@modules/visits/visit.types'

import { formatWeight } from './header-banner'

/**
 * Today's vitals, at the head of the Examination section — the doctor reads
 * them where she writes her findings, not on the banner.
 *
 * A reading never taken prints as an em-dash rather than vanishing: a tile
 * grid that silently shrinks is how a clinician comes away believing a blood
 * pressure was recorded.
 */
export function VitalsPanel({
  latestVitals,
  baselineWeightKg,
}: {
  latestVitals: VitalsReading | null
  /** Pre-pregnancy weight, or the first weight recorded this pregnancy. */
  baselineWeightKg: number | null
}) {
  if (!latestVitals) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-500">
        No vitals recorded at this visit yet.
      </p>
    )
  }

  const weight = formatWeight(baselineWeightKg, latestVitals.weightKg)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-heading flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-700 uppercase">
        <Activity aria-hidden className="h-3.5 w-3.5 text-brand-600" />
        Vitals
      </span>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
        <Tile label="BP">
          {latestVitals.bloodPressure ? (
            <>
              {latestVitals.bloodPressure.systolicMmHg}/{latestVitals.bloodPressure.diastolicMmHg} <Unit>mmHg</Unit>
            </>
          ) : null}
        </Tile>
        <Tile label="Pulse">
          {latestVitals.pulseBpm !== null ? (
            <>
              {latestVitals.pulseBpm} <Unit>bpm</Unit>
            </>
          ) : null}
        </Tile>
        <Tile label="Weight">
          {latestVitals.weightKg !== null && weight ? (
            <>
              {weight.text.replace(/ kg$/, '')} <Unit>kg</Unit>
            </>
          ) : null}
        </Tile>
        <Tile label="FHR" accent>
          {latestVitals.fetalHeartRateBpm !== null ? (
            <>
              {latestVitals.fetalHeartRateBpm} <Unit>bpm</Unit>
            </>
          ) : null}
        </Tile>
        <Tile label="Fundal ht">
          {latestVitals.fundalHeightCm !== null ? (
            <>
              {latestVitals.fundalHeightCm} <Unit>cm</Unit>
            </>
          ) : null}
        </Tile>
        <Tile label="Urine alb.">
          {latestVitals.urineAlbumin !== null ? formatDipstick(latestVitals.urineAlbumin) : null}
        </Tile>
        <Tile label="Urine sugar">
          {latestVitals.urineSugarMgDl !== null ? (
            <>
              {latestVitals.urineSugarMgDl} <Unit>mg/dL</Unit>
            </>
          ) : latestVitals.urineSugar !== null ? (
            formatDipstick(latestVitals.urineSugar)
          ) : null}
        </Tile>
      </div>
    </div>
  )
}

function Tile({ label, accent = false, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  const recorded = children !== null && children !== undefined && children !== false

  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-200/60 bg-slate-50/80 px-2.5 py-1.5">
      <span className="shrink-0 text-slate-500">{label}</span>
      {recorded ? (
        <span className={`numeric truncate font-bold ${accent ? 'text-brand-800' : 'text-slate-800'}`}>{children}</span>
      ) : (
        <span className="text-slate-400">—</span>
      )}
    </div>
  )
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-normal text-slate-500">{children}</span>
}
