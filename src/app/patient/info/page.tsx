import { getPatientSession } from '../lib/session'
import { getPatientDashboard } from '../lib/data'
import {
  Apple, Lightbulb, HelpCircle, Baby,
  HeartPulse, Building2, ShieldCheck, CalendarCheck, ShieldPlus,
  ChevronDown, AlertTriangle, Syringe, Hospital
} from 'lucide-react'

const guides = [
  { icon: Apple, label: 'Nutrition & Diet', color: '#b84c63', bg: 'bg-[#ffe8ed]', href: '/patient/info/nutrition' },
  { icon: Lightbulb, label: 'Daily Tips', color: '#456b9c', bg: 'bg-[#eaf4ff]', href: '/patient/info/tips' },
  { icon: HelpCircle, label: 'Myth Busters', color: '#a47b3b', bg: 'bg-[#fff1da]', href: '/patient/info/myths' },
  { icon: Baby, label: 'Breastfeeding', color: '#5c4a9c', bg: 'bg-[#eeeaff]', href: '/patient/info/breastfeeding' },
  { icon: Syringe, label: 'Vaccines', color: '#2d7a4f', bg: 'bg-emerald-50', href: '/patient/info/vaccines' },
  { icon: Hospital, label: 'Hospital Bag', color: '#c2410c', bg: 'bg-orange-50', href: '/patient/info/hospital-bag' },
]

const dangerSigns = [
  'Heavy bleeding or spotting',
  'Severe abdominal pain or cramping',
  'Leaking fluid from the vagina',
  'Sudden swelling of face, hands, or feet',
  'Severe headaches or blurred vision',
  'Baby stops moving or moves much less',
  'High fever or chills',
]

const schemes = [
  {
    icon: HeartPulse, color: '#b84c63', bg: 'bg-[#ffe8ed]',
    name: 'Pradhan Mantri Matru Vandana Yojana (PMMVY)',
    desc: 'Financial support of ₹5,000 in 3 instalments for pregnant and lactating women for their first living child.',
  },
  {
    icon: Building2, color: '#456b9c', bg: 'bg-[#eaf4ff]',
    name: 'Janani Suraksha Yojana (JSY)',
    desc: 'Financial assistance for eligible women who deliver in a government health facility — cash benefit goes directly to the mother.',
  },
  {
    icon: ShieldCheck, color: '#a47b3b', bg: 'bg-[#fff1da]',
    name: 'Janani Shishu Suraksha Karyakram (JSSK)',
    desc: 'Entitlement to free delivery, C-section, medicines, diagnostics, blood, diet, and transport at government health facilities.',
  },
  {
    icon: CalendarCheck, color: '#5c4a9c', bg: 'bg-[#eeeaff]',
    name: 'Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)',
    desc: 'Free comprehensive ANC check-up including ultrasound, blood tests, and specialist consultation on the 9th of every month.',
  },
  {
    icon: ShieldPlus, color: '#2d7a4f', bg: 'bg-emerald-50',
    name: 'SUMAN — Surakshit Matritva Aashwasan',
    desc: 'Your rights: respectful care, zero discrimination, free essential medicines, referral transport, and zero out-of-pocket cost.',
  },
]

// Trimester-personalised tip strip
const trimesterTips: Record<1 | 2 | 3, string> = {
  1: '🌱 First trimester: Folic acid is very important right now. Take your supplements every day and eat leafy greens.',
  2: '🤰 Second trimester: Your baby can now hear sounds! Keep taking iron tablets and sleep on your left side for better blood flow.',
  3: '👼 Third trimester: Count your baby\'s kicks daily — 10 kicks in 2 hours is a good sign. Prepare your bag for delivery.',
}

export default async function InfoPage() {
  const session = await getPatientSession()
  let trimesterTip: string | null = null

  if (session) {
    const data = await getPatientDashboard(session)
    if (data.trimester) trimesterTip = trimesterTips[data.trimester]
  }

  return (
    <div className="p-4 pt-8">
      <h1 className="text-xl font-bold text-slate-800 font-serif mb-1">Information & Support</h1>
      <p className="text-sm text-slate-500 italic mb-6">Helpful guides, tips, and your rights</p>

      {/* Danger Signs */}
      <div className="mb-6 bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold text-rose-700 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Danger Signs (Call Doctor Immediately)
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          {dangerSigns.map((sign, idx) => (
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
          <span>📚</span> Helpful Guides
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {guides.map(({ icon: Icon, label, color, bg, href }) => (
            <a
              key={label}
              href={href}
              className={`${bg} p-3 rounded-xl shadow-sm flex flex-col gap-2 hover:shadow-md transition-shadow active:scale-[0.98]`}
            >
              <Icon className="w-5 h-5" style={{ color }} />
              <h3 className="font-bold text-sm" style={{ color }}>{label}</h3>
            </a>
          ))}
        </div>
      </div>

      {/* Government Schemes — accordion style */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-[#b84c63] mb-3 font-serif flex items-center gap-2">
          <span>🛡️</span> Government Schemes
        </h2>
        <div className="space-y-2">
          {schemes.map(({ icon: Icon, color, bg, name, desc }) => (
            <details key={name} className={`${bg} rounded-xl shadow-sm overflow-hidden group`}>
              <summary className="flex items-center gap-3 p-3 cursor-pointer list-none">
                <Icon className="w-5 h-5 shrink-0" style={{ color }} />
                <span className="font-bold text-sm flex-1" style={{ color }}>{name}</span>
                <ChevronDown
                  className="w-4 h-4 shrink-0 transition-transform group-open:rotate-180"
                  style={{ color }}
                />
              </summary>
              <div className="px-4 pb-4 pt-1">
                <p className="text-xs leading-relaxed text-slate-600 italic">{desc}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
