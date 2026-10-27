import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

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
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
