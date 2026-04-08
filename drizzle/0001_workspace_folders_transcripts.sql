CREATE TABLE "workspace_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_project_id" text NOT NULL,
	"parent_folder_id" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_project_id_workspace_projects_id_fk" FOREIGN KEY ("workspace_project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_project_id" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "folder_id" text;
--> statement-breakpoint
INSERT INTO "workspace_projects" ("id", "name", "created_at")
SELECT 'wp-' || "id", COALESCE(NULLIF(TRIM("title"), ''), 'Untitled'), "uploaded_at" FROM "projects";
--> statement-breakpoint
UPDATE "projects" SET "workspace_project_id" = 'wp-' || "id" WHERE "workspace_project_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "workspace_project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_project_id_workspace_projects_id_fk" FOREIGN KEY ("workspace_project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "label" text;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD COLUMN "assembly_ai_transcript_id" text;
