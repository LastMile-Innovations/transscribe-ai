/**
 * S3-compatible storage via MinIO (Railway) or legacy Cloudflare R2.
 * Env: see .env.example — presigned PUT URLs and browser/transcription GET URLs use MINIO_PUBLIC_ENDPOINT.
 * Server SDK calls and path-style internal URLs prefer MINIO_PRIVATE_ENDPOINT when set (Railway private network).
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
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

type ObjectUrlMode = 'public' | 'presigned'

const DEFAULT_BROWSER_PRESIGN_EXPIRES_SEC = 60 * 60 * 24
const DEFAULT_TRANSCRIPTION_PRESIGN_EXPIRES_SEC = 60 * 60 * 24 * 2
const DEFAULT_UPLOAD_PRESIGN_EXPIRES_SEC = 60 * 60
const MIN_MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024
const DEFAULT_MULTIPART_PART_SIZE_BYTES = 32 * 1024 * 1024
const DEFAULT_MULTIPART_THRESHOLD_BYTES = 256 * 1024 * 1024

function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function readObjectUrlMode(envName: string, fallback: ObjectUrlMode): ObjectUrlMode {
  const raw = process.env[envName]?.trim().toLowerCase()
  if (raw === 'public' || raw === 'presigned') return raw
  return fallback
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return Math.trunc(raw)
}

function storageAccessKeyId(): string {
  return process.env.MINIO_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || ''
}

function storageSecretAccessKey(): string {
  return process.env.MINIO_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || ''
}

function publicPresignClient(): S3Client | null {
  const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
  if (!minioPublic) return null
  return new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1',
    endpoint: minioPublic,
    credentials: {
      accessKeyId: storageAccessKeyId(),
      secretAccessKey: storageSecretAccessKey(),
    },
    forcePathStyle: true,
  })
}

function resolveStorage(): ResolvedStorage {
  const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
  const minioPrivate = process.env.MINIO_PRIVATE_ENDPOINT?.replace(/\/$/, '')
  if (minioPublic || minioPrivate) {
    const bucket = process.env.MINIO_BUCKET || ''
    /** Presigned PUTs and `publicObjectUrl` use the public API host (browser + AssemblyAI). */
    /** Server-side SDK calls and path-style “internal” URLs prefer the private endpoint when set. */
    const sdkEndpoint = minioPrivate || minioPublic
    const pathBaseEndpoint = minioPrivate || minioPublic
    return {
      clientConfig: {
        region: process.env.MINIO_REGION || 'us-east-1',
        endpoint: sdkEndpoint,
        credentials: {
          accessKeyId: storageAccessKeyId(),
          secretAccessKey: storageSecretAccessKey(),
        },
        forcePathStyle: true,
      },
      bucket,
      pathStyleBase: `${pathBaseEndpoint}/${bucket}`,
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
        accessKeyId: storageAccessKeyId(),
        secretAccessKey: storageSecretAccessKey(),
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

/** Best-effort removal of objects after a project row is deleted. Logs per-key failures. */
export async function deleteStorageObjectsByKeys(keys: string[]): Promise<void> {
  const bucket = bucketName()
  if (!bucket || keys.length === 0) return
  const client = getS3Client()
  await Promise.all(
    keys.map((key) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch((err) => {
        console.error(`deleteStorageObjectsByKeys: failed for "${key}"`, err)
      }),
    ),
  )
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

export function browserObjectUrlMode(): ObjectUrlMode {
  // Default to presigned URLs because many MinIO deployments keep buckets private.
  return readObjectUrlMode('MINIO_BROWSER_URL_MODE', 'presigned')
}

export function transcriptionObjectUrlMode(): ObjectUrlMode {
  // Default to presigned URLs so transcription does not assume anonymous bucket reads.
  return readObjectUrlMode('MINIO_TRANSCRIPTION_URL_MODE', 'presigned')
}

export function unsignedPublicObjectUrlExpectedStatus(): 200 | 403 {
  return browserObjectUrlMode() === 'public' || transcriptionObjectUrlMode() === 'public' ? 200 : 403
}

export function browserObjectUrlExpiresInSec(): number {
  return readPositiveIntEnv('MINIO_BROWSER_PRESIGN_EXPIRES_SEC', DEFAULT_BROWSER_PRESIGN_EXPIRES_SEC)
}

export function transcriptionObjectUrlExpiresInSec(): number {
  return readPositiveIntEnv(
    'MINIO_TRANSCRIPTION_PRESIGN_EXPIRES_SEC',
    DEFAULT_TRANSCRIPTION_PRESIGN_EXPIRES_SEC,
  )
}

export function uploadPresignExpiresInSec(): number {
  return readPositiveIntEnv('MINIO_UPLOAD_PRESIGN_EXPIRES_SEC', DEFAULT_UPLOAD_PRESIGN_EXPIRES_SEC)
}

export function multipartUploadPartSizeBytes(): number {
  return Math.max(
    MIN_MULTIPART_PART_SIZE_BYTES,
    readPositiveIntEnv('MINIO_MULTIPART_PART_SIZE_MB', DEFAULT_MULTIPART_PART_SIZE_BYTES / (1024 * 1024)) *
      1024 *
      1024,
  )
}

export function multipartUploadThresholdBytes(): number {
  return Math.max(
    multipartUploadPartSizeBytes(),
    readPositiveIntEnv('MINIO_MULTIPART_THRESHOLD_MB', DEFAULT_MULTIPART_THRESHOLD_BYTES / (1024 * 1024)) *
      1024 *
      1024,
  )
}

export function shouldUseMultipartUpload(fileSize: number): boolean {
  return Number.isFinite(fileSize) && fileSize >= multipartUploadThresholdBytes()
}

/** True when the URL host is only reachable locally (AssemblyAI cannot fetch it). */
export function objectUrlUnreachableFromAssemblyAi(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.local')) return true
    if (host.endsWith('.railway.internal')) return true
    if (host.endsWith('.internal')) return true
    return false
  } catch {
    return true
  }
}

export async function presignPutObject(objectKey: string, contentType: string, expiresIn = 3600) {
  const presignClient = publicPresignClient()
  if (presignClient) {
    const bucket = process.env.MINIO_BUCKET || ''
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    })
    return getSignedUrl(presignClient, command, { expiresIn })
  }

  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
    ContentType: contentType,
  })
  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Presigned GET for a single object. Signed against the public MinIO host when set (same as presigned PUT),
 * so AssemblyAI can fetch the file without anonymous bucket policy.
 */
