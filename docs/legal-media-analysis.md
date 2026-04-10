# Legal and related media analysis

This app’s primary pipeline is **speech-to-text** on the audio track (AssemblyAI). The features below extend that baseline for **litigation, compliance, and investigation** workflows.

## Ship today (in-product)

| Capability | Where | Notes |
|------------|--------|--------|
| Speaker + time provenance | Transcript editor | Segments carry start/end ms and speaker labels. |
| **Numbered transcript** (TXT) | Transcript → Export | `?format=txt` on transcript export; line numbers for reference—verify against media before filing. |
| **PDF transcript** | Transcript → Export | `?format=pdf`; same numbering, print-friendly. |
| **Clip list** (TSV) | Transcript → Export | `?format=clips`; segment index, timecodes, ms, speaker, excerpt—for spreadsheets or clip logs. |
| **JSON with word timings** | Transcript → Export | `?format=json` (default). |
| **Issue digest** | Transcript → Legal digest | LLM-structured chapters with approximate timecodes and quotes; requires `OPENAI_API_KEY`. |
| **PII redaction at transcribe** | Transcription settings | Masks common PII in the transcript returned from AssemblyAI; not a substitute for privilege review. |

## Search and review

The transcript toolbar supports **text search** over segment text and speakers, **next/previous match** navigation, and **speaker filters**.

## Video exhibit OCR (planned integration)

Screen-shared **slides, chats, or documents** visible in the recording are not read by the speech model. A typical integration path:

1. Sample frames with **FFmpeg** (e.g. 1 fps or on scene change).
2. Run **OCR** (cloud vision API or self-hosted model) per frame.
3. Store `{ timeMs, text, confidence }` rows linked to the project.
4. Expose search alongside transcript search.

Environment flag (reserved): `EXHIBIT_OCR_ENABLED=true` — until a provider is implemented, `POST /api/projects/:id/exhibit-ocr` returns **501**. See [`lib/video-exhibit-ocr.ts`](../lib/video-exhibit-ocr.ts).

## Live proceedings

Real-time streaming transcription is **not** implemented; the current path is **async pre-recorded** jobs only.

## Disclaimer

Automated digests and search aids are **assistive**; they can omit or mischaracterize content. Final judgments belong to qualified reviewers and counsel.
