CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"duration" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"file_url" text,
	"transcription_progress" integer DEFAULT 0 NOT NULL,
	"case_id" text,
	"exhibit_number" text,
	"sha256_hash" text
);
--> statement-breakpoint
CREATE TABLE "text_overlays" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"text" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"font_size" integer NOT NULL,
	"font_color" text NOT NULL,
	"bg_color" text NOT NULL,
	"bg_opacity" real NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer NOT NULL,
	"font_weight" text NOT NULL,
	"width" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"transcript_id" uuid NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"text" text NOT NULL,
	"speaker" text NOT NULL,
	"confidence" real NOT NULL,
	"words" jsonb
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"language" text NOT NULL,
	"total_duration" integer NOT NULL,
	"speech_model" text
);
--> statement-breakpoint
ALTER TABLE "text_overlays" ADD CONSTRAINT "text_overlays_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;