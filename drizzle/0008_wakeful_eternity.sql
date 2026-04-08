DROP INDEX "projects_workspace_project_id_idx";--> statement-breakpoint
DROP INDEX "transcript_segments_transcript_id_idx";--> statement-breakpoint
DROP INDEX "transcripts_project_id_idx";--> statement-breakpoint
CREATE INDEX "folders_workspace_project_sort_idx" ON "folders" USING btree ("workspace_project_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "folders_workspace_parent_sort_idx" ON "folders" USING btree ("workspace_project_id","parent_folder_id","sort_order","name");--> statement-breakpoint
CREATE INDEX "projects_workspace_project_uploaded_at_idx" ON "projects" USING btree ("workspace_project_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "text_overlays_project_id_idx" ON "text_overlays" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "transcript_segments_transcript_start_idx" ON "transcript_segments" USING btree ("transcript_id","start");--> statement-breakpoint
CREATE INDEX "transcripts_project_created_at_idx" ON "transcripts" USING btree ("project_id","created_at");