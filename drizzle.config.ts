import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local', override: true })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
