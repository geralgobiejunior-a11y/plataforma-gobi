/*
  # Allow Users to Create Their Own Profile

  1. Changes
    - Add policy to allow users to create their own profile
    - Only allows creating profile for their own user_id
    - Default nivel is set to 1 (cannot be changed by user)

  2. Security
    - User can only create profile for themselves
    - Cannot set nivel higher than 1
    - Cannot set is_active to false
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Nivel 3 can create profiles" ON user_profiles;

-- Allow nivel 3 to create any profile
CREATE POLICY "Nivel 3 can create profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_nivel_3(auth.uid()));

-- Allow users to create their own profile if it doesn't exist
CREATE POLICY "Users can create own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    (nivel IS NULL OR nivel = 1) AND
    (is_active IS NULL OR is_active = true)
  );
