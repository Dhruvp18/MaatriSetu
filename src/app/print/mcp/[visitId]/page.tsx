import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { getPatient } from '@modules/patients/patient.service'
import { getVisitWithVitals, getVisitAdvice } from '@modules/visits/visit.service'
import { listPrescriptions } from '@modules/orders/order.service'
import { formatGestationalAge, gestationalAge, todayIn } from '@core/obstetrics/dating'
import { describeAllergies, formatBloodGroup, isRhNegative, ageInYears } from '@modules/patients/patient.types'
import { getPregnancy } from '@modules/pregnancies/pregnancy.service'

export const metadata = { title: 'Print MCP Slip — MaatriSetu' }
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ visitId: string }>
}

export default async function PrintMcpSlipPage({ params }: Props) {
  const { visitId } = await params
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect('/sign-in')

  const { actor } = session
  if (!roleHasPermission(actor.role, 'visit.read')) {
    notFound()
  }

  // Fetch visit data
  const visitWithVitals = await getVisitWithVitals(actor, visitId).catch(() => null)
  if (!visitWithVitals) notFound()
  const { visit, vitals } = visitWithVitals

  // Fetch related patient, pregnancy, advice, and prescriptions
  const [patient, pregnancy, advice, allPrescriptions] = await Promise.all([
    getPatient(actor, visit.patientId).catch(() => null),
    getPregnancy(actor, visit.pregnancyId).catch(() => null),
    getVisitAdvice(actor, visitId).catch(() => null),
    listPrescriptions(actor, visit.pregnancyId).catch(() => []),
  ])

  if (!patient || !pregnancy) notFound()

  const prescriptions = allPrescriptions.filter(p => p.visitId === visitId)
  const today = todayIn(actor.clinicTimezone)
  const gestation = pregnancy.dating.status === 'ESTABLISHED' 
    ? formatGestationalAge(gestationalAge(pregnancy.dating.reference, today)) 
    : 'Not established'

  // We only print saved visits
  if (visit.status !== 'SAVED') {
    return (
      <div className="p-8 text-center text-slate-600">
        This visit has not been saved yet. You can only print an MCP slip for a completed visit.
      </div>
    )
  }

  return (
    <div className="bg-white text-black p-8 print:p-0">
      {/* Print trigger on mount */}
      <script dangerouslySetInnerHTML={{ __html: 'window.onload = function() { window.print(); }' }} />
      
      <div className="max-w-[148mm] mx-auto border border-black p-6 print:border-none print:p-0">
        {/* Header */}
        <header className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide">MCP Outpatient Slip</h1>
            <p className="text-sm mt-1">Government of India / State Health Mission</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">Visit #{visit.id.split('-')[0]}</p>
            <p className="text-sm">{new Date(visit.occurredAt).toLocaleDateString('en-IN')}</p>
          </div>
        </header>

        {/* Demographics Block */}
        <section className="mb-6 grid grid-cols-2 gap-4 text-sm border border-black p-4">
          <div>
            <p><span className="font-semibold">Name:</span> {patient.fullName}</p>
            <p><span className="font-semibold">UHID:</span> {patient.uhid}</p>
            <p><span className="font-semibold">Age:</span> {ageInYears(patient.age, today) ?? 'Not recorded'}</p>
          </div>
          <div>
            <p>
              <span className="font-semibold">Blood Group:</span>{' '}
              {patient.bloodGroup ? formatBloodGroup(patient.bloodGroup.value) : 'Not recorded'}
              {patient.bloodGroup && isRhNegative(patient.bloodGroup.value) && ' (Rh Negative)'}
            </p>
            <p><span className="font-semibold">Allergies:</span> {describeAllergies(patient.allergies)}</p>
            <p><span className="font-semibold">Gestation today:</span> {gestation}</p>
          </div>
        </section>

        {/* Vitals */}
        <section className="mb-6">
          <h2 className="text-lg font-bold border-b border-black mb-2 uppercase tracking-wide text-xs">Vitals Today</h2>
          {vitals.length > 0 ? (
            (() => {
              const latestVitals = vitals[vitals.length - 1]!
              return (
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  {latestVitals.bloodPressure && (
                    <p>BP: {latestVitals.bloodPressure.systolicMmHg}/{latestVitals.bloodPressure.diastolicMmHg} mmHg</p>
                  )}
                  {latestVitals.weightKg !== null && <p>Weight: {latestVitals.weightKg} kg</p>}
                  {latestVitals.pulseBpm !== null && <p>Pulse: {latestVitals.pulseBpm} bpm</p>}
                  {latestVitals.fetalHeartRateBpm !== null && <p>FHR: {latestVitals.fetalHeartRateBpm} bpm</p>}
                  {latestVitals.fundalHeightCm !== null && <p>SFH: {latestVitals.fundalHeightCm} cm</p>}
                </div>
              )
            })()
          ) : (
            <p className="text-sm italic">No vitals recorded.</p>
          )}
        </section>

        {/* Impression */}
        <section className="mb-6">
          <h2 className="text-lg font-bold border-b border-black mb-2 uppercase tracking-wide text-xs">Clinical Impression</h2>
          <p className="text-sm whitespace-pre-wrap">{visit.impression || 'None recorded.'}</p>
        </section>

        {/* Orders (Prescriptions + Advice) */}
        <section className="mb-6">
          <h2 className="text-lg font-bold border-b border-black mb-2 uppercase tracking-wide text-xs">Plan & Advice</h2>
          
          {/* Prescriptions */}
          {prescriptions.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-1">Prescriptions:</h3>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {prescriptions.map((p) => (
                  <li key={p.id}>
                    {p.medicineName} — {p.dose.kind === 'SPECIFIED' ? `${p.dose.amount} ${p.dose.unit}` : 'As directed'} 
                    {' '}({p.frequency}, {p.route}, {p.foodRelation.replace('_', ' ').toLowerCase()})
                    {p.durationDays && ` for ${p.durationDays} days`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Advice */}
          {advice && (
            <div className="text-sm space-y-1">
              <h3 className="font-semibold mb-1">Counselling:</h3>
              <ul className="list-disc pl-5">
                {advice.dfkcCounselled && <li>Daily Fetal Kick Count (DFKC) explained</li>}
                {advice.nutritionCounselled && <li>Maternal Nutrition & Diet (MNT) advised</li>}
                {advice.leftLateralRest && <li>Left-lateral rest advised</li>}
                {advice.dangerSignsCounselled && <li>Danger signs explained</li>}
              </ul>
              
              {advice.labOrders.length > 0 && (
                <p className="mt-2"><span className="font-semibold">Lab Orders:</span> {advice.labOrders.join(', ')}</p>
              )}
              {advice.scanOrders.length > 0 && (
                <p className="mt-1"><span className="font-semibold">Scan Orders:</span> {advice.scanOrders.join(', ')}</p>
              )}
              {advice.additionalAdvice && (
                <p className="mt-2 whitespace-pre-wrap"><span className="font-semibold">Additional:</span> {advice.additionalAdvice}</p>
              )}
              {advice.nextFollowupDate && (
                <p className="mt-2"><span className="font-semibold">Follow-up:</span> On or around {advice.nextFollowupDate}</p>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-black text-sm text-right">
          <p>Clinician Signature / Stamp</p>
        </footer>
      </div>
    </div>
  )
}
