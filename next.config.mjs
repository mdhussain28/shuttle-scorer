/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint setup is included, so don't let the build look for one.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
