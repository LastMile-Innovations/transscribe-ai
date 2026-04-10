ALTER TABLE "projects"
ADD COLUMN "preferred_transcript_id" uuid;

ALTER TABLE "projects"
ADD CONSTRAINT "projects_preferred_transcript_id_transcripts_id_fk"
FOREIGN KEY ("preferred_transcript_id") REFERENCES "public"."transcripts"("id")
ON DELETE SET NULL ON UPDATE NO ACTION;
