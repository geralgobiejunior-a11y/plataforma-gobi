/*
  # Create default authentication users

  1. Users Created
    - Admin user (admin@diametro.pt) with role 'admin'
    - Operations user (operacoes@diametro.pt) with role 'operacoes'

  2. Security
    - Both users are set to active
    - Passwords are securely hashed using bcrypt
    
  3. Credentials
    - Admin: admin@diametro.pt / Admin123!
    - Operations: operacoes@diametro.pt / Oper123!
*/

DO $$
DECLARE
  admin_user_id uuid;
  oper_user_id uuid;
BEGIN
  -- Check if admin user exists
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@diametro.pt';
  
  IF admin_user_id IS NULL THEN
    -- Create admin user
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'admin@diametro.pt',
      crypt('Admin123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nome":"Administrador"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO admin_user_id;
  END IF;

  -- Check if operations user exists
  SELECT id INTO oper_user_id FROM auth.users WHERE email = 'operacoes@diametro.pt';
  
  IF oper_user_id IS NULL THEN
    -- Create operations user
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'operacoes@diametro.pt',
      crypt('Oper123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"nome":"Operações"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    RETURNING id INTO oper_user_id;
  END IF;

  -- Create or update user profiles
  INSERT INTO user_profiles (user_id, role, is_active)
  VALUES (admin_user_id, 'admin', true)
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'admin',
    is_active = true,
    updated_at = now();

  INSERT INTO user_profiles (user_id, role, is_active)
  VALUES (oper_user_id, 'operacoes', true)
  ON CONFLICT (user_id) DO UPDATE SET
    role = 'operacoes',
    is_active = true,
    updated_at = now();

END $$;
