/*
  # Adicionar campo descricao à tabela obras

  1. Alterações
    - Adiciona coluna `descricao` do tipo text à tabela `obras`
    - Campo opcional para descrição detalhada da obra
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'obras' AND column_name = 'descricao'
  ) THEN
    ALTER TABLE obras ADD COLUMN descricao text;
  END IF;
END $$;
