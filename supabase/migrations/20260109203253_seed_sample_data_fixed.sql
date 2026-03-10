/*
  # Dados de Exemplo - Sistema Gobi & Júnior

  1. Dados inseridos
    - Empresas clientes
    - Colaboradores completos
    - Obras ativas
    - Alocações
    - Presenças com registos

  2. Objetivo
    - Demonstrar sistema funcionando com dados reais
*/

-- ==================== EMPRESAS ====================
INSERT INTO empresas (nome, nipc, email, telefone, morada) VALUES
  ('Construções Silva & Filhos', '500123456', 'geral@silvafilhos.pt', '21 123 4567', 'Rua das Flores, 123, Lisboa'),
  ('Obras Modernas Lda', '501234567', 'info@obrasmodernas.pt', '22 234 5678', 'Av. da Liberdade, 456, Porto'),
  ('TechBuild Solutions', '502345678', 'contacto@techbuild.pt', '21 345 6789', 'Alameda dos Oceanos, 789, Lisboa')
ON CONFLICT DO NOTHING;

-- ==================== ATUALIZAR COLABORADORES EXISTENTES ====================
DO $$
DECLARE
  colab RECORD;
  counter INT := 101;
BEGIN
  FOR colab IN SELECT id FROM colaboradores WHERE categoria IS NULL ORDER BY created_at
  LOOP
    UPDATE colaboradores 
    SET 
      categoria = CASE (counter % 4)
        WHEN 0 THEN 'Canalizador'
        WHEN 1 THEN 'Oficial'
        WHEN 2 THEN 'Ajudante'
        ELSE 'Encarregado'
      END,
      codigo_funcionario = 'FUNC' || LPAD(counter::text, 4, '0'),
      genero = 'M',
      data_entrada_plataforma = CURRENT_DATE - (counter * 3),
      data_nascimento = CURRENT_DATE - ((25 + (counter % 15)) * 365)
    WHERE id = colab.id;
    
    counter := counter + 1;
  END LOOP;
END $$;

-- ==================== ATUALIZAR OBRAS ====================
DO $$
DECLARE
  obra_rec RECORD;
  empresa_id_val uuid;
BEGIN
  FOR obra_rec IN SELECT id, nome FROM obras WHERE empresa_id IS NULL
  LOOP
    SELECT id INTO empresa_id_val FROM empresas ORDER BY random() LIMIT 1;
    
    UPDATE obras
    SET 
      empresa_id = empresa_id_val,
      endereco = COALESCE(localizacao, 'Sem endereço'),
      status = CASE 
        WHEN status IS NULL OR status = '' THEN 'ativa'
        ELSE status
      END
    WHERE id = obra_rec.id;
  END LOOP;
END $$;

-- ==================== ALOCAR COLABORADORES ÀS OBRAS ====================
DO $$
DECLARE
  obra_rec RECORD;
  colab_rec RECORD;
  counter INT := 0;
BEGIN
  FOR obra_rec IN SELECT id FROM obras WHERE status = 'ativa' LIMIT 3
  LOOP
    counter := 0;
    FOR colab_rec IN SELECT id FROM colaboradores WHERE status = 'ativo' ORDER BY random() LIMIT 3
    LOOP
      INSERT INTO obras_colaboradores (obra_id, colaborador_id, ativo, data_inicio)
      VALUES (obra_rec.id, colab_rec.id, true, CURRENT_DATE - 20)
      ON CONFLICT DO NOTHING;
      
      counter := counter + 1;
      EXIT WHEN counter >= 3;
    END LOOP;
  END LOOP;
END $$;

-- ==================== CRIAR PRESENÇAS DOS ÚLTIMOS 15 DIAS ====================
DO $$
DECLARE
  day_date date;
  obra_rec RECORD;
  alocacao_rec RECORD;
  colab_rec RECORD;
  presenca_id uuid;
  is_falta boolean;
  horas_val numeric;
