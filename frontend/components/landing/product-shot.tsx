import Image from 'next/image'
import { MONO_META } from './tokens'

export interface ProductShotProps {
  /** What the reader is looking at, stated plainly. */
  caption: string
  /** The facts of the run in the image, so the picture can be checked. */
  facts: string[]
}

/**
 * A screenshot of the running product.
 *
 * Every section of this page was a bordered box of monospace text, which is
 * honest and completely monotonous — the reader has nothing to look at and no
 * sense of what the thing actually is. Nobody credible in this category leads
 * without showing the product.
 *
 * The spec's original cut list refused a screenshot, correctly at the time:
 * the interface was mid-rebuild and a stale image of a UI that no longer
 * exists is a liability. That is no longer true. This is the current console,
 * captured after the knowledge base was populated, on a run that actually
 * completed.
 *
 * It is framed rather than dropped in raw — a hairline, the page's own
 * elevation ring, and a caption naming the run's outcome, including the parts
 * that are unflattering. The image is cropped at the top so it reads as a
 * window onto the product rather than a rectangle floating on paper.
 */
export function ProductShot({ caption, facts }: ProductShotProps) {
  return (
    <figure className="mt-12 md:mt-16">
      <div className="overflow-hidden rounded-[var(--radius-lg-token)] bg-surface shadow-[var(--elev-2)]">
        {/*
          Height-capped with the top aligned, so the composer and the first
          turn are what a reader sees. `priority` because this is the largest
          element above the fold on a page served from the same host.
        */}
        <div className="relative max-h-[520px] overflow-hidden">
          <Image
            src="/landing/thread-run.png"
            alt="The AEGIS console after a completed run: a question about cladding damage severity, the verdict HELD with three of four checks passed, a folded work log reporting four of seven stages ran, and the answer with its clauses cited."
            width={1280}
            height={720}
            priority
            className="block h-auto w-full"
          />
          {/* The crop is deliberate, so it fades rather than guillotines. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{
              background: 'linear-gradient(to bottom, transparent, var(--background))',
            }}
          />
        </div>
      </div>

      <figcaption className="mt-4 flex flex-col gap-2">
        <p className="max-w-[72ch] text-ui text-foreground-secondary">{caption}</p>
        <ul className={`${MONO_META} flex flex-wrap gap-x-5 gap-y-1`}>
          {facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
