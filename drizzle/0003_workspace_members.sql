CREATE TYPE "public"."workspace_member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_member_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_project_id_user_id_pk" PRIMARY KEY("workspace_project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_project_id_workspace_projects_id_fk" FOREIGN KEY ("workspace_project_id") REFERENCES "public"."workspace_projects"("id") ON DELETE cascade ON UPDATE no action;