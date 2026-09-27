import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { FOOTER, HERO } from './copy'
import { recordedEgress } from './landing-data'
import { EgressChip } from './live-egress'
import { FooterGiant } from './footer-giant'
import { Wordmark } from './wordmark'

/**
 * The page's close, in the Hi-Vis voice.
 *
 * First the last word: the hero's claim once more, light with its key word
 * heavy, and the one lime action. Then a brand column and four columns of
 * links on 1px rules, a thin base row, and the name set huge at 6% ink with
 * a lime seal, which the hero's scan line crosses once when it comes into
 * view -- the page ends on the motion it began with.
 *
 * Every link resolves: the anchors are this page's sections, and every
 * GitHub link is a file checked on the branch it names (copy.ts); those
 * leave the page and carry an arrow saying so. The chip is the hero's
 * egress reading, read live by the visitor's browser.
 *
 * Not SiteFooter, which calls an authenticated health endpoint. There is no
 * theme switch: the public page is drawn on one ground, hi-vis night, whatever
 * the app's theme ((marketing)/layout.tsx pins data-theme="dark").
 */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-shell">
        <div className="lp-close">
          <p className="lp-close-title">
            {FOOTER.close.title} <b>{FOOTER.close.titleKey}</b>
          </p>
          <Link href={HERO.primary.href} className="lp-btn primary">
            {HERO.primary.label}
            <span className="ar" aria-hidden>
              →
            </span>
          </Link>
        </div>

        <div className="lp-footer-grid">
          <div className="brand">
            <Wordmark />
            <p className="blurb">{FOOTER.blurb}</p>
            <EgressChip recorded={recordedEgress} />
          </div>
          {FOOTER.columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3>{column.heading}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('http') ? (
                      <a href={link.href} rel="noreferrer" target="_blank">
                        {link.label}
                        <ArrowUpRight className="out" aria-hidden />
                      </a>
                    ) : link.href.startsWith('#') ? (
                      <a href={link.href}>{link.label}</a>
                    ) : (
                      <Link href={link.href}>{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="lp-footer-base">
          <span>{FOOTER.copyright}</span>
          <span>{FOOTER.bottomRight}</span>
        </div>
      </div>
      <FooterGiant word={FOOTER.giant} />
    </footer>
  )
}
