import type { Route } from 'next'
import Link from 'next/link'
import { User, FileText, UploadCloud, FileSymlink, Activity, LogOut } from 'lucide-react'
import { getDashboard, getMonitoring } from '@/modules/patient-portal/portal.service'
import { getPatientSession } from './lib/session'
import { getPatientI18n } from './lib/i18n/server'
import { fmt, formatDate } from './lib/i18n/locales'
import { logoutPatient } from './logout-action'

export default async function MyANCPage() {
  const [session, { lang, t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const h = t.home

  // Show a "scan your QR" prompt if not authenticated
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-8 text-center">
        <div className="text-5xl mb-4">📷</div>
        <h2 className="text-xl font-bold text-[#8a3c4a] font-serif mb-2">{h.scanTitle}</h2>
        <p className="text-sm text-slate-500 italic leading-relaxed">
          {h.scanBody}
        </p>
        <p className="mt-6 text-xs text-slate-400">
          {t.scan.noSticker}{' '}
          <Link href={'/patient/login' as Route} className="font-semibold text-[#b84c63] hover:underline">
            {t.scan.chooseInstead}
          </Link>
        </p>
      </div>
    )
  }

  const [data, monitoring] = await Promise.all([getDashboard(session), getMonitoring(session)])
  const hasMonitoring = monitoring.panels.length > 0

  return (
    <div className="p-4 pt-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-rose-100 rounded-full flex items-center justify-center shadow-sm">
            <span className="text-xl">🤰</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium">{h.welcome}</p>
            <h1 className="text-base font-bold text-slate-800">{data.fullName}</h1>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <form action={logoutPatient}>
            <button
              type="submit"
              aria-label={t.profile.logout}
              title={t.profile.logout}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-white/80 text-[#8a3c4a] shadow-sm transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-[#743140] active:scale-95"
            >
              <LogOut aria-hidden className="h-3.5 w-3.5" />
            </button>
          </form>
          <div className="text-right">
            <p className="text-[10px] text-slate-400">{h.uhid}</p>
            <p className="text-xs font-mono font-bold text-slate-600">{data.uhid}</p>
          </div>
        </div>
      </div>

      {/* Hero card — pregnancy status */}
      <div className="bg-gradient-to-br from-rose-50 via-white to-blue-50 p-4 rounded-2xl mb-6 shadow-sm border border-rose-100">
        {data.hasActivePregnancy ? (
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-500 mb-1 italic">{h.currentPregnancy}</p>
              {data.gestationalAge ? (
                <p className="text-2xl font-bold text-[#8a3c4a] font-serif">
                  {fmt(h.gestationAge, { weeks: data.gestationalAge.weeks, days: data.gestationalAge.days })}
                  <span className="text-sm font-normal text-slate-500 ml-1">{h.gestation}</span>
                </p>
              ) : (
                <p className="text-base font-bold text-slate-500 italic">{h.datingNotEstablished}</p>
              )}
              {data.edd && (
                <p className="text-xs text-slate-500 mt-1">
                  {h.expected} <span className="font-semibold text-slate-700">{formatDate(data.edd, lang)}</span>
                </p>
              )}
            </div>
            <div className="text-5xl">
              {data.trimester === 1 ? '🌱' : data.trimester === 2 ? '🤰' : '👼'}
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-slate-500 italic text-sm">{h.noActivePregnancy}</p>
          </div>
        )}
      </div>

      {/* Visit info strip */}
      {data.hasActivePregnancy && (
        <div className="flex gap-3 mb-6">
          {data.lastVisitDate && (
            <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-[10px] text-slate-400 mb-1">{h.lastVisit}</p>
              <p className="text-sm font-bold text-slate-700">{formatDate(data.lastVisitDate, lang)}</p>
            </div>
          )}
          {/* Always beside the last visit, so she knows when she is due back. */}
          <div className="flex-1 bg-amber-50 rounded-xl p-3 border border-amber-100">
            <p className="text-[10px] text-amber-600 mb-1">{h.nextFollowUp}</p>
            <p className="text-sm font-bold text-amber-700">
              {data.nextFollowUpDate ? formatDate(data.nextFollowUpDate, lang) : h.notBookedYet}
            </p>
          </div>
        </div>
      )}

      {/* Grid Menu */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { href: '/patient/profile', icon: User, ...h.tiles.profile, bg: 'bg-[#ffe8ed]', color: '#b84c63', textColor: '#8a3c4a' },
          { href: '/patient/prescriptions', icon: FileText, ...h.tiles.prescriptions, bg: 'bg-[#eaf4ff]', color: '#456b9c', textColor: '#456b9c' },
          { href: '/patient/scan-report', icon: UploadCloud, ...h.tiles.scanReport, bg: 'bg-[#fff1da]', color: '#a47b3b', textColor: '#a47b3b' },
          { href: '/patient/reports', icon: FileSymlink, ...h.tiles.reports, bg: 'bg-[#eeeaff]', color: '#5c4a9c', textColor: '#5c4a9c' },
          ...(hasMonitoring
            ? [{ href: '/patient/monitoring', icon: Activity, ...h.tiles.monitoring, bg: 'bg-[#e9f7ef]', color: '#2f855a', textColor: '#2f855a' }]
            : []),
        ].map(({ href, icon: Icon, label, desc, bg, color, textColor }) => (
          <Link
            key={href}
            href={href as Route}
            className={`${bg} p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm hover:shadow-md transition-shadow active:scale-[0.98]`}
          >
            <div>
              <div
                className="w-8 h-8 mb-2 flex items-center justify-center border-2 rounded-lg"
                style={{ borderColor: color, color }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm" style={{ color: textColor }}>{label}</h3>
              <p className="text-[10px] leading-tight mt-1 italic" style={{ color: `${color}cc` }}>{desc}</p>
            </div>
            <div
              className="absolute bottom-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
              style={{ color }}
            >
              →
            </div>
          </Link>
        ))}
      </div>

      <p className="text-sm text-slate-400 italic font-serif text-center px-4 pb-4">
        {h.tagline} <span className="text-pink-300">❤</span>
      </p>
    </div>
  )
}
