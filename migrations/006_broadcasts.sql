CREATE TABLE IF NOT EXISTS social_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message jsonb NOT NULL CHECK (jsonb_typeof(message) = 'object'),
  tag_filter text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error text
);

CREATE INDEX IF NOT EXISTS social_broadcasts_queue_idx
  ON social_broadcasts (status, scheduled_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_broadcast_deliveries (
  id bigserial PRIMARY KEY,
  broadcast_id uuid NOT NULL REFERENCES social_broadcasts(id) ON DELETE CASCADE,
  contact_id text NOT NULL REFERENCES social_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'retryable', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (broadcast_id, contact_id)
);

CREATE INDEX IF NOT EXISTS social_broadcast_deliveries_queue_idx
  ON social_broadcast_deliveries (status, created_at, id);
