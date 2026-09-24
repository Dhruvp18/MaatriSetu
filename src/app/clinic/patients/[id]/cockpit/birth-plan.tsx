import { CheckCircle2, XCircle } from 'lucide-react'
import type { BirthPlan } from '@modules/pregnancies/pregnancy.types'

export function BirthPlanPanel({ plan }: { plan: BirthPlan }) {
  const isFilled = Object.keys(plan).length > 0

  if (!isFilled) {
    return <p className="text-xs text-slate-500">No birth plan details recorded yet.</p>
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Delivery Arrangement</h3>
          <p className="text-sm font-semibold text-slate-900">{plan.planned_place || 'Not decided'}</p>
          <p className="mt-0.5 text-xs text-slate-600">Companion: {plan.companion_name || 'Not decided'}</p>
        </div>
        
        <div className="flex flex-col gap-1.5 text-xs">
          <ReadinessItem label="Transport arranged" status={plan.transport_arranged} />
          <ReadinessItem label="Blood donor identified" status={plan.blood_donor_identified} />
          <ReadinessItem label="Funds saved" status={plan.funds_saved} />
        </div>
      </div>

      {plan.special_instructions ? (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Special Instructions</h3>
          <p className="text-xs italic text-slate-700">{plan.special_instructions}</p>
        </div>
      ) : null}
    </div>
  )
}

function ReadinessItem({ label, status }: { label: string; status?: boolean }) {
  if (status === undefined) return null

  return (
    <div className="flex items-center gap-1.5">
      {status ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-caution-600" />
      )}
      <span className={status ? 'text-slate-700 font-medium' : 'text-slate-500'}>{label}</span>
    </div>
  )
}
