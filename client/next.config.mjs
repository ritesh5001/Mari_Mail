import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@marimail/db", "@marimail/types", "@marimail/utils", "@marimail/email"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
    outputFileTracingRoot: monorepoRoot,
    outputFileTracingIncludes: {
      "*": [
        "../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*",
        "../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*",
      ],
    },
  },
  async rewrites() {
    const backend = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
    if (!backend) return [];
    return [
      {
        source: "/backend/:path*",
        destination: `${backend.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
