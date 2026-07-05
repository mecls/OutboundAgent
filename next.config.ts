import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CSV uploads + scraped enrichment payloads can be sizeable — keep server
  // action / route bodies generous.
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
}

export default nextConfig
