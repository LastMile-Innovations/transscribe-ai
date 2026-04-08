import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const bucket = process.env.MINIO_BUCKET
const endpoint =
  process.env.MINIO_PUBLIC_ENDPOINT?.replace(/\/$/, '') ||
  process.env.MINIO_PRIVATE_ENDPOINT?.replace(/\/$/, '')
const accessKeyId = process.env.MINIO_ACCESS_KEY_ID || process.env.MINIO_ROOT_USER || ''
const secretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY || process.env.MINIO_ROOT_PASSWORD || ''
const expireDays = (() => {
  const raw = Number(process.env.MINIO_LIFECYCLE_EXPIRE_DAYS)
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 30
})()
const prefixes = (process.env.MINIO_LIFECYCLE_PREFIXES || 'debug/,temp/')
  .split(',')
  .map((prefix) => prefix.trim())
  .filter(Boolean)

if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  console.error(
    'Set MINIO_BUCKET, MINIO_PUBLIC_ENDPOINT (or MINIO_PRIVATE_ENDPOINT), and MinIO credentials before configuring lifecycle rules.',
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

function ruleIdForPrefix(prefix) {
  const slug = prefix.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'root'
  return `cursor-expire-${slug}-${expireDays}d`
}

let existingRules = []
try {
  const out = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))
  existingRules = out.Rules ?? []
} catch (error) {
  if (error.name !== 'NoSuchLifecycleConfiguration') {
    console.error('Failed to read existing lifecycle rules:', error.name || error.message || error)
    process.exit(1)
  }
}

const managedRuleIds = new Set(prefixes.map(ruleIdForPrefix))
const unmanagedRules = existingRules.filter((rule) => !managedRuleIds.has(rule.ID || ''))
const managedRules = prefixes.map((prefix) => ({
  ID: ruleIdForPrefix(prefix),
  Status: 'Enabled',
  Filter: { Prefix: prefix },
  Expiration: { Days: expireDays },
}))

await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: bucket,
    LifecycleConfiguration: {
      Rules: [...unmanagedRules, ...managedRules],
    },
  }),
)

console.log(`Lifecycle rules applied to bucket "${bucket}" via ${endpoint}`)
for (const prefix of prefixes) {
  console.log(`  - Expire objects under "${prefix}" after ${expireDays} days`)
}
