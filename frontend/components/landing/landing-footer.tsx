import Link from 'next/link'
import { AegisLogo } from '@/components/aegis-logo'
import { FOOTER } from './copy'
import { MONO_LABEL, MONO_VALUE, SHELL } from './tokens'

/**
 * Not SiteFooter.
 *
 * SiteFooter calls api.health(), which is authenticated; on a public page it
 * would render "service unreachable" in four places for every anonymous
 * visitor. This footer states build-time facts only. The one live reading on
 * the page lives in section 05, where it is framed as a reading.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className={`${SHELL} grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <AegisLogo variant="mark" size={24} />
            <span className="text-body font-medium tracking-[-0.01em] text-foreground">AEGIS</span>
          </div>
          <p className="max-w-[34ch] text-body text-foreground-secondary">{FOOTER.blurb}</p>
        </div>

        {FOOTER.columns.map((column) => (
          <nav key={column.heading} aria-label={column.heading} className="flex flex-col gap-3">
            <span className={MONO_LABEL}>{column.heading}</span>
            {column.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...(link.href.startsWith('http') ? { rel: 'noreferrer', target: '_blank' } : {})}
                className="text-body text-foreground-secondary transition-colors duration-[150ms] hover:text-foreground hover:duration-0 motion-reduce:transition-none"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}

        <div className="flex flex-col gap-3">
          <span className={MONO_LABEL}>{FOOTER.build.heading}</span>
          {FOOTER.build.lines.map((line) => (
            <span key={line} className={MONO_VALUE}>
              {line}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-border">
        <div
          className={`${SHELL} flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between`}
        >
          <span className="font-mono text-meta font-[425] text-foreground-secondary">
            {FOOTER.bottomLeft}
          </span>
          <span className="font-mono text-meta font-[425] text-foreground-secondary">
            {FOOTER.bottomRight}
          </span>
        </div>
      </div>
    </footer>
  )
}