export async function presignGetObject(objectKey: string, expiresIn = 172800) {
  const presignClient = publicPresignClient()
  if (presignClient) {
    const bucket = process.env.MINIO_BUCKET || ''
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    })
    return getSignedUrl(presignClient, command, { expiresIn })
  }

  const client = getS3Client()
  const command = new GetObjectCommand({
    Bucket: bucketName(),
    Key: objectKey,
  })
  return getSignedUrl(client, command, { expiresIn })
}

/**
 * URL a browser can fetch for playback/download.
 * Defaults to presigned GETs so private MinIO buckets still work without anonymous read access.
 */
export async function browserObjectUrl(
  objectKey: string,
  expiresIn = browserObjectUrlExpiresInSec(),
): Promise<string> {
  if (browserObjectUrlMode() === 'public') {
    return publicObjectUrl(objectKey)
  }
  return presignGetObject(objectKey, expiresIn)
}

type MediaUrlProject = {
  fileUrl: string | null
  originalFileUrl?: string | null
  mediaMetadata?: {
    originalKey?: string
    editKey?: string
  } | null
}

type AccessibleMediaUrlMetadata = {
  playbackUrlRefreshedAt?: number | null
  playbackUrlExpiresAt?: number | null
}

export async function withAccessibleMediaUrls<T extends MediaUrlProject>(
  project: T,
): Promise<T & AccessibleMediaUrlMetadata> {
  const editKey = project.mediaMetadata?.editKey
  const originalKey = project.mediaMetadata?.originalKey
  const refreshedAt = Date.now()
  const playbackUrlExpiresAt =
    browserObjectUrlMode() === 'presigned'
      ? refreshedAt + browserObjectUrlExpiresInSec() * 1000
      : null

  const [fileUrl, originalFileUrl] = await Promise.all([
    editKey ? browserObjectUrl(editKey).catch(() => project.fileUrl) : project.fileUrl,
    originalKey
      ? browserObjectUrl(originalKey).catch(() => project.originalFileUrl ?? null)
      : (project.originalFileUrl ?? null),
  ])

  return {
    ...project,
    fileUrl,
    originalFileUrl,
    playbackUrlRefreshedAt: refreshedAt,
    playbackUrlExpiresAt,
  }
}

export async function createMultipartUpload(
  objectKey: string,
  contentType: string,
): Promise<{ uploadId: string }> {
  const client = publicPresignClient() ?? getS3Client()
  const out = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucketName(),
      Key: objectKey,
      ContentType: contentType,
    }),
  )
  if (!out.UploadId) throw new Error('Missing multipart upload ID')
  return { uploadId: out.UploadId }
}

export async function presignMultipartUploadParts(
  objectKey: string,
  uploadId: string,
  partNumbers: number[],
  expiresIn = uploadPresignExpiresInSec(),
): Promise<Array<{ partNumber: number; signedUrl: string }>> {
  const client = publicPresignClient() ?? getS3Client()
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      signedUrl: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucketName(),
          Key: objectKey,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn },
      ),
    })),
  )
}

export async function createMultipartUploadPlan(
  objectKey: string,
  contentType: string,
  fileSize: number,
): Promise<{
  uploadId: string
  partSize: number
  parts: Array<{ partNumber: number; signedUrl: string }>
}> {
  const partSize = multipartUploadPartSizeBytes()
  const totalParts = Math.max(1, Math.ceil(fileSize / partSize))
  const { uploadId } = await createMultipartUpload(objectKey, contentType)
  const partNumbers = Array.from({ length: totalParts }, (_, index) => index + 1)
  const parts = await presignMultipartUploadParts(objectKey, uploadId, partNumbers)
  return { uploadId, partSize, parts }
}

export async function completeMultipartUpload(
  objectKey: string,
  uploadId: string,
  parts: CompletedPart[],
): Promise<void> {
  const client = getS3Client()
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName(),
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    }),
  )
}

export async function abortMultipartUpload(objectKey: string, uploadId: string): Promise<void> {
  const client = getS3Client()
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucketName(),
      Key: objectKey,
      UploadId: uploadId,
    }),
  )
}

/** Download object to a file and return SHA-256 (hex) of stored bytes. */
export async function getObjectBodyStream(key: string): Promise<NodeJS.ReadableStream> {
  const client = getS3Client()
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
    }),
  )
  if (!out.Body) throw new Error('Empty object body')
  return out.Body as NodeJS.ReadableStream
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
