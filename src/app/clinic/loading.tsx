/**
 * The fallback for every clinic screen while it loads: an immediate, quiet
 * placeholder rather than a page that appears frozen after a click.
 */
export default function ClinicLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto flex w-full max-w-6xl animate-pulse flex-col gap-4 px-4 py-6 sm:px-6"
    >
      <div className="h-7 w-64 rounded bg-slate-200/80" />
      <div className="h-14 rounded-xl bg-slate-200/70" />
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-10 rounded bg-slate-200/70" />
        ))}
      </div>
    </main>
  )
}
