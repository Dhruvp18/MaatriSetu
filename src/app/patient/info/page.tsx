import { getDashboard } from '@/modules/patient-portal/portal.service'
import { getPatientSession } from '../lib/session'
import { getPatientI18n } from '../lib/i18n/server'
import type { GuideSlug } from '../lib/i18n/locales'
import {
  Apple, Lightbulb, HelpCircle, Baby,
  HeartPulse, Building2, ShieldCheck, CalendarCheck, ShieldPlus,
  ChevronDown, AlertTriangle, Syringe, Hospital
} from 'lucide-react'

const guides: { slug: GuideSlug; icon: typeof Apple; color: string; bg: string }[] = [
  { slug: 'nutrition', icon: Apple, color: '#b84c63', bg: 'bg-[#ffe8ed]' },
  { slug: 'tips', icon: Lightbulb, color: '#456b9c', bg: 'bg-[#eaf4ff]' },
  { slug: 'myths', icon: HelpCircle, color: '#a47b3b', bg: 'bg-[#fff1da]' },
  { slug: 'breastfeeding', icon: Baby, color: '#5c4a9c', bg: 'bg-[#eeeaff]' },
  { slug: 'vaccines', icon: Syringe, color: '#2d7a4f', bg: 'bg-emerald-50' },
  { slug: 'hospital-bag', icon: Hospital, color: '#c2410c', bg: 'bg-orange-50' },
]

const schemes = [
  { key: 'pmmvy', icon: HeartPulse, color: '#b84c63', bg: 'bg-[#ffe8ed]' },
  { key: 'jsy', icon: Building2, color: '#456b9c', bg: 'bg-[#eaf4ff]' },
  { key: 'jssk', icon: ShieldCheck, color: '#a47b3b', bg: 'bg-[#fff1da]' },
  { key: 'pmsma', icon: CalendarCheck, color: '#5c4a9c', bg: 'bg-[#eeeaff]' },
  { key: 'suman', icon: ShieldPlus, color: '#2d7a4f', bg: 'bg-emerald-50' },
] as const

export default async function InfoPage() {
  const [session, { t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const info = t.info
  let trimesterTip: string | null = null

  if (session) {
    const data = await getDashboard(session)
    if (data.trimester) trimesterTip = info.trimesterTips[data.trimester]
  }

  return (
    <div className="p-4 pt-8">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">{info.title}</h1>
      <p className="text-sm text-slate-500 italic mb-6">{info.subtitle}</p>

      {/* Danger Signs */}
      <div className="mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> {info.dangerTitle}
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          {info.dangerSigns.map((sign, idx) => (
            <li key={idx} className="text-xs text-rose-800 leading-relaxed font-medium">
              {sign}
            </li>
          ))}
        </ul>
      </div>

      {/* Personalised trimester tip */}
      {trimesterTip && (
        <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-100 rounded-2xl p-4 mb-6 shadow-sm">
          <p className="text-sm text-[#8a3c4a] font-medium leading-relaxed">{trimesterTip}</p>
        </div>
      )}

      {/* Guides Section */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-[#456b9c] mb-3 font-serif flex items-center gap-2">
          <span>📚</span> {info.guidesTitle}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {guides.map(({ slug, icon: Icon, color, bg }) => (
            <a
              key={slug}
              href={`/patient/info/${slug}`}
              className={`${bg} p-3 rounded-xl shadow-sm flex flex-col gap-2 hover:shadow-md transition-shadow active:scale-[0.98]`}
            >
              <Icon className="w-5 h-5" style={{ color }} />
              <h3 className="font-bold text-sm" style={{ color }}>{info.guides[slug]}</h3>
            </a>
          ))}
        </div>
      </div>

      {/* Government Schemes — accordion style */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-[#b84c63] mb-3 font-serif flex items-center gap-2">
          <span>🛡️</span> {info.schemesTitle}
        </h2>
        <div className="space-y-2">
          {schemes.map(({ key, icon: Icon, color, bg }) => (
            <details key={key} className={`${bg} rounded-xl shadow-sm overflow-hidden group`}>
              <summary className="flex items-center gap-3 p-3 cursor-pointer list-none">
                <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                <span className="font-bold text-sm flex-1" style={{ color }}>{info.schemes[key].name}</span>
                <ChevronDown
                  className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180"
                  style={{ color }}
                />
              </summary>
              <div className="px-4 pb-4 pt-1">
                <p className="text-xs leading-relaxed text-slate-600 italic">{info.schemes[key].desc}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
