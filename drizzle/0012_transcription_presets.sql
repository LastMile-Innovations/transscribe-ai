CREATE TYPE "public"."transcription_preset_scope" AS ENUM('personal', 'workspace');--> statement-breakpoint
CREATE TABLE "transcription_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_project_id" text NOT NULL,
	"scope" "transcription_preset_scope" NOT NULL,
	"name" text NOT NULL,
	"options" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "transcription_presets" ADD CONSTRAINT "transcription_presets_workspace_project_id_workspace_projects_id_fk" FOREIGN KEY ("workspace_project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcription_presets_workspace_user_idx" ON "transcription_presets" USING btree ("workspace_project_id","created_by_user_id");--> statement-breakpoint
CREATE INDEX "transcription_presets_workspace_scope_idx" ON "transcription_presets" USING btree ("workspace_project_id","scope");
