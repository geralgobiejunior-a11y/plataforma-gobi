/*
  # Fix Notificacoes RLS Policies

  1. Changes
    - Allow system to insert notifications for any user
    - Users can read their own notifications
    - Users can update their own notifications (mark as read)

  2. Security
    - Users can only read/update their own notifications
    - System can create notifications for any user
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read own notifications" ON notificacoes;
DROP POLICY IF EXISTS "Users can update own notifications" ON notificacoes;
DROP POLICY IF EXISTS "Users can insert notifications" ON notificacoes;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON notificacoes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON notificacoes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to insert notifications
CREATE POLICY "Authenticated users can create notifications"
  ON notificacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON notificacoes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
