import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
const minioPrivate = process.env.MINIO_PRIVATE_ENDPOINT?.replace(/\/$/, '')
const minioEndpoint = minioPrivate || minioPublic
const accessKeyId = process.env.MINIO_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || ''
const secretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || ''

function readMode(envName, fallback) {
  const raw = process.env[envName]?.trim().toLowerCase()
  if (raw === 'public' || raw === 'presigned') return raw
  return fallback
}

function expectedUnsignedStatus() {
  const browserMode = readMode('MINIO_BROWSER_URL_MODE', 'presigned')
  const transcriptionMode = readMode('MINIO_TRANSCRIPTION_URL_MODE', 'presigned')
  return browserMode === 'public' || transcriptionMode === 'public' ? 200 : 403
}

function browserPresignTtlSec() {
  const raw = Number(process.env.MINIO_BROWSER_PRESIGN_EXPIRES_SEC)
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 86400
}

function publicObjectUrl(bucket, key) {
  const explicitBase =
    process.env.MINIO_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
  if (explicitBase) {
    return `${explicitBase}/${key.split('/').map(encodeURIComponent).join('/')}`
  }
  if (!minioPublic) return ''
  return `${minioPublic}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`
}

if (minioEndpoint) {
  const bucket = process.env.MINIO_BUCKET
  if (!bucket) {
    console.error('MINIO_BUCKET is not set (.env.local or .env)')
    process.exit(1)
  }
  const client = new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1',
    endpoint: minioEndpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  })
  const presignClient =
    minioPublic
      ? new S3Client({
          region: process.env.MINIO_REGION || 'us-east-1',
          endpoint: minioPublic,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
          forcePathStyle: true,
        })
      : client
  function hostLooksPrivate(urlStr) {
    try {
      const u = new URL(urlStr)
      const h = u.hostname.toLowerCase()
      if (h === 'localhost' || h === '127.0.0.1') return true
      if (h.endsWith('.railway.internal')) return true
      if (h.endsWith('.internal')) return true
      return false
    } catch {
      return true
    }
  }

  const smokeKey = `debug/storage-smoke-${Date.now()}.txt`
  const smokeBody = `storage-smoke:${new Date().toISOString()}`

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('MinIO connection OK — bucket:', bucket)
    console.log('  server endpoint:', minioEndpoint)

    const putUrl = await getSignedUrl(
      presignClient,
      new PutObjectCommand({
        Bucket: bucket,
        Key: smokeKey,
        ContentType: 'text/plain',
      }),
      { expiresIn: Math.min(browserPresignTtlSec(), 900) },
    )
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: smokeBody,
    })
    if (!putRes.ok) {
      throw new Error(`Presigned PUT failed with HTTP ${putRes.status}`)
    }
    console.log('Presigned PUT OK')

    const getUrl = await getSignedUrl(
      presignClient,
      new GetObjectCommand({
        Bucket: bucket,
        Key: smokeKey,
      }),
      { expiresIn: Math.min(browserPresignTtlSec(), 900) },
    )
    const getRes = await fetch(getUrl)
    if (!getRes.ok) {
      throw new Error(`Presigned GET failed with HTTP ${getRes.status}`)
    }
    const getBody = await getRes.text()
    if (getBody !== smokeBody) {
      throw new Error('Presigned GET returned unexpected object contents')
    }
    console.log('Presigned GET OK')

    const publicUrl = publicObjectUrl(bucket, smokeKey)
    if (publicUrl) {
      console.log('Unsigned public URL:', publicUrl)
      const httpsCheckBase = publicUrl
      if (!publicUrl.startsWith('https://')) {
        console.warn(
          '  WARNING: Use https:// for the public object base so AssemblyAI can fetch audio_url.',
        )
      }
      if (hostLooksPrivate(httpsCheckBase)) {
        console.warn(
          '  WARNING: Public base looks local or private. Use a public host for MINIO_PUBLIC_* / MINIO_PUBLIC_BASE_URL;',
          'otherwise the app streams media through your server to AssemblyAI (slower, more egress).',
        )
      }

      const unsignedRes = await fetch(publicUrl)
      const expectedStatus = expectedUnsignedStatus()
      if (unsignedRes.status !== expectedStatus) {
        throw new Error(
          `Unsigned public URL returned HTTP ${unsignedRes.status}; expected HTTP ${expectedStatus} for current URL mode.`,
        )
      }
      console.log(`Unsigned public URL matched expected HTTP ${expectedStatus}`)
    }

    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: smokeKey }))
    console.log('Smoke object cleanup OK')
  } catch (e) {
    const meta = e.$metadata
    const hint =
      meta?.httpStatusCode === 404
        ? ' (bucket missing or wrong MINIO_BUCKET name — create it in MinIO or fix spelling)'
        : ''
    console.error(
      'MinIO smoke test failed:',
      e.name || e.message || e,
      meta?.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '',
      hint,
    )
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: smokeKey }))
    } catch {
      /* best-effort cleanup */
    }
    process.exit(1)
  }
  process.exit(0)
}

const account = process.env.R2_ACCOUNT_ID
if (account) {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) {
    console.error('R2_BUCKET_NAME is not set')
    process.exit(1)
  }
  const endpoint = `https://${account}.r2.cloudflarestorage.com`
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  })
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('R2 connection OK — bucket:', bucket)
  } catch (e) {
    const meta = e.$metadata
    console.error(
      'R2 connection failed:',
      e.name || e.message || e,
      meta?.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '',
    )
    process.exit(1)
  }
  process.exit(0)
}

console.error(
  'No object storage env: set MINIO_BUCKET + MINIO_ROOT_* and MINIO_PRIVATE_ENDPOINT or MINIO_PUBLIC_ENDPOINT (see .env.example), or R2_* for legacy R2.',
)
process.exit(1)
