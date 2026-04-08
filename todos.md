# App Productionisation To-Dos

Below is a comprehensive list of tasks required to transition this prototype from using mock data and simulated logic to a fully functioning internal application.

## 1. Data Persistence & Architecture
Currently, the application relies on an ephemeral, in-memory `useReducer` state (`lib/app-context.tsx`).

- [ ] **Database Server:** Set up a PostgreSQL database (e.g., using Prisma or Drizzle ORM).
- [ ] **Define Schema:** Create database schemas for `Projects`, `Transcripts`, `TranscriptSegments`, and `TextOverlays`.
- [ ] **Create API Endpoints / Server Actions:** 
  - Create standard CRUD routes for fetching the project library, retrieving individual transcripts, and saving editor state.
- [ ] **Refactor `app-context.tsx`:** 
  - Replace the current dispatching mechanisms to sync state with the backend database.
  - Implement optimistic UI updates or hooks like `useSWR` / `@tanstack/react-query` to handle loading states effectively.
- [ ] **Remove Hardcoded Data:** Delete `lib/mock-data.ts` and fetch the baseline library from the real database.

## 2. File Storage & Video Handling
Videos are currently loaded straight into memory via `createObjectURL` and thumbnails are pulled randomly from `picsum.photos`.

- [ ] **Cloud Storage Provider:** Integrate Cloudflare R2 for storing uploaded `.mp4`, `.mov`, etc. files using an S3-compatible SDK.
- [ ] **Thumbnail Generation:** Implement a server-side FFmpeg pipeline (or use a service like Mux/AWS MediaConvert) to extract first-frame thumbnails when videos are uploaded.
- [ ] **Refactor `app/page.tsx`:**
  - Update the dropzone to upload videos directly to the secure Cloud Storage (e.g. presigned S3 URLs).
  - Save the real media URL to the database payload instead of relying on `null` or a localhost blob reference.

## 3. Real AssemblyAI Transcription
The `lib/assemblyai-mock.ts` simulates processing through `setTimeout` and spits out a hardcoded template for every video.

- [ ] **Install AssemblyAI SDK:** Add the official `@assemblyai/api` client.
- [ ] **Transcription API Route:** 
  - Write an endpoint (`/api/transcribe`) that receives the uploaded cloud storage URL and prompts the real AssemblyAI service.
- [ ] **Webhook / Polling Mechanism:**
  - Handle long-running transcription tasks. Set up an AssemblyAI webhook to notify your backend when transcription is finished, or implement client-side polling.
- [ ] **Data Mapping:**
  - Parse the literal AssemblyAI output responses (word-level or sentence-level timestamps).
  - Map them to the internal `TranscriptSegment` type expected by the editor, including actual speaker confidence and diarization labels (e.g., Speaker A, Speaker B).
- [ ] **Remove Mock File:** Safely remove `lib/assemblyai-mock.ts`.

## 4. Real AI Assistant Integration
The chat window connects to `lib/ai-mock.ts` which just string matches keywords like "filler" to return pre-written fake interactions.

- [ ] **Install AI SDK:** Choose an LLM provider (OpenAI, Anthropic) or use AssemblyAI's LeMUR capabilities. Vercel AI SDK is highly recommended for Next.js.
- [ ] **Chat API Route:** Build `app/api/chat/route.ts` to manage streaming outputs based on user prompts.
- [ ] **System Prompts & Context Injection:** 
  - Send the full transcript securely as context to the LLM upon initialization so it knows what the users are referencing.
- [ ] **Function Calling (Tools):** 
  - Define explicit OpenAI Tool schemas for actions like `fixGrammar`, `removeFillerWords`, `addOverlay`, and `trimVideo`.
  - Let the LLM securely invoke these function calls rather than hardcoding string `if` blocks.
- [ ] **Refactor `components/ai-assistant.tsx`:**
  - Plumb it to use the new `/api/chat` route and listen to real stream chunks and parsed tool calls.
- [ ] **Remove Mock File:** Delete `lib/ai-mock.ts`.

## 5. Security & Internal Access
Since this is for internal use ONLY, you must gate it. Currently, it's public locally.

- [ ] **Authentication Layer:** Implement NextAuth (Auth.js) or Clerk.
- [ ] **Protected Routes:** Ensure `layout.tsx` or `middleware.ts` forces a login screen.
- [ ] **Whitelist / Role checks:** Optionally restrict login only to allowed internal email domains (e.g., `@yourcompany.com`).
