CREATE TABLE IF NOT EXISTS jev_api_keys (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS jev_api_keys_ip_created_idx
  ON jev_api_keys (ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS jev_usage (
  key_hash text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  requests integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  cost_usd numeric(14, 9) NOT NULL DEFAULT 0,
  PRIMARY KEY (key_hash, day)
);
