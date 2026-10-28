import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
config({ path: path.join(root, ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@redlady/core", "@redlady/db"],
  serverExternalPackages: [
    "@prisma/client",
    "bcryptjs",
    "pg",
    "@aws-sdk/client-sns",
    "@aws-sdk/client-s3",
    "@aws-sdk/client-secrets-manager",
    "@aws-sdk/s3-request-presigner",
  ],
  // The Prisma clients live in packages/db. Copy their query engines next to the server
  // chunks so they are found on Amplify, where the build-time path no longer exists.
  webpack: (webpackConfig, { isServer }) => {
    if (isServer) webpackConfig.plugins = [...webpackConfig.plugins, new PrismaPlugin()];
    return webpackConfig;
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
