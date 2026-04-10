import { z } from 'zod'

/** Structured digest for litigation / compliance review; times are approximate. */
export const legalDigestSchema = z.object({
  overview: z
    .string()
    .describe('Neutral 2–5 sentence overview of what the recording covers. No legal conclusions.'),
  chapters: z
    .array(
      z.object({
        title: z.string().describe('Short issue- or topic-style heading'),
        summary: z.string().describe('Bullet-style or short paragraph; cite themes, not opinions'),
        approximateStartTimecode: z
          .string()
          .describe('Start time as HH:MM:SS.mmm matching the transcript timecodes'),
        approximateEndTimecode: z.string().describe('End time as HH:MM:SS.mmm'),
        keyQuote: z
          .string()
          .describe('Short verbatim excerpt from the transcript (one sentence or less)'),
      }),
    )
    .min(1)
    .max(24)
    .describe('Major topics in chronological order'),
})

export type LegalDigest = z.infer<typeof legalDigestSchema>
