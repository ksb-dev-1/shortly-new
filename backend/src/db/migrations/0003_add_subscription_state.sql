-- What the link-creation cap and any Pro-only feature check against locally,
-- rather than calling Stripe on every request. The webhook handler is the
-- only writer of these three columns.
--
-- plan is ours: exactly two values, derived from subscription_status by the
-- webhook handler. subscription_status is Stripe's own status string
-- (active, past_due, canceled, ...), kept verbatim for support/debugging
-- rather than gating anything itself.
ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro'));
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN subscription_status TEXT;
