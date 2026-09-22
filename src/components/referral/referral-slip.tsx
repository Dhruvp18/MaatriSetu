import { formatClinicDateTime, formatClinicTime } from '@core/time/clinic-time'
import {
  describeCertainty,
  describeSnapshotAllergies,
  describeSnapshotBloodGroup,
  describeSnapshotDating,
  describeUterineScar,
  formatDose,
  formatElapsed,
  formatGpla,
  formatResult,
  type ReferralSnapshot,
  type SnapshotDose,
  transferVitalsAsQuantities,
} from '@modules/referrals/referral.types'

/**
 * The emergency referral slip.
 *
 * ---------------------------------------------------------------------------
 * Why this is one component
 * ---------------------------------------------------------------------------
 * The printed page and the tokenized page render THIS, from the same frozen
 * snapshot. Two renderers would be two documents that drift, and a printed slip
 * that contradicts the QR code stapled beside it is worse than having neither —
 * the receiving unit then has to decide which one to believe, at 2 AM, about a
 * patient they have never seen.
 *
 * ---------------------------------------------------------------------------
 * The rule this component exists to obey
 * ---------------------------------------------------------------------------
 * A blank is never a negative finding. Every field that can be unknown arrives
 * as a tagged value, and every one of them prints a sentence saying it was not
 * recorded. There is no branch in here that renders an empty string for missing
 * data, and the footer says so in words for the reader who does not know this
 * system's conventions.
 *
 * Imports only the referrals module's types (ARCH-1): no service, no
 * repository, no database client. Everything it needs is already in the blob.
 */

