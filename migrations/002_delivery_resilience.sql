ALTER TABLE social_deliveries
  ADD COLUMN IF NOT EXISTS retry_action text NOT NULL DEFAULT 'initial';

ALTER TABLE social_deliveries
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS social_deliveries_retry_idx
  ON social_deliveries (status, next_attempt_at, id);
