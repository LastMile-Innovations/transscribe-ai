# MinIO On Railway

## Verified service pattern

- The Next.js service should keep both `MINIO_PRIVATE_ENDPOINT` and `MINIO_PUBLIC_ENDPOINT`.
- Server-side SDK traffic uses `MINIO_PRIVATE_ENDPOINT` when available so reads, writes, and transcodes stay on Railway's private network.
- Browser presigned uploads, browser playback URLs, and AssemblyAI fetches must use `MINIO_PUBLIC_ENDPOINT`.

## App checks

- Run `pnpm storage:test` to verify the app's real MinIO behavior.
- The smoke test now checks:
  - bucket access on the server endpoint
  - presigned `PUT`
  - presigned `GET`
  - multipart part upload `ETag` responses
  - bucket CORS `ExposeHeaders` coverage for `ETag`
  - unsigned public URL behavior (`200` in public mode, `403` in presigned/private mode)
  - smoke object cleanup
- If Railway variables and the smoke test disagree about the bucket name, reconcile the dashboard values before relying on future automation.

## Upload tuning

- Single-request uploads remain the default for smaller files.
- Large files switch to multipart presigned uploads.
- The browser now uploads multipart parts in a bounded parallel pool instead of one-at-a-time.
- Tuning knobs:
  - `MINIO_MULTIPART_THRESHOLD_MB` default `64`
  - `MINIO_MULTIPART_PART_SIZE_MB` default `16`
  - `MINIO_MULTIPART_MAX_PARALLEL_UPLOADS` default `4`
  - `MINIO_UPLOAD_PRESIGN_EXPIRES_SEC` default `3600`
- Recommended Railway + MinIO starting point:
  - keep the threshold low enough that medium-large phone/laptop uploads use multipart
  - start with `16 MB` parts and `4` parallel uploads
  - increase part size first if MinIO shows too many concurrent requests; increase parallelism only after verifying the client still has unused upstream bandwidth
- Required bucket CORS for browser multipart uploads:
  - allow your app origin for `PUT`, `GET`, `HEAD`, and `POST`
  - expose the `ETag` response header
  - without `ETag` in `ExposeHeaders`, multipart uploads can upload bytes successfully but still fail to finalize in the browser

## Playback URL refresh

- Browser playback defaults to presigned `GET` URLs.
- The editor refreshes playback URLs on load, before play when the URL is near expiry, and retries once on media error.

## Lifecycle policy

- Apply the managed lifecycle rule with:

```bash
pnpm storage:set-lifecycle
```

- Default managed policy:
  - expire `debug/` objects after `30` days
  - expire `temp/` objects after `30` days
- Optional overrides:

```bash
MINIO_LIFECYCLE_PREFIXES="debug/,temp/" MINIO_LIFECYCLE_EXPIRE_DAYS=30 pnpm storage:set-lifecycle
```

- The lifecycle script preserves existing unmanaged rules and only replaces the managed `cursor-expire-*` rules for the configured prefixes.
