/**
 * S3-compatible storage via MinIO (Railway) or legacy Cloudflare R2.
 * Env: see .env.example — presigned PUT URLs use MINIO_PUBLIC_ENDPOINT; that host must be reachable from the browser.
 */
import { GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

type ResolvedStorage = {
  clientConfig: S3ClientConfig
  bucket: string
  /** Path-style base (no trailing slash) for fallback object URLs when no public base is set. */
  pathStyleBase: string
}

function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function resolveStorage(): ResolvedStorage {
  const minioEndpoint = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
  if (minioEndpoint) {
    const bucket = process.env.MINIO_BUCKET || ''
    return {
      clientConfig: {
        region: process.env.MINIO_REGION || 'us-east-1',
        endpoint: minioEndpoint,
        credentials: {
          accessKeyId: process.env.MINIO_ROOT_USER || '',
          secretAccessKey: process.env.MINIO_ROOT_PASSWORD || '',
        },
        forcePathStyle: true,
      },
      bucket,
      pathStyleBase: `${minioEndpoint}/${bucket}`,
    }
  }

  const account = process.env.R2_ACCOUNT_ID || ''
  const bucket = process.env.R2_BUCKET_NAME || ''
  const endpoint = account ? `https://${account}.r2.cloudflarestorage.com` : ''
  return {
    clientConfig: {
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    },
    bucket,
    pathStyleBase: endpoint && bucket ? `${endpoint}/${bucket}` : '',
  }
}

export function getS3Client(): S3Client {
  const { clientConfig } = resolveStorage()
  return new S3Client(clientConfig)
}

function bucketName(): string {
  return resolveStorage().bucket
}

/** Direct object URL using storage endpoint (path-style for MinIO). */
export function internalObjectUrl(key: string): string {
  const { pathStyleBase } = resolveStorage()
  if (!pathStyleBase) return ''
  return `${pathStyleBase}/${encodeKeyPath(key)}`
}

/**
 * URL AssemblyAI and the browser can fetch.
 * Set MINIO_PUBLIC_BASE_URL, or it defaults to MINIO_PUBLIC_ENDPOINT + "/" + MINIO_BUCKET when both are set.
 * Legacy: R2_PUBLIC_BASE_URL when using R2 (no MINIO_PUBLIC_ENDPOINT).
 */
export function publicObjectUrl(key: string): string {
  const explicit =
    process.env.MINIO_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
  if (explicit) {
    return `${explicit}/${encodeKeyPath(key)}`
  }

  const endpoint = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
  const bucket = process.env.MINIO_BUCKET || ''
  if (endpoint && bucket) {
    return `${endpoint}/${bucket}/${encodeKeyPath(key)}`
  }

  return internalObjectUrl(key)
}

export async function presignPutObject(objectKey: string, contentType: string, expiresIn = 3600) {
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
    ContentType: contentType,
  })
  return getSignedUrl(client, command, { expiresIn })
}

/** Download object to a file and return SHA-256 (hex) of stored bytes. */
export async function downloadObjectToFileAndHash(key: string, destPath: string): Promise<string> {
  const client = getS3Client()
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }),
  )
  if (!out.Body) throw new Error('Empty object body')

  const hash = createHash('sha256')
  const hasher = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      cb(null, chunk)
    },
  })

  await pipeline(out.Body as NodeJS.ReadableStream, hasher, createWriteStream(destPath))
  return hash.digest('hex')
}

/** Upload a local file (streams for large outputs). */
export async function uploadFileToObjectKey(
  localPath: string,
  key: string,
  contentType: string,
): Promise<void> {
  const client = getS3Client()
  const size = (await stat(localPath)).size
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      Body: createReadStream(localPath),
      ContentLength: size,
      ContentType: contentType,
    }),
  )
}
