-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qwxngmkwwbymnxetyrue/sql/new

-- Add display_name to users_profile
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS display_name TEXT;
