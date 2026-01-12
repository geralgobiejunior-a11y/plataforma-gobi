/*
  # Create users table

  1. New Tables
    - `users`
      - `id` (uuid, primary key) - Generated automatically
      - `auth_id` (uuid, nullable) - Link to auth.users if using Supabase Auth
      - `email` (text, unique) - User email
      - `password` (text) - Encrypted password
      - `nome` (text) - Full name
      - `tipo_acesso` (text) - Type of access: 'operacoes' or 'administracao'
      - `ativo` (boolean) - Active status
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Update timestamp

  2. Security
    - Enable RLS on `users` table
    - Add policies for authenticated users
    
  3. Initial Data
    - Create default admin user (admin@diametro.pt / Admin123!)
    - Create default operations user (operacoes@diametro.pt / Oper123!)
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  nome text NOT NULL,
  tipo_acesso text NOT NULL CHECK (tipo_acesso IN ('operacoes', 'administracao')),
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_id);

CREATE POLICY "Admin users can read all data"
  ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.auth_id = auth.uid()
      AND users.tipo_acesso = 'administracao'
    )
  );

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_id)
  WITH CHECK (auth.uid() = auth_id);

INSERT INTO users (email, password, nome, tipo_acesso, ativo) VALUES
  ('admin@diametro.pt', 'Admin123!', 'Administrador', 'administracao', true),
  ('operacoes@diametro.pt', 'Oper123!', 'Operações', 'operacoes', true)
ON CONFLICT (email) DO NOTHING;
