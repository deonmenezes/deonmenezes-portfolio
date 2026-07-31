CREATE TABLE IF NOT EXISTS newsletter_signup_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_signup_attempts_key_created_idx
  ON newsletter_signup_attempts (key_hash, created_at DESC);
