CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A shortened link. Only signed-in users create these, so user_id is NOT NULL;
-- deleting the account takes the links with it.
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The part after the slash: shortly.sh/<code>. Either generated or supplied
  -- by the user as a custom alias, which is why there is one column and not
  -- two -- both kinds have to be unique against each other.
  -- UNIQUE also builds the index the redirect looks the code up by.
  -- Comparison is case-sensitive, so /Sale and /sale are different links; the
  -- generated codes are base62 and need the upper and lower halves to differ.
  code TEXT NOT NULL UNIQUE,

  -- "Original" is what the UI calls this, so the column matches.
  original_url TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Listing one user's links is the dashboard's main query.
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links (user_id);

-- One row per redirect served, rather than a counter column on links.
-- A counter answers "how many" and nothing else; the questions actually worth
-- asking -- when, from where, on what -- need the individual events, and a
-- total can always be derived back out of them.
--
-- Deleting a link takes its clicks with it, same as deleting a user takes
-- their links.
CREATE TABLE IF NOT EXISTS link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES links(id) ON DELETE CASCADE,

  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Both come straight off the request headers, so they cost nothing extra to
  -- collect. Nullable because a client is free to send neither, and plenty
  -- don't: direct visits have no referrer.
  --
  -- user_agent is stored raw and unparsed on purpose. Browser and device are
  -- derived from it, and keeping the original is the only thing that makes
  -- those columns backfillable for clicks already recorded.
  referrer TEXT,
  user_agent TEXT
);

-- Every analytics query starts "for this link", then narrows or orders by
-- time, so one composite index serves both the total and the over-time series.
-- DESC matches the "most recent first" direction they will be read in.
CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id_clicked_at
  ON link_clicks (link_id, clicked_at DESC);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);
