/*
  # Cleanup old users table

  1. Changes
    - Drop the old 'users' table that was created before
    - This table is not needed as we're using Supabase Auth with user_profiles
    
  2. Important
    - The system now uses auth.users + user_profiles for authentication
    - All user data is properly stored in Supabase Auth
*/

DROP TABLE IF EXISTS users CASCADE;
