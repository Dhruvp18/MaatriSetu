/**
 * Shown the instant a cockpit is opened, while its record is read.
 *
 * The shape matches the real page — banner, reports strip, accordions — so the
 * screen does not jump when the record arrives, and a click never looks like it
 * did nothing.
 */
export default function CockpitLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading the patient’s record"
      className="mx-auto flex w-full max-w-7xl animate-pulse flex-col gap-3 p-3 sm:p-5"
    >
      <div className="flex justify-between gap-3">
        <Bar className="h-7 w-36" />
        <div className="flex gap-2">
          <Bar className="h-7 w-24" />
          <Bar className="h-7 w-28" />
          <Bar className="h-7 w-28" />
        </div>
      </div>

      <div className="glass flex flex-col gap-3 rounded-xl border border-slate-200/90 p-4">
        <div className="flex items-center gap-3">
          <Bar className="h-14 w-16 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Bar className="h-5 w-56" />
            <Bar className="h-3.5 w-80 max-w-full" />
          </div>
          <Bar className="hidden h-7 w-44 rounded-full sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="h-8" />
          ))}
        </div>
      </div>

      <div className="glass rounded-xl border border-caution-200/70 p-3">
        <Bar className="mb-3 h-5 w-72 max-w-full" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Bar key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>

      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="glass rounded-xl border border-slate-200/90 px-4 py-3">
          <Bar className="h-5 w-64 max-w-full" />
        </div>
      ))}
    </main>
  )
}

function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-slate-200/80 ${className}`} />
}
