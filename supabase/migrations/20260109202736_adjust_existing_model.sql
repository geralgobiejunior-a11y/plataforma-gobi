/*
  # Ajustar Modelo Existente - Sistema Diâmetro

  1. Novas Tabelas
    - empresas: Clientes/empresas
    - obras_colaboradores: Alocação
    - presencas_dia e presencas_registos: Novo sistema de presenças
    - documentos_requisitos: Requisitos obrigatórios
    - pagamentos_periodos e pagamentos_linhas: Sistema financeiro
    - notificacoes: Sistema de alertas

  2. Ajustes em Tabelas Existentes
    - colaboradores: novos campos
    - obras: novos campos
    - tipos_documento: ajustes
    - documentos: campo status_calculado

  3. Segurança
    - RLS em todas as tabelas
*/

-- ==================== EMPRESAS ====================
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nipc text,
  email text,
  telefone text,
  morada text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read empresas for authenticated"
  ON empresas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all empresas for authenticated"
  ON empresas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ==================== ATUALIZAR COLABORADORES ====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'foto_url') THEN
    ALTER TABLE colaboradores ADD COLUMN foto_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'apelido') THEN
    ALTER TABLE colaboradores ADD COLUMN apelido text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'codigo_funcionario') THEN
    ALTER TABLE colaboradores ADD COLUMN codigo_funcionario text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'genero') THEN
    ALTER TABLE colaboradores ADD COLUMN genero text;
    ALTER TABLE colaboradores ADD CONSTRAINT genero_check CHECK (genero IN ('M', 'F', 'Outro', 'Prefiro não dizer'));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'data_nascimento') THEN
    ALTER TABLE colaboradores ADD COLUMN data_nascimento date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'categoria') THEN
    ALTER TABLE colaboradores ADD COLUMN categoria text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'data_entrada_plataforma') THEN
    ALTER TABLE colaboradores ADD COLUMN data_entrada_plataforma date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- ==================== ATUALIZAR OBRAS ====================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'obras' AND column_name = 'logo_url') THEN
    ALTER TABLE obras ADD COLUMN logo_url text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'obras' AND column_name = 'empresa_id') THEN
    ALTER TABLE obras ADD COLUMN empresa_id uuid REFERENCES empresas(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'obras' AND column_name = 'endereco') THEN
    ALTER TABLE obras ADD COLUMN endereco text;
  END IF;
END $$;

-- ==================== OBRAS_COLABORADORES ====================
CREATE TABLE IF NOT EXISTS obras_colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  ativo boolean DEFAULT true,
  data_inicio date DEFAULT CURRENT_DATE,
  data_fim date,
  valor_hora_override numeric(10,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(obra_id, colaborador_id, data_inicio)
);

ALTER TABLE obras_colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all obras_colaboradores for authenticated"
  ON obras_colaboradores FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_obras_colaboradores_obra ON obras_colaboradores(obra_id);
CREATE INDEX IF NOT EXISTS idx_obras_colaboradores_colaborador ON obras_colaboradores(colaborador_id);

-- ==================== PRESENÇAS SISTEMA NOVO ====================
CREATE TABLE IF NOT EXISTS presencas_dia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  faltou boolean DEFAULT false,
  justificacao_falta text,
  total_minutos int DEFAULT 0,
  total_horas numeric(10,2) DEFAULT 0,
  custo_estimado numeric(10,2) DEFAULT 0,
  ultimo_registo_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(data, obra_id, colaborador_id)
);

CREATE TABLE IF NOT EXISTS presencas_registos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presenca_dia_id uuid NOT NULL REFERENCES presencas_dia(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  timestamp timestamptz NOT NULL,
  origem text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE presencas_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE presencas_registos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all presencas_dia for authenticated"
  ON presencas_dia FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all presencas_registos for authenticated"
  ON presencas_registos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_presencas_dia_data ON presencas_dia(data);
CREATE INDEX IF NOT EXISTS idx_presencas_dia_colaborador ON presencas_dia(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_presencas_dia_obra ON presencas_dia(obra_id);
CREATE INDEX IF NOT EXISTS idx_presencas_registos_presenca ON presencas_registos(presenca_dia_id);

-- ==================== DOCUMENTOS REQUISITOS ====================
CREATE TABLE IF NOT EXISTS documentos_requisitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL CHECK (entidade_tipo IN ('empresa', 'colaborador', 'obra', 'diametro')),
  tipo_documento_id uuid NOT NULL REFERENCES tipos_documento(id) ON DELETE CASCADE,
  obrigatorio boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(entidade_tipo, tipo_documento_id)
);

ALTER TABLE documentos_requisitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all documentos_requisitos for authenticated"
  ON documentos_requisitos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Adicionar status_calculado aos documentos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos' AND column_name = 'status_calculado') THEN
    ALTER TABLE documentos ADD COLUMN status_calculado text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documentos' AND column_name = 'emissor') THEN
    ALTER TABLE documentos ADD COLUMN emissor text;
  END IF;
END $$;

-- Ajustar tipos_documento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tipos_documento' AND column_name = 'entidade_aplicavel') THEN
    ALTER TABLE tipos_documento ADD COLUMN entidade_aplicavel text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tipos_documento' AND column_name = 'tem_validade') THEN
    ALTER TABLE tipos_documento ADD COLUMN tem_validade boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tipos_documento' AND column_name = 'obrigatorio') THEN
    ALTER TABLE tipos_documento ADD COLUMN obrigatorio boolean DEFAULT false;
  END IF;
END $$;

-- ==================== PAGAMENTOS ====================
CREATE TABLE IF NOT EXISTS pagamentos_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes >= 1 AND mes <= 12),
  status text DEFAULT 'aberto' CHECK (status IN ('aberto', 'processando', 'fechado', 'pago')),
  criado_por uuid REFERENCES user_profiles(user_id),
  processado_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ano, mes)
);

