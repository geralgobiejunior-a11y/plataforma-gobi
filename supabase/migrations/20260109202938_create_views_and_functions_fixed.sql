/*
  # Views e Funções Auxiliares - Corrigido

  1. Funções
    - calcular_status_documento: Calcula status baseado na validade
    - calcular_horas_presencas: Calcula horas de trabalho

  2. Views
    - colaboradores_resumo_v: Resumo de colaboradores com métricas
    - obras_resumo_v: Resumo de obras com métricas
    - documentos_alertas_v: Documentos que precisam atenção

  3. Triggers
    - Atualizar status de documentos automaticamente
    - Atualizar totais de presenças
    - Atualizar custos de obras
*/

-- ==================== FUNÇÃO: CALCULAR STATUS DOCUMENTO ====================
CREATE OR REPLACE FUNCTION calcular_status_documento(
  validade_doc date,
  tipo_tem_validade boolean,
  dias_alerta int
) RETURNS text AS $$
BEGIN
  IF validade_doc IS NULL THEN
    IF tipo_tem_validade THEN
      RETURN 'sem_validade';
    ELSE
      RETURN 'valido';
    END IF;
  END IF;
  
  IF validade_doc < CURRENT_DATE THEN
    RETURN 'vencido';
  END IF;
  
  IF validade_doc <= (CURRENT_DATE + dias_alerta) THEN
    RETURN 'a_vencer';
  END IF;
  
  RETURN 'valido';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ==================== FUNÇÃO: CALCULAR HORAS DE REGISTOS ====================
CREATE OR REPLACE FUNCTION calcular_horas_registos(presenca_dia_id_param uuid)
RETURNS TABLE(total_minutos int, total_horas numeric) AS $$
DECLARE
  registos record;
  ultima_entrada timestamptz := NULL;
  minutos_total int := 0;
BEGIN
  FOR registos IN 
    SELECT tipo, timestamp
    FROM presencas_registos
    WHERE presenca_dia_id = presenca_dia_id_param
    ORDER BY timestamp ASC
  LOOP
    IF registos.tipo = 'entrada' THEN
      ultima_entrada := registos.timestamp;
    ELSIF registos.tipo = 'saida' AND ultima_entrada IS NOT NULL THEN
      minutos_total := minutos_total + EXTRACT(EPOCH FROM (registos.timestamp - ultima_entrada))::int / 60;
      ultima_entrada := NULL;
    END IF;
  END LOOP;
  
  total_minutos := minutos_total;
  total_horas := ROUND((minutos_total::numeric / 60), 2);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ==================== TRIGGER: ATUALIZAR STATUS DOCUMENTO ====================
CREATE OR REPLACE FUNCTION trigger_atualizar_status_documento()
RETURNS TRIGGER AS $$
DECLARE
  tipo_doc record;
