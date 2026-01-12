/*
  # Sistema de Folha de Pagamento

  1. Novas Tabelas
    - `pagamentos_periodos`
      - Períodos de pagamento mensais (01-22 do mês)
      - Status: aberto, em_validacao, processando, fechado, pago
      - Datas de criação e fechamento
      - Notas para auditoria
    
    - `pagamentos_itens`
      - Itens de pagamento por colaborador em cada período
      - Horas totais, valor/hora, cálculos
      - Total bruto, ajustes, total final
      - Status e pendências
    
    - `pagamentos_ajustes`
      - Ajustes individuais (bónus, desconto, adiantamento)
      - Motivo obrigatório
      - Rastreabilidade completa

  2. Segurança
    - RLS habilitado em todas as tabelas
    - Políticas para usuários autenticados
    - Auditoria de alterações

  3. Índices
    - Otimização para consultas por período
    - Busca eficiente por colaborador
*/

-- Criar tabela de períodos de pagamento
CREATE TABLE IF NOT EXISTS pagamentos_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes >= 1 AND mes <= 12),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_validacao', 'processando', 'fechado', 'pago')),
  total_horas numeric(10, 2) DEFAULT 0,
  total_bruto numeric(12, 2) DEFAULT 0,
  num_colaboradores integer DEFAULT 0,
  num_pendencias integer DEFAULT 0,
  criado_em timestamptz DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id),
  fechado_em timestamptz,
  fechado_por uuid REFERENCES auth.users(id),
  notas text,
  UNIQUE(ano, mes)
);

-- Criar tabela de itens de pagamento (por colaborador)
CREATE TABLE IF NOT EXISTS pagamentos_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES pagamentos_periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  horas_total numeric(10, 2) DEFAULT 0,
  num_faltas integer DEFAULT 0,
  valor_hora numeric(10, 2),
  total_bruto numeric(12, 2) DEFAULT 0,
  ajustes_total numeric(12, 2) DEFAULT 0,
  total_final numeric(12, 2) DEFAULT 0,
  status text DEFAULT 'pendente' CHECK (status IN ('ok', 'pendente', 'validado')),
  pendencias_json jsonb DEFAULT '[]'::jsonb,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(periodo_id, colaborador_id)
);

-- Criar tabela de ajustes
CREATE TABLE IF NOT EXISTS pagamentos_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES pagamentos_periodos(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES pagamentos_itens(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('bonus', 'desconto', 'adiantamento', 'outro')),
  valor numeric(12, 2) NOT NULL,
  motivo text NOT NULL,
  criado_em timestamptz DEFAULT now(),
  criado_por uuid REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE pagamentos_periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_ajustes ENABLE ROW LEVEL SECURITY;

-- Políticas para pagamentos_periodos
CREATE POLICY "Users can view payment periods"
  ON pagamentos_periodos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create payment periods"
  ON pagamentos_periodos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update payment periods"
  ON pagamentos_periodos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para pagamentos_itens
CREATE POLICY "Users can view payment items"
  ON pagamentos_itens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create payment items"
  ON pagamentos_itens FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update payment items"
  ON pagamentos_itens FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para pagamentos_ajustes
CREATE POLICY "Users can view adjustments"
  ON pagamentos_ajustes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create adjustments"
  ON pagamentos_ajustes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update adjustments"
  ON pagamentos_ajustes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Índices para otimização
CREATE INDEX IF NOT EXISTS idx_pagamentos_periodos_ano_mes ON pagamentos_periodos(ano, mes);
CREATE INDEX IF NOT EXISTS idx_pagamentos_periodos_status ON pagamentos_periodos(status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_itens_periodo ON pagamentos_itens(periodo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_itens_colaborador ON pagamentos_itens(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_ajustes_periodo ON pagamentos_ajustes(periodo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_ajustes_item ON pagamentos_ajustes(item_id);

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_pagamentos_itens_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar timestamp automaticamente
DROP TRIGGER IF EXISTS update_pagamentos_itens_timestamp ON pagamentos_itens;
CREATE TRIGGER update_pagamentos_itens_timestamp
  BEFORE UPDATE ON pagamentos_itens
  FOR EACH ROW
  EXECUTE FUNCTION update_pagamentos_itens_timestamp();
