import { getPatientSession } from '../lib/session'
import { findPatientById } from '@/modules/patients/patient.repository'
import { listObstetricHistory } from '@/modules/pregnancies/pregnancy.repository'
import { serviceClient } from '@core/db/clients'
import { User, Phone, MapPin, Droplet, Clock, AlertCircle, LogOut } from 'lucide-react'
import { logoutPatient } from './actions'
export default async function PatientProfilePage() {
  const session = await getPatientSession()
  if (!session) {
    return <div className="p-4 pt-8 text-center text-slate-500">Session expired. Please scan your QR again.</div>
  }

  const db = serviceClient()
  const [patient, obsHistory] = await Promise.all([
    findPatientById(db, session.clinicId, session.patientId),
    listObstetricHistory(db, session.clinicId, session.patientId),
  ])

  if (!patient) {
    return <div className="p-4 pt-8 text-center text-slate-500">Patient record not found.</div>
  }

  return (
    <div className="p-4 pt-8 pb-20">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-6">My Profile</h1>

      {/* Main Demographics */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-rose-50 text-[#8a3c4a] rounded-full flex items-center justify-center text-xl shadow-sm shrink-0">
            {patient.fullName.charAt(0)}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 leading-tight">{patient.fullName}</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">UHID: {patient.uhid}</p>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Age</p>
              <p className="text-sm font-medium text-slate-700">
                {patient.age.kind === 'DATE_OF_BIRTH' ? patient.age.dateOfBirth : `${patient.age.years} yrs (est)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-slate-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-medium">Phone</p>
              <p className="text-sm font-medium text-slate-700">{patient.contacts[0]?.phoneE164 || 'Not provided'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Medical Profile */}
      <h3 className="text-sm font-bold text-slate-700 mb-3 px-1">Medical Summary</h3>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex items-center gap-3">
          <Droplet className="w-5 h-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-[10px] text-blue-600 font-medium mb-0.5">Blood Type</p>
            <p className="text-base font-bold text-blue-900">{patient.bloodGroup ? patient.bloodGroup.value : 'Unknown'}</p>
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-[10px] text-amber-600 font-medium mb-0.5">Allergies</p>
            <p className="text-sm font-bold text-amber-900 truncate">
              {patient.allergies.status === 'KNOWN' ? `${patient.allergies.allergies.length} noted` : patient.allergies.status === 'NONE_KNOWN' ? 'None' : 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Obstetric History */}
      <h3 className="text-sm font-bold text-slate-700 mb-3 px-1">Obstetric History</h3>
      {obsHistory.length > 0 ? (
        <div className="space-y-3">
          {obsHistory.map((obs, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-start gap-3">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-bold text-slate-700">Pregnancy {obs.sequenceNo}</p>
                  {obs.yearOfEvent && <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">{obs.yearOfEvent}</span>}
                </div>
                <p className="text-xs text-slate-600 capitalize">Outcome: <span className="font-medium">{obs.outcome.toLowerCase()}</span></p>
                {obs.deliveryMode && <p className="text-xs text-slate-600">Mode: {obs.deliveryMode.replace(/_/g, ' ').toLowerCase()}</p>}
                {obs.birthWeightGrams && <p className="text-xs text-slate-600">Birth Weight: {obs.birthWeightGrams}g</p>}
                {obs.complications && (
                  <div className="mt-2 text-xs bg-rose-50 text-rose-700 p-2 rounded-lg border border-rose-100">
                    <span className="font-semibold">Complications:</span> {obs.complications}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-center text-sm text-slate-500 italic">
          No prior obstetric history on record.
        </div>
      )}

      {/* Logout Action */}
      <form action={logoutPatient} className="mt-8">
        <button type="submit" className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-xl font-bold text-sm transition-colors active:scale-[0.98]">
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </form>
    </div>
  )
}
