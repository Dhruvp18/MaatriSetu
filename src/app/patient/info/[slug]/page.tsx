import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Apple, Lightbulb, HelpCircle, Baby, Syringe, Hospital } from 'lucide-react'
import { getPatientI18n } from '../../lib/i18n/server'
import { isGuideSlug, type ArticleBlock, type GuideSlug } from '../../lib/i18n/locales'
import { Rich } from '../../lib/i18n/rich'

// Look and feel per guide. The words live in the dictionaries.
const STYLES: Record<GuideSlug, { icon: typeof Apple; color: string; bg: string }> = {
  nutrition: { icon: Apple, color: '#b84c63', bg: 'bg-[#ffe8ed]' },
  tips: { icon: Lightbulb, color: '#456b9c', bg: 'bg-[#eaf4ff]' },
  myths: { icon: HelpCircle, color: '#a47b3b', bg: 'bg-[#fff1da]' },
  breastfeeding: { icon: Baby, color: '#5c4a9c', bg: 'bg-[#eeeaff]' },
  vaccines: { icon: Syringe, color: '#2d7a4f', bg: 'bg-emerald-50' },
  'hospital-bag': { icon: Hospital, color: '#c2410c', bg: 'bg-orange-50' },
}

function Block({ block, labels }: { block: ArticleBlock; labels: { myth: string; fact: string } }) {
  switch (block.kind) {
    case 'lead':
      return <p className="font-medium text-slate-800"><Rich text={block.text} /></p>
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-2">
          {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
        </ul>
      )
    case 'tip':
      return (
        <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
          <p className="text-sm font-bold text-rose-800 mb-1">{block.title}</p>
          <p className="text-xs text-rose-700 leading-relaxed"><Rich text={block.text} /></p>
        </div>
      )
    case 'myth':
      return (
        <div>
          <p className="font-bold text-amber-800 flex items-center gap-2 mb-1">
            <span className="text-xl">❌</span> {labels.myth} {block.myth}
          </p>
          <p className="text-sm pl-7">
            <span className="font-bold text-emerald-600">{labels.fact}</span> <Rich text={block.fact} />
          </p>
        </div>
      )
    case 'card':
      return (
        <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-emerald-800 mb-2">{block.title}</h3>
          <ul className="list-disc pl-4 space-y-2 text-sm">
            {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
          </ul>
        </div>
      )
    case 'group':
      return (
        <div>
          <h3 className="font-bold text-orange-800 mb-2 border-b border-orange-100 pb-1">{block.title}</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
          </ul>
        </div>
      )
    case 'note':
      return <p className="text-sm italic text-slate-500"><Rich text={block.text} /></p>
  }
}

export default async function GuideArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, { t }] = await Promise.all([params, getPatientI18n()])

  if (!isGuideSlug(slug)) {
    notFound()
  }

  const { title, blocks } = t.article.articles[slug]
  const { icon: Icon, color, bg } = STYLES[slug]
  const spacious = blocks.some((b) => b.kind === 'myth' || b.kind === 'group')

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link
          href="/patient/info"
          aria-label={t.article.back}
          className="p-2 -ml-2 rounded-full hover:bg-slate-50 active:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-slate-600" />
        </Link>
        <h1 className="font-bold text-slate-800 text-lg font-serif">{t.article.header}</h1>
      </div>

      <div className="p-4 pt-6">
        <div className={`${bg} rounded-2xl p-6 mb-6 flex flex-col items-center text-center shadow-sm`}>
          <div className="bg-white p-4 rounded-full shadow-sm mb-3">
            <Icon className="w-8 h-8" style={{ color }} />
          </div>
          <h2 className="text-2xl font-bold font-serif" style={{ color }}>{title}</h2>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-sm leading-relaxed">
          <div className={`${spacious ? 'space-y-6' : 'space-y-4'} text-slate-700`}>
            {blocks.map((block, i) => (
              <Block key={i} block={block} labels={{ myth: t.article.myth, fact: t.article.fact }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
