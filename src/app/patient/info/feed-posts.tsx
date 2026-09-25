import type { Route } from 'next'
import Link from 'next/link'
import Image, { type StaticImageData } from 'next/image'
import { ArrowRight } from 'lucide-react'

import { ImageCarousel } from './carousel'

/**
 * The information tab's feed cards.
 *
 * Three shapes, one visual language (a rounded white card with a small
 * coloured tag as its "header row", Instagram's own pattern for what kind of
 * account posted). Which shape a topic gets is a content decision made in
 * `page.tsx`, not here: an image post is for something the seeded infographics
 * already say well, a text post is a teaser for a fuller article, and a myth
 * post is one bite-sized myth/fact pair. Nothing here decides that split.
 */

function PostHeader({ tag, tagColor }: { tag: string; tagColor: string }) {
  return (
    <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tagColor }} />
      <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: tagColor }}>
        {tag}
      </span>
    </header>
  )
}

export function ImagePost({
  tag,
  tagColor,
  images,
  alt,
  caption,
}: {
  tag: string
  tagColor: string
  /** Never empty — a post always has at least one image. */
  images: readonly [StaticImageData, ...StaticImageData[]]
  alt: string
  caption: string
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <PostHeader tag={tag} tagColor={tagColor} />
      {images.length > 1 ? (
        <ImageCarousel images={images} alt={alt} />
      ) : (
        <div className="relative aspect-square w-full">
          <Image src={images[0]} alt={alt} fill sizes="(max-width: 480px) 100vw, 448px" className="object-cover" />
        </div>
      )}
      <p className="px-4 py-3.5 text-sm leading-relaxed text-slate-700">{caption}</p>
    </article>
  )
}

export function TextPost({
  tag,
  tagColor,
  bg,
  emoji,
  title,
  body,
  href,
  linkLabel,
}: {
  tag: string
  tagColor: string
  bg: string
  emoji: string
  title: string
  body: string
  href?: Route
  linkLabel?: string
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <PostHeader tag={tag} tagColor={tagColor} />
      <div className={`${bg} flex aspect-square w-full flex-col items-center justify-center gap-3 px-8 text-center`}>
        <span className="text-4xl">{emoji}</span>
        <h3 className="font-serif text-xl font-bold" style={{ color: tagColor }}>
          {title}
        </h3>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-sm leading-relaxed text-slate-700">{body}</p>
        {href ? (
          <Link
            href={href}
            className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold"
            style={{ color: tagColor }}
          >
            {linkLabel}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export function MythPost({ tag, myth, fact }: { tag: string; myth: string; fact: string }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <PostHeader tag={tag} tagColor="#a47b3b" />
      <div className="px-4 pb-4">
        <p className="mb-2 flex items-start gap-2 font-bold text-amber-800">
          <span aria-hidden className="text-lg leading-none">
            ❌
          </span>
          <span>{myth}</span>
        </p>
        <p className="flex items-start gap-2 pl-0.5 text-sm text-slate-700">
          <span aria-hidden className="text-lg leading-none">
            ✅
          </span>
          <span>{fact}</span>
        </p>
      </div>
    </article>
  )
}
