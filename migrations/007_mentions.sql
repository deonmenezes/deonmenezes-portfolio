ALTER TABLE social_automations
  DROP CONSTRAINT IF EXISTS social_automations_trigger_type_check;

ALTER TABLE social_automations
  ADD CONSTRAINT social_automations_trigger_type_check
  CHECK (trigger_type IN ('comment', 'message', 'mention'));

ALTER TABLE social_webhook_events
  DROP CONSTRAINT IF EXISTS social_webhook_events_event_type_check;

ALTER TABLE social_webhook_events
  ADD CONSTRAINT social_webhook_events_event_type_check
  CHECK (event_type IN ('comment', 'postback', 'message', 'mention'));
