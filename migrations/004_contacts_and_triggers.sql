ALTER TABLE social_automations
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'comment';

ALTER TABLE social_automations
  DROP CONSTRAINT IF EXISTS social_automations_trigger_type_check;

ALTER TABLE social_automations
  ADD CONSTRAINT social_automations_trigger_type_check
  CHECK (trigger_type IN ('comment', 'message'));

ALTER TABLE social_automations
  ALTER COLUMN media_id DROP NOT NULL;

ALTER TABLE social_automations
  ADD COLUMN IF NOT EXISTS trigger_key text;

UPDATE social_automations
SET trigger_key = 'comment:' || media_id
WHERE trigger_key IS NULL;

ALTER TABLE social_automations
  ALTER COLUMN trigger_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS social_automations_trigger_key_idx
  ON social_automations (trigger_key);

ALTER TABLE social_deliveries
  ALTER COLUMN media_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS social_contacts (
  id text PRIMARY KEY,
  username text,
  display_name text,
  profile_picture_url text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'unsubscribed')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_contacts_last_seen_idx
  ON social_contacts (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS social_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_contact_tags (
  contact_id text NOT NULL REFERENCES social_contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES social_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS social_contact_tags_tag_idx
  ON social_contact_tags (tag_id, contact_id);