CREATE TABLE IF NOT EXISTS pagamentos_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES pagamentos_periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id),
  total_horas numeric(10,2) DEFAULT 0,
  valor_hora_medio numeric(10,2) DEFAULT 0,
  total_bruto numeric(10,2) DEFAULT 0,
  iban text,
  status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_pagamento', 'pago')),
  comprovante_url text,
  pago_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(periodo_id, colaborador_id)
);

ALTER TABLE pagamentos_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_linhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all pagamentos_periodos for authenticated"
  ON pagamentos_periodos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all pagamentos_linhas for authenticated"
  ON pagamentos_linhas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pagamentos_linhas_periodo ON pagamentos_linhas(periodo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_linhas_colaborador ON pagamentos_linhas(colaborador_id);

-- ==================== NOTIFICAÇÕES ====================
CREATE TABLE IF NOT EXISTS notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  link text,
  lida boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notificacoes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notificacoes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON notificacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);

-- ==================== INSERIR TIPOS DE DOCUMENTOS OBRIGATÓRIOS ====================
INSERT INTO tipos_documento (nome, descricao, entidade_aplicavel, tem_validade, dias_aviso, obrigatorio) VALUES
  ('NIPC/NIF', 'Número de Identificação Fiscal da Empresa', 'empresa', false, 0, true),
  ('Alvará IMPIC', 'Alvará ou Certificado do IMPIC com listagem atualizada', 'empresa', true, 30, true),
  ('Recibo Segurança Social', 'Comprovativo de Pagamento à Segurança Social', 'empresa', true, 30, true),
  ('Apólice Seguro AT', 'Apólice do Seguro de Acidentes de Trabalho', 'empresa', true, 30, true),
  ('Recibo Seguro AT', 'Recibo de Pagamento do Seguro AT', 'empresa', true, 30, true),
  ('Apólice Seguro RC', 'Apólice do Seguro de Responsabilidade Civil', 'empresa', true, 30, true),
  ('Recibo Seguro RC', 'Recibo de Pagamento do Seguro RC', 'empresa', true, 30, true),
  ('Declaração SS', 'Declaração da Segurança Social (Situação Regularizada)', 'empresa', true, 30, true),
  ('Declaração Finanças', 'Declaração das Finanças (Ausência de Dívidas)', 'empresa', true, 30, true),
  ('Documento Identificação', 'Cartão de Cidadão ou Documento de Identificação', 'colaborador', true, 60, true),
  ('Contrato Trabalho', 'Contrato de Trabalho assinado', 'colaborador', false, 0, true),
  ('Certificados', 'Certificados Profissionais', 'colaborador', true, 60, false)
ON CONFLICT (nome) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  entidade_aplicavel = EXCLUDED.entidade_aplicavel,
  tem_validade = EXCLUDED.tem_validade;

-- Criar requisitos
INSERT INTO documentos_requisitos (entidade_tipo, tipo_documento_id, obrigatorio)
SELECT 'empresa', id, obrigatorio
FROM tipos_documento
WHERE entidade_aplicavel IN ('empresa', 'todos') AND entidade_aplicavel IS NOT NULL
ON CONFLICT (entidade_tipo, tipo_documento_id) DO NOTHING;

INSERT INTO documentos_requisitos (entidade_tipo, tipo_documento_id, obrigatorio)
SELECT 'colaborador', id, obrigatorio
FROM tipos_documento
WHERE entidade_aplicavel IN ('colaborador', 'todos') AND entidade_aplicavel IS NOT NULL
ON CONFLICT (entidade_tipo, tipo_documento_id) DO NOTHING;
