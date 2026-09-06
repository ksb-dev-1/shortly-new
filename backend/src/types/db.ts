/** A user row as it is safe to send to the client. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  is_verified: boolean;
  avatar_url: string | null;
  plan: "free" | "pro";
  created_at: Date;
}

/** Only used internally, during login. */
export interface UserWithPassword {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  is_verified: boolean;
  avatar_url: string | null;
  plan: "free" | "pro";
}

/** A links row as it is safe to send to the client. */
export interface PublicLink {
  id: string;
  code: string;
  original_url: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

/** Both email_verification_tokens and password_reset_tokens have this shape. */
export interface TokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
}
