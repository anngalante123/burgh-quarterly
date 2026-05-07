ALTER TABLE "business_signals" ADD COLUMN "primary_category_name" text;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "images_count" integer;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "image_categories" jsonb;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "from_the_business_flags" jsonb;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "has_phone" boolean;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "has_opening_hours" boolean;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "claim_this_business" boolean;--> statement-breakpoint
ALTER TABLE "business_signals" ADD COLUMN "reviews_distribution" jsonb;