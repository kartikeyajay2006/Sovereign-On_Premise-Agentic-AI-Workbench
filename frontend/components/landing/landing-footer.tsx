import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { FOOTER, HERO } from './copy'
import { Wordmark } from './wordmark'

/**
 * The page's last band: the closing line, the links, and the name set large.
 *
 * Night whatever the page's theme, so the page ends on the ground it opened
 * on. Not SiteFooter, which calls an authenticated health endpoint and would
 * print "service unreachable" for every anonymous visitor: this one states
 * build-time facts only.
 */
export function LandingFooter() {
  return (
    <footer data-theme="dark" data-band className="lp-night lp-footer">
      <div className="lp-shell">
        <div className="lp-footer-cta">
          <p className="lp-kicker">{FOOTER.cta.eyebrow}</p>
          <h2 className="lp-footer-title">
            {FOOTER.cta.title} <em>{FOOTER.cta.turn}</em>
          </h2>
          <p className="lp-lede">{FOOTER.cta.lede}</p>
          <div className="lp-footer-actions">
            <Link href={HERO.primary.href} className="lp-btn primary">
              {HERO.primary.label}
              <span className="ar" aria-hidden>
                →
              </span>
            </Link>
            <a href={HERO.secondary.href} rel="noreferrer" target="_blank" className="lp-btn ghost">
              {HERO.secondary.label}
              <ArrowUpRight className="size-4 opacity-70" aria-hidden />
            </a>
          </div>
        </div>

        <div className="lp-footer-grid">
          <div>
            <Wordmark />
            <p className="blurb">{FOOTER.blurb}</p>
          </div>
          {FOOTER.columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h3>{column.heading}</h3>
              {column.links.map((link) =>
                link.href.startsWith('http') ? (
                  <a key={link.href} href={link.href} rel="noreferrer" target="_blank">
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          ))}
          <div>
            <h3>{FOOTER.build.heading}</h3>
            {FOOTER.build.lines.map((line) => (
              <span key={line} className="val">
                {line}
              </span>
            ))}
          </div>
        </div>

        <div className="lp-footer-base">
          <span>{FOOTER.bottomLeft}</span>
          <span>{FOOTER.bottomRight}</span>
        </div>
      </div>
      <span aria-hidden className="lp-footer-mark">
        AEGIS
      </span>
    </footer>
  )
}
