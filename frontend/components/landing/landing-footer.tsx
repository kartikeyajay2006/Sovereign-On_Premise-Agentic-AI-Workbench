import Link from 'next/link'
import { FOOTER } from './copy'
import { recordedEgress } from './landing-data'
import { EgressChip } from './live-egress'
import { Wordmark } from './wordmark'

/**
 * The page's close: a brand column and four columns of links on 1px rules,
 * a thin base row, and the name set huge at 6% ink, fading into the ground.
 *
 * Every link resolves: the anchors are this page's sections, and every
 * GitHub link is a file checked on the branch it names (copy.ts). The chip is
 * the hero's egress reading, read live by the visitor's browser.
 *
 * Not SiteFooter, which calls an authenticated health endpoint. There is no
 * theme switch: the public page is drawn on one ground, hi-vis night, whatever
 * the app's theme ((marketing)/layout.tsx pins data-theme="dark").
 */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-shell">
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
      <div className="lp-giant" aria-hidden>
        <span>{FOOTER.giant}</span>
      </div>
    </footer>
  )
}
