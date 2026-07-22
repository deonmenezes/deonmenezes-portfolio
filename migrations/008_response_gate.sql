ALTER TABLE social_flow_queue
  ADD COLUMN IF NOT EXISTS requires_response boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS social_flow_queue_response_gate_idx
  ON social_flow_queue (recipient_id, requires_response, status, available_at);
