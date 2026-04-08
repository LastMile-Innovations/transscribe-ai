import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
const minioPrivate = process.env.MINIO_PRIVATE_ENDPOINT?.replace(/\/$/, '')
const minioEndpoint = minioPrivate || minioPublic
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
      accessKeyId: process.env.MINIO_ROOT_USER || '',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD || '',
    },
    forcePathStyle: true,
  })
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

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('MinIO connection OK — bucket:', bucket)
    console.log('  endpoint:', minioEndpoint)
    const pub = minioPublic || ''
    const explicitBase =
      process.env.MINIO_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
      process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '')
    const sampleKey = 'workspace/example-project/original/example.mp4'
    let samplePublic
    if (explicitBase) {
      samplePublic = `${explicitBase}/${sampleKey.split('/').map(encodeURIComponent).join('/')}`
    } else if (pub && bucket) {
      samplePublic = `${pub}/${bucket}/${sampleKey.split('/').map(encodeURIComponent).join('/')}`
    }
    if (samplePublic) {
      console.log('')
      console.log('AssemblyAI / browser playback: objects must be reachable at a public HTTPS URL, e.g.')
      console.log(' ', samplePublic)
      const httpsCheckBase = explicitBase || pub
      if (httpsCheckBase && !httpsCheckBase.startsWith('https://')) {
        console.warn(
          '  WARNING: Use https:// for the public object base so AssemblyAI can fetch audio_url.',
        )
      }
      if (hostLooksPrivate(httpsCheckBase || '')) {
        console.warn(
          '  WARNING: Public base looks local or private. Use a public host for MINIO_PUBLIC_* / MINIO_PUBLIC_BASE_URL;',
          'otherwise the app streams media through your server to AssemblyAI (slower, more egress).',
        )
      }
    }
  } catch (e) {
    const meta = e.$metadata
    const hint =
      meta?.httpStatusCode === 404
        ? ' (bucket missing or wrong MINIO_BUCKET name — create it in MinIO or fix spelling)'
        : ''
    console.error(
      'MinIO connection failed:',
      e.name || e.message || e,
      meta?.httpStatusCode != null ? `HTTP ${meta.httpStatusCode}` : '',
      hint,
    )
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
