'use client'

import { useRef, useState } from 'react'
import Image, { type StaticImageData } from 'next/image'

/**
 * A swipeable image carousel, Instagram-post style.
 *
 * Native scroll-snap rather than a JS drag handler: it works with the
 * browser's own touch physics on a phone, needs no gesture library, and the
 * only script here is the dot indicator following the scroll position.
 */
export function ImageCarousel({ images, alt }: { images: readonly StaticImageData[]; alt: string }) {
  const [active, setActive] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  function onScroll() {
    const el = trackRef.current
    if (!el || el.clientWidth === 0) return
    setActive(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {images.map((img, i) => (
          <div key={i} className="relative aspect-square w-full shrink-0 snap-center">
            <Image
              src={img}
              alt={`${alt} — ${i + 1}/${images.length}`}
              fill
              sizes="(max-width: 480px) 100vw, 448px"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {images.length > 1 ? (
        <div className="pointer-events-none absolute bottom-2.5 left-1/2 flex -translate-x-1/2 gap-1.5">
          {images.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full transition-colors ${i === active ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
