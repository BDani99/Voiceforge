-- Add display_name to users_profile
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS display_name TEXT;