BEGIN
  SELECT tem_validade, dias_aviso INTO tipo_doc
  FROM tipos_documento
  WHERE id = NEW.tipo_documento_id;
  
  NEW.status_calculado := calcular_status_documento(
    NEW.data_validade,
    COALESCE(tipo_doc.tem_validade, false),
    COALESCE(tipo_doc.dias_aviso, 30)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documentos_status_trigger ON documentos;
CREATE TRIGGER documentos_status_trigger
  BEFORE INSERT OR UPDATE OF data_validade, tipo_documento_id
  ON documentos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_atualizar_status_documento();

-- ==================== TRIGGER: ATUALIZAR TOTAIS PRESENÇA ====================
CREATE OR REPLACE FUNCTION trigger_atualizar_totais_presenca()
RETURNS TRIGGER AS $$
DECLARE
  horas_calc record;
  valor_hora_calc numeric;
  presenca_id_val uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    presenca_id_val := OLD.presenca_dia_id;
  ELSE
    presenca_id_val := NEW.presenca_dia_id;
  END IF;
  
  SELECT * INTO horas_calc FROM calcular_horas_registos(presenca_id_val);
  
  SELECT COALESCE(oc.valor_hora_override, c.valor_hora, 0) INTO valor_hora_calc
  FROM presencas_dia pd
  LEFT JOIN obras_colaboradores oc ON oc.obra_id = pd.obra_id AND oc.colaborador_id = pd.colaborador_id AND oc.ativo = true
  LEFT JOIN colaboradores c ON c.id = pd.colaborador_id
  WHERE pd.id = presenca_id_val
  LIMIT 1;
  
  UPDATE presencas_dia
  SET 
    total_minutos = COALESCE(horas_calc.total_minutos, 0),
    total_horas = COALESCE(horas_calc.total_horas, 0),
    custo_estimado = COALESCE(horas_calc.total_horas, 0) * COALESCE(valor_hora_calc, 0),
    ultimo_registo_em = now(),
    updated_at = now()
  WHERE id = presenca_id_val;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS presencas_registos_totais_trigger ON presencas_registos;
CREATE TRIGGER presencas_registos_totais_trigger
  AFTER INSERT OR UPDATE OR DELETE
  ON presencas_registos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_atualizar_totais_presenca();

-- ==================== TRIGGER: ATUALIZAR CUSTO OBRA ====================
CREATE OR REPLACE FUNCTION trigger_atualizar_custo_obra()
RETURNS TRIGGER AS $$
DECLARE
  obra_id_val uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    obra_id_val := OLD.obra_id;
  ELSE
    obra_id_val := NEW.obra_id;
  END IF;
  
  UPDATE obras
  SET 
    custo_mao_obra_acumulado = (
      SELECT COALESCE(SUM(custo_estimado), 0)
      FROM presencas_dia
      WHERE obra_id = obra_id_val
    ),
    updated_at = now()
  WHERE id = obra_id_val;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS presencas_dia_custo_obra_trigger ON presencas_dia;
CREATE TRIGGER presencas_dia_custo_obra_trigger
  AFTER INSERT OR UPDATE OF custo_estimado OR DELETE
  ON presencas_dia
  FOR EACH ROW
  EXECUTE FUNCTION trigger_atualizar_custo_obra();

-- ==================== VIEW: RESUMO COLABORADORES ====================
CREATE OR REPLACE VIEW colaboradores_resumo_v AS
SELECT 
  c.id,
  c.nome_completo,
  c.email,
  c.telefone,
  c.foto_url,
  c.status,
  c.valor_hora,
  c.categoria,
  c.data_entrada_plataforma,
  car.nome as cargo_nome,
  
  COALESCE(SUM(CASE WHEN pd.data >= CURRENT_DATE - 7 THEN pd.total_horas ELSE 0 END), 0) as horas_7d,
  COALESCE(SUM(CASE WHEN pd.data >= CURRENT_DATE - 30 THEN pd.total_horas ELSE 0 END), 0) as horas_30d,
  MAX(pd.data) as ultima_presenca,
  
  COUNT(DISTINCT CASE WHEN doc.status_calculado = 'vencido' THEN doc.id END) as docs_vencidos,
  COUNT(DISTINCT CASE WHEN doc.status_calculado = 'a_vencer' THEN doc.id END) as docs_a_vencer,
  
  COUNT(DISTINCT oc.obra_id) FILTER (WHERE oc.ativo = true) as obras_ativas
  
FROM colaboradores c
LEFT JOIN cargos car ON car.id = c.cargo_id
LEFT JOIN presencas_dia pd ON pd.colaborador_id = c.id
LEFT JOIN documentos doc ON doc.entidade_tipo = 'colaborador' AND doc.entidade_id = c.id
LEFT JOIN obras_colaboradores oc ON oc.colaborador_id = c.id
GROUP BY c.id, car.nome;

-- ==================== VIEW: RESUMO OBRAS ====================
CREATE OR REPLACE VIEW obras_resumo_v AS
SELECT 
  o.id,
  o.nome,
  o.cliente,
  o.localizacao,
  o.endereco,
  o.status,
  o.data_inicio,
  o.data_fim_prevista,
  o.custo_mao_obra_acumulado,
  o.logo_url,
  e.nome as empresa_nome,
  
  COUNT(DISTINCT oc.colaborador_id) FILTER (WHERE oc.ativo = true) as total_colaboradores,
  
  COUNT(DISTINCT CASE WHEN doc.status_calculado = 'vencido' THEN doc.id END) as docs_vencidos,
  COUNT(DISTINCT CASE WHEN doc.status_calculado = 'a_vencer' THEN doc.id END) as docs_a_vencer,
  
  CASE 
    WHEN o.data_fim_prevista IS NULL THEN NULL
    WHEN o.data_fim_prevista < CURRENT_DATE THEN 0
    ELSE (o.data_fim_prevista - CURRENT_DATE)
  END as dias_restantes
  
FROM obras o
LEFT JOIN empresas e ON e.id = o.empresa_id
LEFT JOIN obras_colaboradores oc ON oc.obra_id = o.id
LEFT JOIN documentos doc ON doc.entidade_tipo = 'obra' AND doc.entidade_id = o.id
GROUP BY o.id, e.nome;

-- ==================== VIEW: ALERTAS DOCUMENTOS ====================
CREATE OR REPLACE VIEW documentos_alertas_v AS
SELECT 
  d.id,
  d.entidade_tipo,
  d.entidade_id,
  d.status_calculado,
  d.data_validade,
  d.nome as documento_nome,
  td.nome as tipo_nome,
  td.dias_aviso,
  
  CASE d.entidade_tipo
    WHEN 'colaborador' THEN c.nome_completo
    WHEN 'obra' THEN o.nome
    WHEN 'empresa' THEN e.nome
    ELSE 'Gobi & Júnior'
  END as entidade_nome,
  
  CASE 
    WHEN d.status_calculado = 'vencido' THEN 1
    WHEN d.status_calculado = 'a_vencer' THEN 2
    ELSE 3
  END as prioridade
  
FROM documentos d
LEFT JOIN tipos_documento td ON td.id = d.tipo_documento_id
LEFT JOIN colaboradores c ON d.entidade_tipo = 'colaborador' AND d.entidade_id = c.id
LEFT JOIN obras o ON d.entidade_tipo = 'obra' AND d.entidade_id = o.id
LEFT JOIN empresas e ON d.entidade_tipo = 'empresa' AND d.entidade_id = e.id
WHERE d.status_calculado IN ('vencido', 'a_vencer')
ORDER BY prioridade, d.data_validade;
