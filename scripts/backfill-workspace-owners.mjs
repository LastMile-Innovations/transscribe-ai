/**
 * One-time: grant owner membership on every workspace to BOOTSTRAP_CLERK_USER_ID.
 * Use after enabling workspace_members for databases that already have workspace_projects rows.
 *
 * Usage:
 *   BOOTSTRAP_CLERK_USER_ID=user_xxx pnpm exec node scripts/backfill-workspace-owners.mjs
 *
 * Requires DATABASE_URL (e.g. from .env.local). Skips workspaces that already have any members.
 */
import postgres from 'postgres'
import { config } from 'dotenv'

config({ path: '.env' })
config({ path: '.env.local', override: true })

const userId = process.env.BOOTSTRAP_CLERK_USER_ID?.trim()
const databaseUrl = process.env.DATABASE_URL

if (!userId) {
  console.error('Set BOOTSTRAP_CLERK_USER_ID to your Clerk user id (Dashboard → Users).')
  process.exit(1)
}
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const sql = postgres(databaseUrl, { max: 1 })

try {
  const workspaces = await sql`select id from workspace_projects`
  let added = 0
  let skipped = 0
  for (const row of workspaces) {
    const [{ count: memberCount }] = await sql`
      select count(*)::int as count from workspace_members where workspace_project_id = ${row.id}
    `
    if (memberCount > 0) {
      skipped++
      continue
    }
    await sql`
      insert into workspace_members (workspace_project_id, user_id, role)
      values (${row.id}, ${userId}, 'owner')
    `
    added++
  }
  console.log(`Done. Added owner on ${added} workspace(s); skipped ${skipped} that already had members.`)
} finally {
  await sql.end({ timeout: 5 })
}
