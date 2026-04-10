# AssemblyAI pre-recorded transcription (this app)

This describes how the implementation maps to AssemblyAI’s pre-recorded audio guide ([transcribe a pre-recorded audio file](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio), [webhooks](https://www.assemblyai.com/docs/speech-to-text/pre-recorded-audio/webhooks)).

## Credentials and region

- **Env:** `ASSEMBLYAI_API_KEY`; optional `ASSEMBLYAI_BASE_URL` (e.g. `https://api.eu.assemblyai.com` for EU residency). See [`.env.example`](../.env.example).
- **Code:** [`lib/transcription-submit.ts`](../lib/transcription-submit.ts), [`lib/assemblyai-transcript-sync.ts`](../lib/assemblyai-transcript-sync.ts).

## Audio source

The guide shows a public `audio_url` or uploading bytes to AssemblyAI. Here, the editor-ready file lives in object storage: we use a presigned or public HTTPS URL when AssemblyAI can reach it, otherwise we stream the object to the SDK as `audio` (same outcome as upload).

## Submit request

- **Route:** `POST /api/transcribe` → [`submitProjectTranscription`](../lib/transcription-submit.ts).
- **SDK:** `client.transcripts.submit` (async submit; not blocking `transcribe()`, so the API route returns quickly).
- **`speech_models`:** Always set — `universal-3-pro` + `universal-2` for “best”, or `universal-2` only for “fast”.
- **Common flags:** `language_detection`, `speaker_labels` (from transcription options).
- **Extras:** prompt / keyterms, speaker hints, known speakers (`speech_understanding`), optional PII redaction, optional webhook registration.

## Completion: polling and webhooks

- **Polling:** The browser calls `POST /api/transcribe/:assemblyAiId`, which runs [`syncTranscriptFromAssemblyAi`](../lib/assemblyai-transcript-sync.ts) (`client.transcripts.get`). Client-side delays use exponential backoff ([`lib/transcription-poll-client.ts`](../lib/transcription-poll-client.ts)), not a fixed 3s loop like the samples.
- **Webhooks (optional):** [`app/api/webhooks/assemblyai/route.ts`](../app/api/webhooks/assemblyai/route.ts) triggers the same sync path; polling can still run in parallel.

## Segments and diarization

[`insertSegmentsFromTranscriptResult`](../lib/assemblyai-transcript-sync.ts) prefers AssemblyAI `utterances` when speaker labels are enabled, then falls back to words or plain text.

## Universal-3 Pro (async)

Official overview: [Universal-3 Pro](https://www.assemblyai.com/docs/pre-recorded-audio/universal-3-pro).

- **“Best” (`speechModel: 'best'`)** sends `speech_models: ["universal-3-pro", "universal-2"]`. AssemblyAI routes to Universal-3 Pro for supported languages (English, Spanish, Portuguese, French, German, Italian) and falls back to Universal-2 for broader coverage — same idea as their quickstart samples.
- **“Fast” (`speechModel: 'fast'`)** sends only `universal-2`. **`temperature` is not sent** in that path (Universal-3 Pro-only knob); see [`lib/transcription-submit.ts`](../lib/transcription-submit.ts).

## Prompting and keyterms

Guide: [Prompting (async)](https://www.assemblyai.com/docs/pre-recorded-audio/prompting), [prompt engineering](https://www.assemblyai.com/docs/pre-recorded-audio/prompt-engineering).

- **API rule:** `prompt` and `keyterms_prompt` must not both appear on the same request.
- **This app:** If the user enters a non-empty prompt and keyterms, we send **only** `prompt`, appending `\n\nContext: term1, term2, …` — the pattern AssemblyAI documents for combining guidance with boosted terms. If the prompt is empty but keyterms are set, we send **`keyterms_prompt`** only (keyterms are merged into Universal-3’s default prompt on their side).
- **Default copy:** [`DEFAULT_TRANSCRIPTION_PROMPT`](../lib/transcription-options.ts) is empty so the API omits `prompt` and Universal-3 Pro uses AssemblyAI’s built-in default. Use built-in templates (e.g. Legal / courtroom) or saved presets for custom instructions.

## Temperature

Universal-3 Pro accepts `temperature` from 0.0–1.0 (docs default 0.0). Our default transcription preset uses **0.1** for a small amount of decoding exploration ([`DEFAULT_TRANSCRIPTION_OPTIONS`](../lib/transcription-options.ts)). It is applied only when **not** in “fast” (Universal-2-only) mode.

## Speakers: API features vs prompt wording

With **speaker diarization** (`speaker_labels`) and optional **speaker identification** (`knownSpeakers` → `speech_understanding`), prefer stable diarization/identification for production labels. AssemblyAI notes that **prompt-based “speaker attribution”** (experimental) can interact oddly with the word “speaker” in the prompt; our default prompt mentions speakers and roles intentionally for legal-style output — if you see odd label behavior, test a shorter prompt or rely more on diarization-only settings.
