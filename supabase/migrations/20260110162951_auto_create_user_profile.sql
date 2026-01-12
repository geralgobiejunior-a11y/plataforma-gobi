/*
  # Auto-create User Profile on Signup

  1. New Functions
    - Function to auto-create user profile when new user signs up
    - Trigger to call function on auth.users insert

  2. Changes
    - Every new user automatically gets a profile created
    - Default nivel is 1 (Leitor) for new users
    - Default idioma is pt-PT
    - Profile is active by default

  3. Security
    - Function runs with security definer
    - Only creates profile if it doesn't exist
*/

-- Function to create user profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    user_id,
    nome,
    nivel,
    idioma,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'Utilizador'),
    1, -- Default to Leitor for new users
    'pt-PT',
    true,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
