import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(__dirname, "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@marimail/db", "@marimail/types", "@marimail/utils", "@marimail/email"],
  webpack: (config) => {
    // `@marimail/db` is path-mapped to its TypeScript SOURCE (see
    // tsconfig.base.json), so webpack compiles that package itself. The package
    // builds for Node under `moduleResolution: NodeNext`, which REQUIRES a
    // ".js" suffix on relative imports — a suffix that names a file webpack
    // cannot find, because on disk it is ".ts".
    //
    // This teaches webpack the same rule TypeScript uses: try the .ts source
    // for a ".js" specifier, and fall back to a real .js file. Without it,
    // adding any second module to that package breaks the client build, which
    // is exactly what happened.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
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
