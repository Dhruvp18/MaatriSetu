import type { Route } from 'next'
import { AlertTriangle } from 'lucide-react'

import { getDashboard } from '@/modules/patient-portal/portal.service'
import { getPatientSession } from '../lib/session'
import { getPatientI18n } from '../lib/i18n/server'
import type { ArticleBlock, GuideSlug } from '../lib/i18n/locales'

import colostrum1 from '@/images/colostrum-1.jpg'
import colostrum2 from '@/images/colostrum-2.jpg'
import schemeJsy from '@/images/scheme-jsy.jpg'
import mythEatForTwoImg from '@/images/myth-eat-for-two.jpg'
import lineaNigraImg from '@/images/linea-nigra.jpg'
import papSmearImg from '@/images/pap-smear.jpg'
import vaccinesTdFluImg from '@/images/vaccines-td-flu.jpg'
import emotionalWellbeingImg from '@/images/emotional-wellbeing.jpg'
import schemeSumanImg from '@/images/scheme-suman.jpg'

import { ImagePost, TextPost, MythPost } from './feed-posts'

/**
 * Information tab: danger signs and the trimester tip stay put at the top —
 * safety content earns a fixed place, not a slot in a feed she might scroll
 * past. Below that, one scrollable feed replaces the old "Helpful Guides"
 * grid and "Government Schemes" accordion.
 *
 * Every fact lives in exactly one place. Where a seeded infographic
 * (src/images) already covers a topic — colostrum, the JSY and SUMAN
 * schemes, the "eat for two" myth — that image is the post, and the matching
 * sentence was removed from the text guide it used to live in (see
 * breastfeeding/myths in the dictionaries). Where there is no image, the
 * guide's own lead line becomes a short teaser card linking to the full
 * article, so nothing is stated twice at full length.
 */

const guideHref = (slug: GuideSlug): Route => `/patient/info/${slug}` as Route

function leadOf(blocks: readonly ArticleBlock[]): string {
  return blocks.find((b): b is Extract<ArticleBlock, { kind: 'lead' }> => b.kind === 'lead')?.text ?? ''
}

export default async function InfoPage() {
  const [session, { t }] = await Promise.all([getPatientSession(), getPatientI18n()])
  const info = t.info
  const feed = t.feed
  let trimesterTip: string | null = null

  if (session) {
    const data = await getDashboard(session)
    if (data.trimester) trimesterTip = info.trimesterTips[data.trimester]
  }

  const myths = t.article.articles.myths.blocks.filter(
    (b): b is Extract<ArticleBlock, { kind: 'myth' }> => b.kind === 'myth',
  )

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

      {/* The feed */}
      <div className="mb-2">
        <h2 className="text-base font-bold text-[#8a3c4a] mb-1 font-serif flex items-center gap-2">
          <span>📱</span> {feed.title}
        </h2>
        <p className="text-xs text-slate-500 italic mb-4">{feed.subtitle}</p>
      </div>

      <div className="flex flex-col gap-5 pb-4">
        <ImagePost
          tag={info.guides.breastfeeding}
          tagColor="#5c4a9c"
          images={[colostrum1, colostrum2]}
          alt={info.guides.breastfeeding}
          caption={feed.colostrumCaption}
        />

        <TextPost
          tag={info.guides.nutrition}
          tagColor="#b84c63"
          bg="bg-[#ffe8ed]"
          emoji="🍎"
          title={info.guides.nutrition}
          body={leadOf(t.article.articles.nutrition.blocks)}
          href={guideHref('nutrition')}
          linkLabel={feed.readFullGuide}
        />

        <ImagePost
          tag={feed.tagMythBuster}
          tagColor="#a47b3b"
          images={[mythEatForTwoImg]}
          alt={feed.tagMythBuster}
          caption={feed.eatForTwoCaption}
        />

        {myths[0] ? <MythPost tag={feed.tagMythBuster} myth={myths[0].myth} fact={myths[0].fact} /> : null}

        <ImagePost
          tag={feed.tagBodyChanges}
          tagColor="#8a3c4a"
          images={[lineaNigraImg]}
          alt={feed.lineaNigraTitle}
          caption={feed.lineaNigraCaption}
        />

        <TextPost
          tag={info.guides.tips}
          tagColor="#456b9c"
          bg="bg-[#eaf4ff]"
          emoji="💡"
          title={info.guides.tips}
          body={leadOf(t.article.articles.tips.blocks)}
          href={guideHref('tips')}
          linkLabel={feed.readFullGuide}
        />

        <ImagePost
          tag={feed.tagScreening}
          tagColor="#b84c63"
          images={[papSmearImg]}
          alt={feed.papSmearTitle}
          caption={feed.papSmearCaption}
        />

        {myths[1] ? <MythPost tag={feed.tagMythBuster} myth={myths[1].myth} fact={myths[1].fact} /> : null}

        <ImagePost
          tag={feed.tagGovernmentScheme}
          tagColor="#2d7a4f"
          images={[schemeJsy]}
          alt={info.schemes.jsy.name}
          caption={info.schemes.jsy.desc}
        />

        <ImagePost
          tag={info.guides.vaccines}
          tagColor="#2d7a4f"
          images={[vaccinesTdFluImg]}
          alt={info.guides.vaccines}
          caption={feed.vaccinesCaption}
        />

        <TextPost
          tag={info.guides.vaccines}
          tagColor="#2d7a4f"
          bg="bg-emerald-50"
          emoji="💉"
          title={info.guides.vaccines}
          body={leadOf(t.article.articles.vaccines.blocks)}
          href={guideHref('vaccines')}
          linkLabel={feed.seeDosingSchedule}
        />

        <ImagePost
          tag={feed.tagEmotionalWellbeing}
          tagColor="#b84c63"
          images={[emotionalWellbeingImg]}
          alt={feed.emotionalWellbeingTitle}
          caption={feed.emotionalWellbeingCaption}
        />

        <TextPost
          tag={info.guides['hospital-bag']}
          tagColor="#c2410c"
          bg="bg-orange-50"
          emoji="🎒"
          title={info.guides['hospital-bag']}
          body={leadOf(t.article.articles['hospital-bag'].blocks)}
          href={guideHref('hospital-bag')}
          linkLabel={feed.readFullGuide}
        />

        <ImagePost
          tag={feed.tagGovernmentScheme}
          tagColor="#2d7a4f"
          images={[schemeSumanImg]}
          alt={info.schemes.suman.name}
          caption={info.schemes.suman.desc}
        />

        <TextPost
          tag={feed.tagGovernmentScheme}
          tagColor="#b84c63"
          bg="bg-[#ffe8ed]"
          emoji="🏛️"
          title={info.schemes.pmmvy.name}
          body={info.schemes.pmmvy.desc}
        />

        <TextPost
          tag={feed.tagGovernmentScheme}
          tagColor="#a47b3b"
          bg="bg-[#fff1da]"
          emoji="🏥"
          title={info.schemes.jssk.name}
          body={info.schemes.jssk.desc}
        />

        <TextPost
          tag={feed.tagGovernmentScheme}
          tagColor="#5c4a9c"
          bg="bg-[#eeeaff]"
          emoji="📅"
          title={info.schemes.pmsma.name}
          body={info.schemes.pmsma.desc}
        />
      </div>
    </div>
  )
}
