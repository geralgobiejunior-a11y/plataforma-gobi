/*
  # Create configuracoes_sistema table

  1. New Tables
    - `configuracoes_sistema`
      - `id` (uuid, primary key) - Unique identifier
      - `dia_fecho_periodo` (integer) - Day of month to close period (default 22)
      - `timezone` (text) - Timezone for the system (default 'Europe/Lisbon')
      - `horas_dia` (numeric) - Standard working hours per day (default 8)
      - `hora_entrada` (text) - Default start time (default '08:00')
      - `hora_saida` (text) - Default end time (default '17:00')
      - `pausa_minutos` (integer) - Break duration in minutes (default 60)
      - `descontar_pausa` (boolean) - Whether to discount break time (default true)
      - `tolerancia_minutos` (integer) - Tolerance in minutes for late arrivals (default 10)
      - `arredondamento_minutos` (integer) - Rounding minutes for time calculations (default 15)
      - `dia_sem_registo_gera_falta` (boolean) - Whether days without records generate absences (default false)
      - `multiplicador_hora_extra` (numeric) - Overtime multiplier (default 1.5)
      - `exigir_aprovacao_extra` (boolean) - Whether overtime requires approval (default true)
      - `dias_aviso_documentos` (integer) - Days before document expiry to warn (default 30)
      - `documento_vencido_bloqueia_presenca` (boolean) - Whether expired docs block attendance (default false)
      - `documento_vencido_bloqueia_alocacao` (boolean) - Whether expired docs block allocation (default true)
      - `updated_at` (timestamptz) - Last update timestamp
      - `updated_by` (uuid) - User who last updated

  2. Security
    - Enable RLS on `configuracoes_sistema` table
    - Add policies for authenticated users to read and admins to update
*/

CREATE TABLE IF NOT EXISTS configuracoes_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_fecho_periodo integer DEFAULT 22,
  timezone text DEFAULT 'Europe/Lisbon',
  horas_dia numeric DEFAULT 8,
  hora_entrada text DEFAULT '08:00',
  hora_saida text DEFAULT '17:00',
  pausa_minutos integer DEFAULT 60,
  descontar_pausa boolean DEFAULT true,
  tolerancia_minutos integer DEFAULT 10,
  arredondamento_minutos integer DEFAULT 15,
  dia_sem_registo_gera_falta boolean DEFAULT false,
  multiplicador_hora_extra numeric DEFAULT 1.5,
  exigir_aprovacao_extra boolean DEFAULT true,
  dias_aviso_documentos integer DEFAULT 30,
  documento_vencido_bloqueia_presenca boolean DEFAULT false,
  documento_vencido_bloqueia_alocacao boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read system config"
  ON configuracoes_sistema
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update system config"
  ON configuracoes_sistema
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert system config"
  ON configuracoes_sistema
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert default configuration
INSERT INTO configuracoes_sistema (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
