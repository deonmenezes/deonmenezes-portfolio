CREATE TABLE IF NOT EXISTS social_flow_queue (
  id bigserial PRIMARY KEY,
  delivery_id bigint NOT NULL REFERENCES social_deliveries(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES social_automations(id) ON DELETE CASCADE,
  recipient_id text NOT NULL,
  step_index integer NOT NULL CHECK (step_index >= 0),
  message jsonb NOT NULL CHECK (jsonb_typeof(message) = 'object'),
  available_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'retryable', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (delivery_id, step_index)
);

CREATE INDEX IF NOT EXISTS social_flow_queue_ready_idx
  ON social_flow_queue (status, available_at, id);