export function ReferralSlip({
  snapshot,
  now,
}: {
  snapshot: ReferralSnapshot
  /** Supplied by the caller so elapsed times render deterministically. */
  now: Date
}) {
  const zone = snapshot.timeZone

  return (
    <article className="mx-auto max-w-[190mm] bg-white p-6 text-black print:max-w-none print:p-0">
      <header className="border-b-2 border-black pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-wide uppercase">Emergency referral</h1>
            <p className="mt-0.5 text-sm">{snapshot.referringFacility.name}</p>
            {snapshot.referringFacility.address ? (
              <p className="text-xs">{snapshot.referringFacility.address}</p>
            ) : null}
            {snapshot.referringFacility.phone ? (
              <p className="numeric text-xs">Tel {snapshot.referringFacility.phone}</p>
            ) : null}
          </div>
          <div className="text-right text-xs">
            <p className="numeric font-semibold">
              {formatClinicDateTime(snapshot.issuedAt, zone)}
            </p>
            <p>Times shown on the issuing clinic&rsquo;s clock.</p>
          </div>
        </div>
      </header>

      {/*
        The indication comes first and largest. It is the single question the
        receiving unit is answering when they pick the slip up, and burying it
        under demographics is how a transfer gets triaged wrong.
      */}
      <Section title="Reason for referral">
        <p className="text-base leading-snug font-semibold">{snapshot.indication}</p>
      </Section>

      <Section title="Patient">
        <Facts
          rows={[
            ['Name', snapshot.patient.fullName, false],
            ['File number', snapshot.patient.uhid, true],
            [
              'Age',
              snapshot.patient.age.status === 'UNKNOWN'
                ? 'Not recorded'
                : `${snapshot.patient.age.years} y${
                    snapshot.patient.age.basis === 'STATED' ? ' (stated, not documented)' : ''
                  }`,
              true,
            ],
            ['Blood group', describeSnapshotBloodGroup(snapshot.patient.bloodGroup), true],
          ]}
        />

        {/*
          Allergy state is boxed rather than listed, in all three of its values.
          "Not recorded" is printed as loudly as a known allergy: a receiving
          unit about to prescribe needs to know it is looking at a gap and not
          at a clean history.
        */}
        <p
          className={`mt-2 border-2 px-3 py-1.5 text-sm font-semibold ${
            snapshot.patient.allergies.status === 'NONE_KNOWN'
              ? 'border-black'
              : 'border-black bg-black text-white print:bg-white print:text-black print:underline'
          }`}
        >
          Allergies: {describeSnapshotAllergies(snapshot.patient.allergies)}
        </p>
      </Section>

      <Section title="This pregnancy">
        <Facts
          rows={[
            ['Gestation at issue', describeSnapshotDating(snapshot.pregnancy.dating), true],
            [
              'Estimated due date',
              snapshot.pregnancy.dating.status === 'ESTABLISHED'
                ? snapshot.pregnancy.dating.estimatedDueDate
                : 'Not established',
              true,
            ],
            ['G / P / L / A', formatGpla(snapshot.pregnancy), true],
            ['Previous uterine scar', describeUterineScar(snapshot.pregnancy.uterineScar), false],
          ]}
        />
      </Section>

      {/*
        The reason this feature exists.
        Every line is a dose that was GIVEN, from `medication_administrations`,
        never an order from `prescriptions`. The elapsed time is the operative
        number: it decides whether the next magnesium sulphate dose is due,
        early, or dangerous.
      */}
      <Section title="Drugs given before transfer">
        {snapshot.preReferralDoses.length === 0 ? (
          <p className="text-sm">
            No doses recorded at the referring facility. This is the absence of a
            record, not a statement that nothing was given &mdash; ask the escort.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {snapshot.preReferralDoses.map((dose, index) => (
              <li key={`${dose.medicineName}-${dose.administeredAt}-${index}`} className="print-keep">
                <DoseLine dose={dose} zone={zone} now={now} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Observations at transfer">
        {snapshot.transferVitals.status === 'NOT_RECORDED' ? (
          <p className="text-sm">No transfer observations recorded.</p>
        ) : (
          <div>
            <p className="numeric mb-1 text-xs">
              Taken at {formatClinicTime(snapshot.transferVitals.recordedAt, zone)} (
              {formatElapsed(snapshot.transferVitals.recordedAt, now)})
            </p>
            <p className="numeric text-sm">
              {transferVitalsAsQuantities(snapshot.transferVitals)
                .map((q) => `${q.label} ${q.value}${q.unit ? ` ${q.unit}` : ''}`)
                .join('  ·  ')}
            </p>
          </div>
        )}
      </Section>

      <Section title="Vaginal examination">
        {snapshot.examination.status === 'NOT_PERFORMED' ? (
          <p className="text-sm">Not performed, or not recorded.</p>
        ) : (
          <div>
            <p className="numeric mb-1 text-xs">
              {formatClinicTime(snapshot.examination.examinedAt, zone)}
              {snapshot.examination.examinedBy ? ` · ${snapshot.examination.examinedBy}` : ''}
            </p>
            <Facts
              rows={[
                [
                  'Dilatation',
                  snapshot.examination.dilatationCm === null
                    ? 'Not recorded'
                    : `${snapshot.examination.dilatationCm} cm`,
                  true,
                ],
                [
                  'Effacement',
                  snapshot.examination.effacementPercent === null
                    ? 'Not recorded'
                    : `${snapshot.examination.effacementPercent} %`,
                  true,
                ],
                ['Station', snapshot.examination.station ?? 'Not recorded', true],
                ['Membranes', membraneLabel(snapshot.examination.membranes), false],
                ['Liquor', snapshot.examination.liquor ?? 'Not recorded', false],
              ]}
            />
          </div>
        )}
      </Section>

      {snapshot.clinicalSummary ? (
        <Section title="Clinical summary">
          <p className="text-sm leading-relaxed whitespace-pre-line">{snapshot.clinicalSummary}</p>
        </Section>
      ) : null}

      <Section title="Recent verified results">
        {snapshot.recentResults.length === 0 ? (
          <p className="text-sm">No verified results on record for this pregnancy.</p>
        ) : (
          <ul className="numeric grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {snapshot.recentResults.map((result, index) => (
              <li key={`${result.testName}-${result.observedDate}-${index}`} className="print-keep">
                {result.testName}{' '}
                <strong>{formatResult(result) ?? 'not recorded'}</strong>{' '}
                <span className="text-xs">({result.observedDate})</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Transfer">
        <Facts
          rows={[
            ['Referred to', snapshot.receivingFacility.name, false],
            ['Their contact', snapshot.receivingFacility.contact ?? 'Not recorded', true],
            ['Mode', snapshot.transfer.mode ?? 'Not recorded', false],
            [
              'Left at',
              snapshot.transfer.departureAt
                ? formatClinicDateTime(snapshot.transfer.departureAt, zone)
                : 'Not recorded',
              true,
            ],
            ['Escorted by', snapshot.transfer.accompanyingStaff ?? 'Not recorded', false],
            [
              'Lines and catheters in situ',
              snapshot.transfer.linesAndCatheters ?? 'Not recorded',
              false,
            ],
          ]}
        />
      </Section>

      <footer className="mt-5 border-t-2 border-black pt-3 text-xs">
        <p className="font-semibold">
          Issued by {snapshot.issuedBy.name}
          {snapshot.issuedBy.registrationNo ? ` · ${snapshot.issuedBy.registrationNo}` : ''}
          {snapshot.referringFacility.doctorName &&
          snapshot.referringFacility.doctorName !== snapshot.issuedBy.name
            ? ` · referring clinician ${snapshot.referringFacility.doctorName}`
            : ''}
        </p>
        {/*
          Spelled out for a reader who has never seen this system. Without it,
          "Not recorded" is easy to read as a formatting artefact rather than as
          the clinically significant statement it is.
        */}
        <p className="mt-1">
          Every field on this document is either a recorded value or the words
          &ldquo;not recorded&rdquo;. A field marked not recorded is a gap in the
          record, NOT a negative finding.
        </p>
        <p className="mt-1">
          This document was frozen when it was issued and does not change. A
          correction is issued as a new referral that replaces this one.
        </p>
      </footer>
    </article>
  )
}

/**
 * One administered dose.
 *
 * The elapsed time is set in bold beside the clock time on purpose. A reader
 * under pressure subtracts wrongly; the slip does the arithmetic once, here,
 * and shows its working by printing both.
 */
function DoseLine({ dose, zone, now }: { dose: SnapshotDose; zone: string; now: Date }) {
  return (
    <div className="border-l-4 border-black pl-2.5 text-sm">
      <p className="numeric font-semibold">{formatDose(dose)}</p>
      <p className="numeric text-xs">
        {formatClinicTime(dose.administeredAt, zone)} &mdash;{' '}
        <strong>{formatElapsed(dose.administeredAt, now)}</strong>
        {dose.facility ? ` · at ${dose.facility}` : ''}
        {/*
          Certainty always prints. "A nurse watched this go in" and "the
          attendant thinks she had something" are both worth recording and must
          never look the same on paper.
        */}
        {` · ${describeCertainty(dose.certainty)}`}
      </p>
      {dose.note ? <p className="text-xs">{dose.note}</p> : null}
    </div>
  )
}

function membraneLabel(status: 'INTACT' | 'RUPTURED' | 'NOT_ASSESSED'): string {
  switch (status) {
    case 'INTACT':
      return 'Intact'
    case 'RUPTURED':
      return 'Ruptured'
    case 'NOT_ASSESSED':
      return 'Not assessed'
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-keep mt-4">
      <h2 className="mb-1.5 border-b border-black text-[11px] font-bold tracking-wider uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** `[label, value, isNumeric]` rows. Numeric values get tabular figures. */
function Facts({ rows }: { rows: ReadonlyArray<readonly [string, string, boolean]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, value, numeric]) => (
        <div key={label} className="contents">
          <dt>{label}</dt>
          <dd className={numeric ? 'numeric' : ''}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
