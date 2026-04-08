CREATE TYPE "public"."overlay_font_weight" AS ENUM('normal', 'bold');
--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('uploading', 'transcribing', 'ready', 'error');
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE "public"."project_status" USING "status"::"public"."project_status";
--> statement-breakpoint
ALTER TABLE "text_overlays" ALTER COLUMN "font_weight" SET DATA TYPE "public"."overlay_font_weight" USING "font_weight"::"public"."overlay_font_weight";
