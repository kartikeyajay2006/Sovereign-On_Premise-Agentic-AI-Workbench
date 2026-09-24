import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { FOOTER, HERO } from './copy'
import { LandingButton } from './landing-button'
import { SHELL } from './tokens'
import { Wordmark } from './wordmark'

/**
 * The page's last band: the closing call, the links, and the name set large.
 *
 * It takes the dark palette whatever the page's theme, so the page ends the
 * way it opened, on the night ground, with a dot lattice and a glow that are
 * static CSS. Not SiteFooter, which calls an authenticated health endpoint
 * and would print "service unreachable" for every anonymous visitor: this
 * one states build-time facts only. The one live reading on the page lives
 * in the security section, framed as a reading.
 */
export function LandingFooter() {
  return (
    <footer data-theme="dark" data-band className="ae-footer">
      <div className={`${SHELL} pt-24 md:pt-32`}>
        <div className="mx-auto max-w-[760px] text-center">
          <p className="ae-kicker m-0 justify-center">{FOOTER.cta.eyebrow}</p>
          <h2 className="ae-h2 ae-footer-title mt-3">
            {FOOTER.cta.title} <span className="soft">{FOOTER.cta.turn}</span>
          </h2>
          <p className="ae-lead mx-auto mt-5 max-w-[52ch]">{FOOTER.cta.lede}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LandingButton href={HERO.primary.href} variant="primary" blockOnMobile>
              {HERO.primary.label}
              <span className="ar" aria-hidden>
                →
              </span>
            </LandingButton>
            <LandingButton href={HERO.secondary.href} variant="outline" rel="noreferrer" target="_blank" blockOnMobile>
              {HERO.secondary.label}
              <ArrowUpRight className="size-4 opacity-70" aria-hidden />
            </LandingButton>
          </div>
        </div>

        <div className="ae-footer-rule mt-20 md:mt-28" />

        <div className="grid grid-cols-2 gap-x-8 gap-y-12 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-4 md:col-span-1">
            <Wordmark />
            <p className="m-0 max-w-[34ch] text-[0.93rem] leading-[1.6] text-foreground-secondary">{FOOTER.blurb}</p>
            <span className="ae-footer-status text-[0.82rem] text-foreground-secondary">{FOOTER.status}</span>
          </div>

          {FOOTER.columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
              <span className="text-[0.8rem] font-medium text-foreground">{column.heading}</span>
              {column.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  {...(link.href.startsWith('http') ? { rel: 'noreferrer', target: '_blank' } : {})}
                  className="link text-[0.9rem]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}

          <div className="flex flex-col gap-3">
            <span className="text-[0.8rem] font-medium text-foreground">{FOOTER.build.heading}</span>
            {FOOTER.build.lines.map((line) => (
              <span key={line} className="font-mono text-[0.8rem] text-foreground-secondary">
                {line}
              </span>
            ))}
          </div>
        </div>

        <div className="ae-footer-rule" />
        <div className="flex flex-col gap-2 py-6 text-[0.8rem] text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{FOOTER.bottomLeft}</span>
          <span>{FOOTER.bottomRight}</span>
        </div>
      </div>

      <span aria-hidden className="ae-footer-mark">
        AEGIS
      </span>
    </footer>
  )
}
