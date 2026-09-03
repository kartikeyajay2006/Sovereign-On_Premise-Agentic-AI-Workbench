/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
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
