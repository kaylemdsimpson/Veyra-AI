ALTER TABLE "stores" ADD COLUMN "detected_tools" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "stores" ADD COLUMN "third_party_detected_at" timestamp with time zone;
