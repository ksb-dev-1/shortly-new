-- One Stripe customer per user, created the first time they start a Checkout
-- session. Nullable: most users never touch billing, and existing accounts
-- are grandfathered rather than backfilled with one.
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT UNIQUE;
