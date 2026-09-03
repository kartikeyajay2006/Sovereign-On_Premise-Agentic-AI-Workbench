/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workbench runs air-gapped: never phone home for telemetry or fonts.
  poweredByHeader: false,
  async rewrites() {
    const target = process.env.WORKBENCH_API_URL ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};
export default nextConfig;
