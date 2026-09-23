import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Apple, Lightbulb, HelpCircle, Baby, Syringe, Hospital } from 'lucide-react'

const ARTICLES: Record<string, {
  title: string
  icon: any
  color: string
  bg: string
  content: React.ReactNode
}> = {
  'nutrition': {
    title: 'Nutrition & Diet',
    icon: Apple,
    color: '#b84c63',
    bg: 'bg-[#ffe8ed]',
    content: (
      <div className="space-y-4 text-slate-700">
        <p className="font-medium text-slate-800">Eating right is essential for your health and your baby's growth.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Eat often:</strong> Have 3 regular meals and 2 healthy snacks daily.</li>
          <li><strong>Stay hydrated:</strong> Drink at least 8-10 glasses of water every day.</li>
          <li><strong>Iron-rich foods:</strong> Include spinach (palak), jaggery (gud), dates, and beans to prevent anemia.</li>
          <li><strong>Vitamins:</strong> Eat colorful fruits and vegetables daily for essential vitamins.</li>
        </ul>
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl mt-4">
          <p className="text-sm font-bold text-rose-800 mb-1">Important Tip</p>
          <p className="text-xs text-rose-700 leading-relaxed">
            Take your Calcium and Iron-Folic Acid (IFA) tablets as prescribed, but <strong>never take them together</strong>. Keep a gap of at least 2 hours between them.
          </p>
        </div>
      </div>
    )
  },
  'tips': {
    title: 'Daily Care Tips',
    icon: Lightbulb,
    color: '#456b9c',
    bg: 'bg-[#eaf4ff]',
    content: (
      <div className="space-y-4 text-slate-700">
        <p className="font-medium text-slate-800">Small changes in your daily routine can make a big difference.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Sleep position:</strong> Try to sleep on your left side. It improves blood flow to your baby and your kidneys.</li>
          <li><strong>Stay active:</strong> Take short walks (20-30 minutes) every day unless your doctor advised bed rest.</li>
          <li><strong>Clothing:</strong> Wear comfortable, loose-fitting cotton clothes and flat shoes.</li>
          <li><strong>Avoid heavy work:</strong> Do not lift heavy objects or do strenuous physical work that tires you out.</li>
          <li><strong>Rest:</strong> Take at least 2 hours of rest during the day and sleep for 8 hours at night.</li>
        </ul>
      </div>
    )
  },
  'myths': {
    title: 'Myth Busters',
    icon: HelpCircle,
    color: '#a47b3b',
    bg: 'bg-[#fff1da]',
    content: (
      <div className="space-y-6 text-slate-700">
        <div>
          <p className="font-bold text-amber-800 flex items-center gap-2 mb-1">
            <span className="text-xl">❌</span> Myth: You must "eat for two".
          </p>
          <p className="text-sm pl-7">
            <span className="font-bold text-emerald-600">Fact:</span> You only need about 300-350 extra calories per day in your second and third trimesters. Focus on quality, not just quantity.
          </p>
        </div>
        <div>
          <p className="font-bold text-amber-800 flex items-center gap-2 mb-1">
            <span className="text-xl">❌</span> Myth: Ghee makes normal delivery easier.
          </p>
          <p className="text-sm pl-7">
            <span className="font-bold text-emerald-600">Fact:</span> Drinking excessive ghee does not lubricate the birth canal. It only causes unwanted weight gain and acidity.
          </p>
        </div>
        <div>
          <p className="font-bold text-amber-800 flex items-center gap-2 mb-1">
            <span className="text-xl">❌</span> Myth: Ripe papaya causes miscarriage.
          </p>
          <p className="text-sm pl-7">
            <span className="font-bold text-emerald-600">Fact:</span> Completely ripe papaya is safe in moderation. However, <em>unripe</em> or semi-ripe papaya should be avoided.
          </p>
        </div>
      </div>
    )
  },
  'breastfeeding': {
    title: 'Breastfeeding Guide',
    icon: Baby,
    color: '#5c4a9c',
    bg: 'bg-[#eeeaff]',
    content: (
      <div className="space-y-4 text-slate-700">
        <p className="font-medium text-slate-800">Mother's milk is the best gift you can give your baby.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Start early:</strong> Begin breastfeeding within the first hour of normal birth.</li>
          <li><strong>Liquid Gold:</strong> The first thick, yellowish milk (Colostrum) is rich in antibodies. It acts as the baby's first vaccine. <em>Never throw it away.</em></li>
          <li><strong>Exclusive feeding:</strong> Give <strong>only</strong> breast milk for the first 6 months. No water, honey, ghutti, or animal milk is needed.</li>
          <li><strong>On demand:</strong> Feed your baby whenever they cry or show signs of hunger (8-12 times a day).</li>
        </ul>
      </div>
    )
  },
  'vaccines': {
    title: 'Vaccination Schedule',
    icon: Syringe,
    color: '#2d7a4f',
    bg: 'bg-emerald-50',
    content: (
      <div className="space-y-4 text-slate-700">
        <p className="font-medium text-slate-800">Vaccines protect both you and your baby from dangerous infections.</p>
        <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-emerald-800 mb-2">Tetanus & Diphtheria (Td)</h3>
          <ul className="list-disc pl-4 space-y-2 text-sm">
            <li><strong>Td-1:</strong> Given early in pregnancy during your first ANC visit.</li>
            <li><strong>Td-2:</strong> Given 4 weeks after the first dose.</li>
            <li><strong>Booster:</strong> If you had a pregnancy with two Td doses in the last 3 years, you only need one Booster dose this time.</li>
          </ul>
        </div>
        <p className="text-sm italic text-slate-500 mt-2">
          Keep your ANC card safe! It contains your complete vaccination record.
        </p>
      </div>
    )
  },
  'hospital-bag': {
    title: 'Hospital Bag Checklist',
    icon: Hospital,
    color: '#c2410c',
    bg: 'bg-orange-50',
    content: (
      <div className="space-y-6 text-slate-700">
        <p className="font-medium text-slate-800">Pack your bag by the 8th month so you are ready when it's time!</p>
        
        <div>
          <h3 className="font-bold text-orange-800 mb-2 border-b border-orange-100 pb-1">📄 Documents</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>Your MaatriSetu ANC Card</li>
            <li>Aadhaar Card or ID proof</li>
            <li>All previous ultrasound scans and blood test reports</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-orange-800 mb-2 border-b border-orange-100 pb-1">👩 For Mother</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>2-3 loose, front-open cotton nightgowns (for easy breastfeeding)</li>
            <li>Maternity sanitary pads (1-2 packs)</li>
            <li>Undergarments and comfortable clothes for going home</li>
            <li>Basic toiletries (toothbrush, soap, towel, comb)</li>
            <li>A warm shawl or sweater if it is cold</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-orange-800 mb-2 border-b border-orange-100 pb-1">👶 For Baby</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            <li>4-5 washed, soft cotton clothes (jhablas)</li>
            <li>Soft cotton nappies or newborn diapers</li>
            <li>2-3 soft receiving blankets to swaddle the baby</li>
            <li>Cap, socks, and mittens</li>
          </ul>
        </div>
      </div>
    )
  }
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = ARTICLES[slug]

  if (!article) {
    notFound()
  }

  const { title, icon: Icon, color, bg, content } = article

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/patient/info" className="p-2 -ml-2 rounded-full hover:bg-slate-50 active:bg-slate-100 transition-colors">
          <ChevronLeft className="w-6 h-6 text-slate-600" />
        </Link>
        <h1 className="font-bold text-slate-800 text-lg font-serif">Guide</h1>
      </div>

      <div className="p-4 pt-6">
        <div className={`${bg} rounded-2xl p-6 mb-6 flex flex-col items-center text-center shadow-sm`}>
          <div className="bg-white p-4 rounded-full shadow-sm mb-3">
            <Icon className="w-8 h-8" style={{ color }} />
          </div>
          <h2 className="text-2xl font-bold font-serif" style={{ color }}>{title}</h2>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-sm leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  )
}
