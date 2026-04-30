/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  transpilePackages: ["fbg-games"],
  env: {
    ROOT: __dirname,
  },
};

module.exports = nextConfig;
