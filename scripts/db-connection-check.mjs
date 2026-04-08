import dotenv from 'dotenv'
import postgres from 'postgres'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(root, '.env.local') })
dotenv.config({ path: resolve(root, '.env') })

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set (.env.local or .env)')
  process.exit(1)
}

const sql = postgres(url, { prepare: false })
try {
  const [row] = await sql`select 1 as ok, current_database() as db`
  console.log('Connection OK — database:', row.db)
} catch (e) {
  console.error('Connection failed:', e.message || e)
  process.exit(1)
} finally {
  await sql.end({ timeout: 2 })
}
