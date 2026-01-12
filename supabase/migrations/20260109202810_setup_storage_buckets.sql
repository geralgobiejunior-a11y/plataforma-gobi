/*
  # Configurar Storage Buckets

  1. Buckets
    - avatars-colaboradores: Fotos de colaboradores
    - logos-obras: Logos das obras
    - documentos: Ficheiros PDF/imagens de documentos
    - comprovantes-pagamento: Comprovantes de pagamento

  2. Políticas
    - Authenticated users podem fazer upload
    - Public read para avatares e logos
    - Authenticated read para documentos e comprovantes
*/

-- Criar buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars-colaboradores', 'avatars-colaboradores', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('logos-obras', 'logos-obras', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('documentos', 'documentos', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('comprovantes-pagamento', 'comprovantes-pagamento', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Políticas para avatars-colaboradores
CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars-colaboradores');

CREATE POLICY "Authenticated users can update avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars-colaboradores')
  WITH CHECK (bucket_id = 'avatars-colaboradores');

CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars-colaboradores');

CREATE POLICY "Authenticated users can delete avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars-colaboradores');

-- Políticas para logos-obras
CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos-obras');

CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos-obras')
  WITH CHECK (bucket_id = 'logos-obras');

CREATE POLICY "Public can view logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'logos-obras');

CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos-obras');

-- Políticas para documentos
CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documentos')
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can view documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');

CREATE POLICY "Authenticated users can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documentos');

-- Políticas para comprovantes-pagamento
CREATE POLICY "Authenticated users can upload comprovantes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'comprovantes-pagamento');

CREATE POLICY "Authenticated users can update comprovantes"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'comprovantes-pagamento')
  WITH CHECK (bucket_id = 'comprovantes-pagamento');

CREATE POLICY "Authenticated users can view comprovantes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'comprovantes-pagamento');

CREATE POLICY "Authenticated users can delete comprovantes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'comprovantes-pagamento');
