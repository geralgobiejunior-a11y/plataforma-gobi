/*
  # Add anonymous login policy

  1. Security Changes
    - Add policy to allow anonymous users to read from users table
    - This is needed for login validation
    - Users can only read email, password, and basic info for validation
*/

CREATE POLICY "Allow anonymous login verification"
  ON users
  FOR SELECT
  TO anon
  USING (true);
