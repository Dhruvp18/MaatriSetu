'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { submitRegistration, type RegistrationState } from './actions'

/**
 * Nurse registration form.
 *
 * The acceptance criterion is under sixty seconds at a busy counter (PRD F1),
 * which drives every choice here: one column so there is no hunting, tab order
 * matching the order questions are actually asked, and only the fields that
 * cannot be filled in later. Blood group, ABHA and allergies are all optional —
 * a mother who does not know her blood group must not block the queue.
 */

const initialState: RegistrationState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'
const LABEL = 'mb-1.5 block text-sm font-medium text-slate-700'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Registering…' : 'Register patient'}
    </button>
  )
}

export function RegistrationForm() {
  const [state, formAction] = useActionState(submitRegistration, initialState)
  const [ageKind, setAgeKind] = useState<'ESTIMATED' | 'DATE_OF_BIRTH'>('ESTIMATED')
  const [allergyStatus, setAllergyStatus] = useState('UNKNOWN')

  if (state.status === 'registered') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-verified-700/30 bg-verified-50 p-4">
          <p className="text-sm font-medium text-verified-700">
            {state.fullName} is registered.
          </p>
          <p className="numeric mt-1 text-sm text-slate-700">{state.uhid}</p>
        </div>

        <p className="text-sm leading-relaxed text-slate-600">
          Next she needs a pregnancy episode opened and a file sticker printed.
          Neither screen is built yet, so nothing further has happened
          automatically.
        </p>

        <a
          href="/clinic/patients/new"
          className="inline-block rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
        >
          Register another
        </a>
      </div>
    )
  }

  const errorField = state.status === 'error' ? state.field : null

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="uhid" className={LABEL}>
          File number (UHID)
        </label>
        <input
          id="uhid"
          name="uhid"
          required
          autoFocus
          autoComplete="off"
          placeholder="MH-2026-89412"
          aria-invalid={errorField === 'uhid'}
          className={`${FIELD} numeric`}
        />
        <p className="mt-1 text-xs text-slate-500">
          As written on her paper file. Unique within this clinic.
        </p>
      </div>

      <div>
        <label htmlFor="fullName" className={LABEL}>
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          required
          autoComplete="off"
          aria-invalid={errorField === 'fullName'}
          className={FIELD}
        />
      </div>

      <fieldset>
        <legend className={LABEL}>Age</legend>
        {/*
          Most mothers state an age rather than produce a certificate, so the
          estimate is the default path and the documented date of birth is the
          exception — not the other way round.
        */}
        <div className="mb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ageKind"
              value="ESTIMATED"
              checked={ageKind === 'ESTIMATED'}
              onChange={() => setAgeKind('ESTIMATED')}
            />
            Stated age
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ageKind"
              value="DATE_OF_BIRTH"
              checked={ageKind === 'DATE_OF_BIRTH'}
              onChange={() => setAgeKind('DATE_OF_BIRTH')}
            />
            Date of birth
          </label>
        </div>

        {ageKind === 'ESTIMATED' ? (
          <input
            name="ageYears"
            type="number"
            min={9}
            max={70}
            required
            placeholder="26"
            aria-label="Age in years"
            aria-invalid={errorField === 'age'}
            className={`${FIELD} numeric`}
          />
        ) : (
          <input
            name="dateOfBirth"
            type="date"
            required
            aria-label="Date of birth"
            aria-invalid={errorField === 'age'}
            className={`${FIELD} numeric`}
          />
        )}
      </fieldset>

      <div>
        <label htmlFor="phone" className={LABEL}>
          Mobile number <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          placeholder="98331 00001"
          aria-invalid={errorField === 'contacts'}
          className={`${FIELD} numeric`}
        />
        <select name="relationship" aria-label="Whose number is this" className={`${FIELD} mt-2`}>
          <option value="SELF">Her own phone</option>
          <option value="HUSBAND">Husband</option>
          <option value="MOTHER_IN_LAW">Mother-in-law</option>
          <option value="MOTHER">Mother</option>
          <option value="OTHER_RELATIVE">Other relative</option>
          <option value="NEIGHBOUR">Neighbour</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Whose handset this is matters — numbers are shared, and a message is
          only ever matched to a patient through a verified contact.
        </p>
      </div>

      <div>
        <label htmlFor="bloodGroup" className={LABEL}>
          Blood group <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <select id="bloodGroup" name="bloodGroup" defaultValue="" className={FIELD}>
          {/*
            "Not recorded" is the default and is a real state, not a blank. It
            renders differently from a recorded group everywhere downstream,
            including on a handover slip.
          */}
          <option value="">Not recorded</option>
          <option value="O_POS">O positive</option>
          <option value="O_NEG">O negative</option>
          <option value="A_POS">A positive</option>
          <option value="A_NEG">A negative</option>
          <option value="B_POS">B positive</option>
          <option value="B_NEG">B negative</option>
          <option value="AB_POS">AB positive</option>
          <option value="AB_NEG">AB negative</option>
        </select>
      </div>

      <fieldset>
        <legend className={LABEL}>Allergies</legend>
        <select
          name="allergyStatus"
          value={allergyStatus}
          onChange={(e) => setAllergyStatus(e.target.value)}
          className={FIELD}
        >
          {/*
            Three states, deliberately. "Not asked yet" is the default and must
            never be recorded as "no allergies" — that difference is read at 2 AM
            off a referral slip.
          */}
          <option value="UNKNOWN">Not asked yet</option>
          <option value="NONE_KNOWN">Asked — none known</option>
          <option value="KNOWN">Asked — has allergies</option>
        </select>

        {allergyStatus === 'KNOWN' ? (
          <input
            name="allergySubstances"
            required
            placeholder="Penicillin, sulpha"
            aria-label="Allergies, separated by commas"
            aria-invalid={errorField === 'allergies'}
            className={`${FIELD} mt-2`}
          />
        ) : null}
      </fieldset>

      <div>
        <label htmlFor="abhaId" className={LABEL}>
          ABHA number <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="abhaId"
          name="abhaId"
          inputMode="numeric"
          autoComplete="off"
          placeholder="91-8273-1928-4412"
          aria-invalid={errorField === 'abhaId'}
          className={`${FIELD} numeric`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Recorded as stated. Not verified against ABDM — nothing here contacts
          it yet.
        </p>
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
