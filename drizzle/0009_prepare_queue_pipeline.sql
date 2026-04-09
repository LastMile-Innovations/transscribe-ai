ALTER TYPE "project_status" ADD VALUE IF NOT EXISTS 'queued_prepare';--> statement-breakpoint
ALTER TYPE "project_status" ADD VALUE IF NOT EXISTS 'preparing';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "processing_error" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "prepare_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "prepare_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "prepare_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "pending_client_capture" jsonb;--> statement-breakpoint
CREATE INDEX "projects_status_prepare_started_idx" ON "projects" USING btree ("status","prepare_started_at","uploaded_at");
