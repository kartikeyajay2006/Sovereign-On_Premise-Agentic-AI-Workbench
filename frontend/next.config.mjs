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
      { source: '/console', destination: '/', permanent: false },
      { source: '/workspace', destination: '/', permanent: false },
      { source: '/library', destination: '/registry', permanent: false },
      { source: '/knowledge', destination: '/registry', permanent: false },
      { source: '/record', destination: '/audit', permanent: false },
      // The thread absorbed both dispatchers. Ask was the console with the
      // deliverable format fixed to "answer", and a task is now an assistant
      // turn, so a separate list of them is a second place to look for
      // something already on screen.
      { source: '/ask', destination: '/', permanent: false },
      { source: '/tasks', destination: '/', permanent: false },
      { source: '/history', destination: '/', permanent: false },
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
