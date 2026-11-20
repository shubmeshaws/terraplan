import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface ArtifactStoreConfig {
  /** When set, objects go to this S3 bucket. */
  bucket?: string;
  region?: string;
  prefix?: string;
  /** Fallback directory when bucket is unset (local/dev). */
  localDir: string;
}

export interface UploadedArtifact {
  /** Stable key stored on the Run row (s3 key or local: relative path). */
  key: string;
  /** Where it landed: s3 or local filesystem. */
  backend: 's3' | 'local';
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return '';
  return prefix.replace(/^\/+|\/+$/g, '') + '/';
}

export function artifactKey(
  cfg: ArtifactStoreConfig,
  runId: string,
  filename: string,
): string {
  return `${normalizePrefix(cfg.prefix)}runs/${runId}/${filename}`;
}

/**
 * Uploads a local file (or in-memory body) to S3 when configured, otherwise
 * writes under `localDir`. Returns the key to persist on the Run.
 */
export async function putArtifact(
  cfg: ArtifactStoreConfig,
  key: string,
  body: string | Buffer | NodeJS.ReadableStream,
  contentType: string,
): Promise<UploadedArtifact> {
  if (cfg.bucket) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: cfg.region || 'us-east-1' });
    const payload =
      typeof body === 'string' || Buffer.isBuffer(body)
        ? body
        : await streamToBuffer(body);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: payload,
        ContentType: contentType,
      }),
    );
    return { key, backend: 's3' };
  }

  const dest = resolve(cfg.localDir, key);
  await mkdir(dirname(dest), { recursive: true });
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    await writeFile(dest, body);
  } else {
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(body, createWriteStream(dest));
  }
  return { key, backend: 'local' };
}

export async function putArtifactFile(
  cfg: ArtifactStoreConfig,
  key: string,
  filePath: string,
  contentType: string,
): Promise<UploadedArtifact> {
  if (!existsSync(filePath)) {
    throw new Error(`Artifact file missing: ${filePath}`);
  }
  if (cfg.bucket) {
    return putArtifact(cfg, key, createReadStream(filePath), contentType);
  }
  return putArtifact(cfg, key, createReadStream(filePath), contentType);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Resolve a stored key to a local path when using the filesystem backend. */
export function localArtifactPath(cfg: ArtifactStoreConfig, key: string): string {
  return join(resolve(cfg.localDir), key);
}

/**
 * Downloads an artifact to `destPath`. Supports S3 when bucket is set, otherwise
 * copies from the local artifacts directory.
 */
export async function getArtifactFile(
  cfg: ArtifactStoreConfig,
  key: string,
  destPath: string,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true });
  if (cfg.bucket) {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({ region: cfg.region || 'us-east-1' });
    const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty S3 object for ${key}`);
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(res.Body as NodeJS.ReadableStream, createWriteStream(destPath));
    return;
  }
  const src = localArtifactPath(cfg, key);
  if (!existsSync(src)) throw new Error(`Artifact not found locally: ${key}`);
  const { copyFile } = await import('node:fs/promises');
  await copyFile(src, destPath);
}
