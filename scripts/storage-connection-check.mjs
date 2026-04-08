import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const minioEndpoint = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
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
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log('MinIO connection OK — bucket:', bucket)
    console.log('  endpoint:', minioEndpoint)
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
  'No object storage env: set MINIO_PUBLIC_ENDPOINT + MINIO_BUCKET + MINIO_ROOT_* (see .env.example), or R2_* for legacy R2.',
)
process.exit(1)
