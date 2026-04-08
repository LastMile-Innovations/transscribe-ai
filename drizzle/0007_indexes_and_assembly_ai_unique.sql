CREATE INDEX "projects_workspace_project_id_idx" ON "projects" USING btree ("workspace_project_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_transcript_id_idx" ON "transcript_segments" USING btree ("transcript_id");--> statement-breakpoint
CREATE INDEX "transcripts_project_id_idx" ON "transcripts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_assembly_ai_transcript_id_uq" ON "transcripts" USING btree ("assembly_ai_transcript_id") WHERE "transcripts"."assembly_ai_transcript_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");