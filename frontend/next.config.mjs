// The landing page at `/` claims there is no CDN, no analytics and no
// third-party script on it. A claim a browser does not enforce is a slogan, so
// the browser enforces it, and the header itself is one of the four proof
// artifacts the page shows.
//
// The clause that carries that claim is not script-src. It is `default-src
// 'self'` together with `connect-src 'self'`, `font-src 'self'` and `img-src
// 'self' data:`: every origin this document may fetch from, connect to or
// render is this one. No CDN, no analytics endpoint, no embed.
//
// 'unsafe-inline' appears twice, for the same mechanical reason both times.
// Next streams both its styles and its RSC payload as inline <script> and
// <style> elements with no nonce -- `self.__next_f.push(...)` is how the
// server component tree reaches the client at all -- and a nonce would require
// middleware and force every route to render dynamically, which costs the
// static prerender of this page. Without it the document is served, parsed,
// and never hydrates: the CSP would silently break the product in order to
// decorate the marketing page. It permits inline code from this document only
// and loads nothing over the network, so it does not weaken the claim the page
// actually makes. 'unsafe-eval' is development-only; Turbopack's HMR runtime
// needs it and `next start` does not.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  process.env.NODE_ENV === 'development'
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors fail the build. This was previously ignored, which is how a
    // page shipped rendering fields the API does not return: the mismatch was
    // reported and then thrown away.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },

  // The screen names changed when the interface was rebuilt. An open tab or a
  // bookmark on an old path should still land somewhere useful rather than on
  // a 404 with no way forward.
  async redirects() {
    return [
      // `/console` used to redirect to `/`. It is now the console's real home
      // and `/` is the public landing page, so that entry is gone: leaving it
      // in would shadow the route it is supposed to reach.
      { source: '/workspace', destination: '/console', permanent: false },
      { source: '/library', destination: '/registry', permanent: false },
      { source: '/knowledge', destination: '/registry', permanent: false },
      { source: '/record', destination: '/audit', permanent: false },
      // The thread absorbed both dispatchers. Ask was the console with the
      // deliverable format fixed to "answer", and a task is now an assistant
      // turn, so a separate list of them is a second place to look for
      // something already on screen. These follow the thread to /console —
      // a bookmarked /tasks must not dump an operator on the marketing page.
      { source: '/ask', destination: '/console', permanent: false },
      { source: '/tasks', destination: '/console', permanent: false },
      { source: '/history', destination: '/console', permanent: false },
    ]
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },

  async rewrites() {
    const target = process.env.WORKBENCH_API_URL ?? 'http://127.0.0.1:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${target}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
