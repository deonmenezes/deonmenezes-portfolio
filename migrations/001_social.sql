CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS social_account_snapshots (
  id bigserial PRIMARY KEY,
  username text NOT NULL,
  name text,
  profile_picture_url text,
  followers_count integer NOT NULL DEFAULT 0,
  follows_count integer NOT NULL DEFAULT 0,
  media_count integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_account_snapshots_captured_idx
  ON social_account_snapshots (captured_at DESC);

CREATE TABLE IF NOT EXISTS social_media (
  id text PRIMARY KEY,
  shortcode text UNIQUE NOT NULL,
  media_type text NOT NULL,
  caption text NOT NULL DEFAULT '',
  permalink text NOT NULL,
  thumbnail_url text,
  published_at timestamptz NOT NULL,
  comments_count integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_media_published_idx ON social_media (published_at DESC);

CREATE TABLE IF NOT EXISTS social_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id text UNIQUE NOT NULL REFERENCES social_media(id) ON DELETE CASCADE,
  title text NOT NULL,
  keyword text NOT NULL,
  match_mode text NOT NULL DEFAULT 'exact' CHECK (match_mode IN ('exact', 'contains')),
  response_text text NOT NULL DEFAULT '',
  public_reply_text text NOT NULL DEFAULT 'Sent you a DM — check your requests ✉️',
  resource_links jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(resource_links) = 'array'),
  follow_gate_mode text NOT NULL DEFAULT 'strict' CHECK (follow_gate_mode IN ('strict', 'immediate')),
  enabled boolean NOT NULL DEFAULT false,
  needs_setup boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_automations_enabled_idx ON social_automations (enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_webhook_events (
  id bigserial PRIMARY KEY,
  provider_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('comment', 'postback', 'message')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'ignored', 'retryable', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS social_webhook_events_queue_idx
  ON social_webhook_events (status, next_attempt_at, id);

CREATE TABLE IF NOT EXISTS social_deliveries (
  id bigserial PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES social_automations(id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES social_media(id) ON DELETE CASCADE,
  comment_id text UNIQUE NOT NULL,
  commenter_id text NOT NULL,
  commenter_username text,
  comment_text text,
  recipient_id text,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'awaiting_follow', 'sent', 'retryable', 'unknown', 'failed')),
  follows_account boolean,
  private_reply_message_id text,
  public_reply_message_id text,
  attempts integer NOT NULL DEFAULT 0,
  retry_action text NOT NULL DEFAULT 'initial' CHECK (retry_action IN ('initial', 'resource', 'none')),
  claimed_at timestamptz,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS social_deliveries_recipient_idx ON social_deliveries (recipient_id, status);
CREATE INDEX IF NOT EXISTS social_deliveries_created_idx ON social_deliveries (created_at DESC);

CREATE TABLE IF NOT EXISTS social_messages (
  id text PRIMARY KEY,
  conversation_id text,
  participant_id text,
  participant_username text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_messages_created_idx ON social_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS social_messages_participant_idx ON social_messages (participant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_link_clicks (
  id bigserial PRIMARY KEY,
  automation_id uuid NOT NULL REFERENCES social_automations(id) ON DELETE CASCADE,
  delivery_id bigint REFERENCES social_deliveries(id) ON DELETE SET NULL,
  link_index integer NOT NULL,
  visitor_hash text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_link_clicks_created_idx ON social_link_clicks (clicked_at DESC);

CREATE TABLE IF NOT EXISTS social_login_attempts (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL,
  succeeded boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_login_attempts_lookup_idx
  ON social_login_attempts (fingerprint, created_at DESC);

CREATE TABLE IF NOT EXISTS social_sync_runs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
