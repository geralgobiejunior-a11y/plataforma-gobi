/*
  # Update User Profiles Table

  1. Changes
    - Add profile fields to existing user_profiles table:
      - nome (text)
      - foto_url (text)
      - telefone (text)
      - idioma (text, default pt-PT)
      - cargo (text)
      - nivel (smallint: 1=Leitor, 2=Operador, 3=Admin)
      - created_by (uuid)
      - updated_by (uuid)
    - Keep existing fields: user_id, role, is_active, timestamps

  2. Security
    - Update RLS policies for new fields
    - Users can update their own profile (except nivel and is_active)
    - Nivel 3 users can manage all profiles

  3. Functions
    - Helper function to get user nivel
    - Helper function to check if user is admin
*/

-- Add new columns to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'nome') THEN
    ALTER TABLE user_profiles ADD COLUMN nome text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'foto_url') THEN
    ALTER TABLE user_profiles ADD COLUMN foto_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'telefone') THEN
    ALTER TABLE user_profiles ADD COLUMN telefone text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'idioma') THEN
    ALTER TABLE user_profiles ADD COLUMN idioma text DEFAULT 'pt-PT';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'cargo') THEN
    ALTER TABLE user_profiles ADD COLUMN cargo text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'nivel') THEN
    ALTER TABLE user_profiles ADD COLUMN nivel smallint DEFAULT 1 CHECK (nivel IN (1, 2, 3));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'created_by') THEN
    ALTER TABLE user_profiles ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'updated_by') THEN
    ALTER TABLE user_profiles ADD COLUMN updated_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Create helper function to get user nivel
CREATE OR REPLACE FUNCTION get_user_nivel(uid uuid)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_nivel smallint;
BEGIN
  SELECT nivel INTO user_nivel
  FROM user_profiles
  WHERE user_id = uid AND is_active = true;
  
  RETURN COALESCE(user_nivel, 1);
END;
$$;

-- Create helper function to check if user is admin (nivel 3)
CREATE OR REPLACE FUNCTION is_nivel_3(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN get_user_nivel(uid) = 3;
END;
$$;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can create profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON user_profiles;

-- RLS Policies

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Nivel 3 (admins) can read all profiles
CREATE POLICY "Nivel 3 can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_nivel_3(auth.uid()));

-- Users can update their own editable profile fields
CREATE POLICY "Users can update own profile fields"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    nivel = (SELECT nivel FROM user_profiles WHERE user_id = auth.uid()) AND
    is_active = (SELECT is_active FROM user_profiles WHERE user_id = auth.uid())
  );

-- Nivel 3 can update any profile including restricted fields
CREATE POLICY "Nivel 3 can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_nivel_3(auth.uid()))
  WITH CHECK (is_nivel_3(auth.uid()));

-- Only nivel 3 can insert new profiles
CREATE POLICY "Nivel 3 can create profiles"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_nivel_3(auth.uid()));

-- Only nivel 3 can delete profiles
CREATE POLICY "Nivel 3 can delete profiles"
  ON user_profiles
  FOR DELETE
  TO authenticated
  USING (is_nivel_3(auth.uid()));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_nivel ON user_profiles(nivel);
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_active ON user_profiles(is_active);

-- Update existing profiles to have default nivel 3 (admin) if not set
UPDATE user_profiles SET nivel = 3 WHERE nivel IS NULL;
