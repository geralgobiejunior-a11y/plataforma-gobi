/*
  # Ensure User Profiles Exist

  1. Changes
    - Create profiles for any users that don't have one yet
    - Set default values for new profiles
    - All existing users get nivel 3 (admin) by default

  2. Security
    - Maintains existing RLS policies
*/

-- Insert profiles for users that don't have one yet
INSERT INTO user_profiles (user_id, nome, nivel, idioma, is_active, created_at, updated_at)
SELECT 
  au.id,
  COALESCE(au.email, 'Utilizador'),
  3, -- Default to admin for existing users
  'pt-PT',
  true,
  now(),
  now()
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.user_id = au.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Update any profiles that have NULL nivel to default 3
UPDATE user_profiles 
SET nivel = 3 
WHERE nivel IS NULL;
