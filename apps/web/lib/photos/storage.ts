import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type PhotoToken = { key: string; op: "put" | "get"; sha256?: string; exp: number };

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) throw new Error("AUTH_SECRET is missing.");
  return value;
}

export function photosRoot() {
  if (process.env.PHOTO_LOCAL_DIR) return process.env.PHOTO_LOCAL_DIR;
  let dir = process.cwd();
  for (let step = 0; step < 4; step += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return path.join(dir, "data/photos");
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), "data/photos");
}

function s3Enabled() {
  return process.env.STORAGE_DRIVER === "s3" && Boolean(process.env.S3_BUCKET);
}

function s3() {
  return new S3Client({
    region: process.env.S3_REGION || process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    // Presigned uploads carry an explicit SHA-256 instead of a checksum of an empty body.
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

function sign(payload: PhotoToken) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyPhotoToken(token: string): PhotoToken | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as PhotoToken;
  if (!payload.key || payload.exp < Date.now()) return null;
  if (payload.key.includes("..") || payload.key.startsWith("/")) return null;
  return payload;
}

export type UploadTarget = { url: string; key: string; method: "PUT"; headers: Record<string, string> };

/**
 * The photo bucket uses Object Lock, so S3 refuses a PUT without a checksum header.
 * The browser sends the SHA-256 it computed; the signature covers it, so S3 also rejects
 * a file that does not match what was announced.
 */
export async function createUploadTarget(key: string, contentType: string, sha256: string): Promise<UploadTarget> {
  if (s3Enabled()) {
    const checksum = Buffer.from(sha256, "hex").toString("base64");
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType, ChecksumSHA256: checksum }),
      { expiresIn: 300, unhoistableHeaders: new Set(["x-amz-checksum-sha256"]) },
    );
    return { url, key, method: "PUT", headers: { "Content-Type": contentType, "x-amz-checksum-sha256": checksum } };
  }
  const token = sign({ key, op: "put", sha256, exp: Date.now() + 5 * 60 * 1000 });
  return { url: `/api/photos/upload?token=${encodeURIComponent(token)}`, key, method: "PUT", headers: { "Content-Type": contentType } };
}

export async function createDownloadUrl(key: string) {
  if (s3Enabled()) {
    return getSignedUrl(s3(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }), { expiresIn: 300 });
  }
  const token = sign({ key, op: "get", exp: Date.now() + 10 * 60 * 1000 });
  return `/api/photos/content?token=${encodeURIComponent(token)}`;
}

export async function writeLocalPhoto(key: string, bytes: Buffer, sha256?: string) {
  if (sha256 && createHash("sha256").update(bytes).digest("hex") !== sha256) {
    throw new Error("Please upload the photo again. The file did not match.");
  }
  const file = path.join(photosRoot(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function readLocalPhoto(key: string) {
  return readFile(path.join(photosRoot(), key));
}
