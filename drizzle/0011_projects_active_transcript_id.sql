ALTER TABLE "projects"
ADD COLUMN "active_transcript_id" uuid;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_active_transcript_id_transcripts_id_fk"
FOREIGN KEY ("active_transcript_id") REFERENCES "public"."transcripts"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
