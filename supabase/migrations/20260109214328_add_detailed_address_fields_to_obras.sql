/*
  # Adicionar Campos Detalhados de Endereço à Tabela Obras

  1. Campos Adicionados
    - `rua` (text) - Nome da rua/avenida
    - `numero_porta` (text) - Número da porta/prédio
    - `codigo_postal` (text) - Código postal (formato: 0000-000)
    - `freguesia` (text) - Freguesia
    - `concelho` (text) - Concelho/Município
    - `distrito` (text) - Distrito/Região
    - `latitude` (numeric) - Coordenada latitude para mapa
    - `longitude` (numeric) - Coordenada longitude para mapa

  2. Notas
    - Campos para suportar autocomplete de endereços portugueses
    - Coordenadas GPS para integração com mapas
    - Mantém compatibilidade com campos existentes (endereco, localizacao)
*/

-- Adicionar novos campos de endereço detalhado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'rua'
  ) THEN
    ALTER TABLE obras ADD COLUMN rua text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'numero_porta'
  ) THEN
    ALTER TABLE obras ADD COLUMN numero_porta text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'codigo_postal'
  ) THEN
    ALTER TABLE obras ADD COLUMN codigo_postal text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'freguesia'
  ) THEN
    ALTER TABLE obras ADD COLUMN freguesia text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'concelho'
  ) THEN
    ALTER TABLE obras ADD COLUMN concelho text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'distrito'
  ) THEN
    ALTER TABLE obras ADD COLUMN distrito text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE obras ADD COLUMN latitude numeric(10, 7);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'obras' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE obras ADD COLUMN longitude numeric(10, 7);
  END IF;
END $$;

-- Criar índices para pesquisa eficiente
CREATE INDEX IF NOT EXISTS idx_obras_codigo_postal ON obras(codigo_postal);
CREATE INDEX IF NOT EXISTS idx_obras_concelho ON obras(concelho);
CREATE INDEX IF NOT EXISTS idx_obras_latitude_longitude ON obras(latitude, longitude);