BEGIN
  FOR day_offset IN 1..15 LOOP
    day_date := CURRENT_DATE - day_offset;
    
    IF EXTRACT(DOW FROM day_date) NOT IN (0, 6) THEN
      FOR obra_rec IN SELECT id FROM obras WHERE status = 'ativa' LIMIT 3 LOOP
        FOR alocacao_rec IN SELECT colaborador_id FROM obras_colaboradores WHERE obra_id = obra_rec.id AND ativo = true LOOP
          
          SELECT valor_hora INTO horas_val FROM colaboradores WHERE id = alocacao_rec.colaborador_id;
          is_falta := random() < 0.05;
          
          INSERT INTO presencas_dia (data, obra_id, colaborador_id, faltou, total_minutos, total_horas, custo_estimado)
          VALUES (
            day_date,
            obra_rec.id,
            alocacao_rec.colaborador_id,
            is_falta,
            CASE WHEN is_falta THEN 0 ELSE 450 END,
            CASE WHEN is_falta THEN 0 ELSE 7.5 END,
            CASE WHEN is_falta THEN 0 ELSE 7.5 * COALESCE(horas_val, 12) END
          )
          ON CONFLICT DO NOTHING
          RETURNING id INTO presenca_id;
          
          IF NOT is_falta AND presenca_id IS NOT NULL THEN
            INSERT INTO presencas_registos (presenca_dia_id, tipo, timestamp, origem) VALUES
              (presenca_id, 'entrada', (day_date + TIME '08:00:00')::timestamptz, 'manual'),
              (presenca_id, 'saida', (day_date + TIME '12:00:00')::timestamptz, 'manual'),
              (presenca_id, 'entrada', (day_date + TIME '13:00:00')::timestamptz, 'manual'),
              (presenca_id, 'saida', (day_date + TIME '17:00:00')::timestamptz, 'manual');
          END IF;
          
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ==================== CRIAR DOCUMENTOS DE EXEMPLO ====================
INSERT INTO documentos (entidade_tipo, entidade_id, tipo_documento_id, nome, data_emissao, data_validade, status_calculado)
SELECT 
  'colaborador',
  c.id,
  td.id,
  'Documento de Identificação - ' || c.nome_completo,
  CURRENT_DATE - 365,
  CURRENT_DATE + 300,
  'valido'
FROM colaboradores c
CROSS JOIN tipos_documento td
WHERE td.nome = 'Documento Identificação'
  AND c.status = 'ativo'
LIMIT 4
ON CONFLICT DO NOTHING;

INSERT INTO documentos (entidade_tipo, entidade_id, tipo_documento_id, nome, data_emissao, data_validade, status_calculado)
SELECT 
  'empresa',
  e.id,
  td.id,
  td.nome || ' - ' || e.nome,
  CURRENT_DATE - 180,
  CURRENT_DATE + (30 + (random() * 150)::int),
  'valido'
FROM empresas e
CROSS JOIN tipos_documento td
WHERE td.entidade_aplicavel = 'empresa'
  AND td.tem_validade = true
LIMIT 8
ON CONFLICT DO NOTHING;

-- Criar alguns documentos vencidos/a vencer
UPDATE documentos 
SET 
  data_validade = CURRENT_DATE - 5,
  status_calculado = 'vencido'
WHERE id IN (SELECT id FROM documentos ORDER BY random() LIMIT 2);

UPDATE documentos 
SET 
  data_validade = CURRENT_DATE + 15,
  status_calculado = 'a_vencer'
WHERE id IN (SELECT id FROM documentos WHERE status_calculado = 'valido' ORDER BY random() LIMIT 3);

-- ==================== ATUALIZAR CUSTOS DAS OBRAS ====================
UPDATE obras o
SET custo_mao_obra_acumulado = (
  SELECT COALESCE(SUM(pd.custo_estimado), 0)
  FROM presencas_dia pd
  WHERE pd.obra_id = o.id
);
