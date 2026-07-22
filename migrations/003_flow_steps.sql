ALTER TABLE social_automations
  ADD COLUMN IF NOT EXISTS flow_steps jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE social_automations
  DROP CONSTRAINT IF EXISTS social_automations_flow_steps_array;

ALTER TABLE social_automations
  ADD CONSTRAINT social_automations_flow_steps_array
  CHECK (jsonb_typeof(flow_steps) = 'array');

CREATE INDEX IF NOT EXISTS social_automations_flow_steps_idx
  ON social_automations USING gin (flow_steps);
