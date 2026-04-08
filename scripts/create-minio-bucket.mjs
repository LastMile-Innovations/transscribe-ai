import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const minioPublic = process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '')
const minioPrivate = process.env.MINIO_PRIVATE_ENDPOINT?.replace(/\/$/, '')
const endpoint = minioPrivate || minioPublic
const bucket = process.env.MINIO_BUCKET
const accessKeyId = process.env.MINIO_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || ''
const secretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || ''

if (!endpoint || !bucket) {
  console.error(
    'Set MINIO_BUCKET and MINIO_PRIVATE_ENDPOINT or MINIO_PUBLIC_ENDPOINT (.env.local or .env)',
  )
  process.exit(1)
}

const client = new S3Client({
  region: process.env.MINIO_REGION || 'us-east-1',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
})

try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }))
  console.log('Created bucket:', bucket)
} catch (e) {
  const code = e.name
  const status = e.$metadata?.httpStatusCode
  if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists' || status === 409) {
    console.log('Bucket already exists:', bucket)
    process.exit(0)
  }
  console.error('CreateBucket failed:', code, status != null ? `HTTP ${status}` : '', e.message || e)
  process.exit(1)
}
