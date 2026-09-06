import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { env } from "../config/env.js";
import { pool } from "../db/index.js";
import { sendPasswordResetEmail } from "../emails/send-password-reset-email.js";
import { sendVerificationEmail } from "../emails/send-verification-email.js";
import { ApiError } from "../middlewares/errorHandler.middleware.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResendVerificationInput,
  ResetPasswordInput,
  SignupInput,
  VerifyEmailInput,
} from "../schemas/auth.schema.js";
import type {
  PublicUser,
  RefreshTokenRow,
  TokenRow,
  UserWithPassword,
} from "../types/db.js";

const ACCESS_TOKEN_EXPIRES_IN = 15 * 60; // seconds
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60;
const EMAIL_VERIFICATION_TOKEN_EXPIRES_IN = 24 * 60 * 60;
const PASSWORD_RESET_TOKEN_EXPIRES_IN = 60 * 60;

// Caps how much mail one address can receive, however many IPs ask for it.
// The per-IP limiter cannot do this: it counts senders, not recipients.
const EMAIL_SEND_WINDOW = 60 * 60; // seconds
const MAX_EMAILS_PER_WINDOW = 3;

/*
 * Exported because deleting an account has to clear these too, and that lives
 * in profile.controller.ts — where Cloudinary is configured, and where the
 * avatar has to be destroyed alongside the row. Sending two constants across
 * beats configuring Cloudinary in a second place.
 */
export const accessCookieOptions = {
  httpOnly: true,
  secure: env.IS_PRODUCTION,
  sameSite: "lax",
  path: "/",
} as const;

export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.IS_PRODUCTION,
  sameSite: "lax",
  path: "/api/v1/auth/refresh",
} as const;

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 12);

export function generateAndHashToken(size: number = 32) {
  const token = crypto.randomBytes(size).toString("hex");
  const tokenHash = hashToken(token);

  return { token, tokenHash };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/*
 * 12 rounds is the cost that matters — it is what makes a stolen hash
 * expensive to attack, and it is what production uses.
 *
 * Under test the cost is dropped to the bcrypt minimum. Almost every test
 * begins by signing someone up, and at 12 rounds each of those spends roughly
 * 600ms hashing, which is most of the suite's runtime. Nothing under test
 * depends on the cost: the assertions are about the hash's shape and about it
 * differing from the plain password, both of which hold at any round count.
 */
const SALT_ROUNDS = env.IS_TEST ? 4 : 12;

export async function hashPassword(
  password: string,
  saltRounds: number = SALT_ROUNDS,
) {
  return bcrypt.hash(password, saltRounds);
}

// ─────────────────────────────────────────────
// 1. Signup Controller
// ─────────────────────────────────────────────

export async function signupController(req: Request, res: Response) {
  // 1. Validated by validate(signupSchema) on the route
  const { name, email, password } = req.body as SignupInput;

  // 2. Hash password
  const passwordHash = await hashPassword(password);

  // 3. Generate verification token
  const { token: verificationToken, tokenHash: verificationTokenHash } =
    generateAndHashToken();

  // 4. Get a dedicated connection for the transaction
  const client = await pool.connect();

  // Tracks whether a transaction is currently open.
  let inTransaction = false;

  try {
    // 5. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 6. Create user
    const newUser = await client.query<Omit<PublicUser, "avatar_url">>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, is_verified, created_at`,
      [name, email, passwordHash],
    );

    const user = newUser.rows[0];

    if (!user) {
      throw new Error("Failed to create user");
    }

    // 7. Store verification token hash
    await client.query(
      `INSERT INTO email_verification_tokens
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [user.id, verificationTokenHash, EMAIL_VERIFICATION_TOKEN_EXPIRES_IN],
    );

    // 8. Commit transaction
    await client.query("COMMIT");
    inTransaction = false;

    // 9. Send email AFTER successful transaction
    try {
      await sendVerificationEmail(name, email, verificationToken);
    } catch (error) {
      req.log.error(error, "Failed to send verification email");
    }

    // 10. Return success
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Signup successful, check your email to verify your account",
      user,
    });
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    // 11. Duplicate email
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new ApiError(StatusCodes.CONFLICT, "Email already exists");
    }

    throw error;
  } finally {
    // Always release the client
    client.release();
  }
}

// ─────────────────────────────────────────────
// 2. Verify Email Controller
// ─────────────────────────────────────────────

export async function verifyEmailController(req: Request, res: Response) {
  // 1. Validated by validate(verifyEmailSchema) on the route
  const { token } = req.body as VerifyEmailInput;

  // Hash the token before looking it up
  const tokenHash = hashToken(token);

  // Get a dedicated database connection for the transaction
  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 2. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 3. Find and lock the token row
    const result = await client.query<TokenRow>(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );

    const storedToken = result.rows[0];

    // Token doesn't exist
    if (!storedToken) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid verification link");
    }

    // 4. Prevent a verification token from being reused
    if (storedToken.used_at !== null) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This verification link has already been used",
      );
    }

    // 5. Prevent expired tokens from being used
    if (new Date(storedToken.expires_at) < new Date()) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This verification link has expired",
      );
    }

    // 6. Mark the user's email as verified
    await client.query(
      `UPDATE users
       SET is_verified = TRUE,
           updated_at = now()
       WHERE id = $1`,
      [storedToken.user_id],
    );

    // 7. Invalidate all unused verification tokens
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [storedToken.user_id],
    );

    // 8. Commit all changes together
    await client.query("COMMIT");
    inTransaction = false;

    // 9. Return successful verification response
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    // Let the global error middleware handle the error
    throw error;
  } finally {
    // Always return the connection to the pool
    client.release();
  }
}

// ─────────────────────────────────────────────
// 3. Login Controller
// ─────────────────────────────────────────────

export async function loginController(req: Request, res: Response) {
  // 1. Validated by validate(loginSchema) on the route
  const { email, password } = req.body as LoginInput;

  // 2. Find the user by email
  const result = await pool.query<UserWithPassword>(
    `SELECT id, name, email, password_hash, is_verified, avatar_url, plan
     FROM users
     WHERE email = $1`,
    [email],
  );

  const user = result.rows[0];

  // 3. User doesn't exist
  // Still perform bcrypt work to reduce timing differences.
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);

    throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid email or password");
  }

  // 4. Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Invalid email or password");
  }

  // 5. Only verified accounts may log in
  if (!user.is_verified) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Please verify your email before logging in",
    );
  }

  // 6. Create short-lived access token
  const accessToken = jwt.sign({ sub: user.id }, env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

  // 7. Generate long-lived refresh token
  const { token: refreshToken, tokenHash: refreshTokenHash } =
    generateAndHashToken();

  // 8. Store refresh token hash
  await pool.query(
    `INSERT INTO refresh_tokens
     (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [user.id, refreshTokenHash, REFRESH_TOKEN_EXPIRES_IN],
  );

  // 9. Store access token in secure HTTP-only cookie
  res.cookie("access_token", accessToken, {
    ...accessCookieOptions,
    maxAge: ACCESS_TOKEN_EXPIRES_IN * 1000,
  });

  // 10. Store refresh token in secure HTTP-only cookie
  res.cookie("refresh_token", refreshToken, {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
  });

  // 11. Remove password hash before sending user data
  const { password_hash: _passwordHash, ...safeUser } = user;

  // 12. Return successful login response
  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Login successful",
    user: safeUser,
  });
}

// ─────────────────────────────────────────────
// 4. Refresh Controller
// ─────────────────────────────────────────────

export async function refreshController(req: Request, res: Response) {
  // 1. Get refresh token from cookie
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // 2. Hash the token
  const refreshTokenHash = hashToken(refreshToken);

  // 3. Get a dedicated connection for the transaction
  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 4. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 5. Find and lock the refresh token
    const result = await client.query<RefreshTokenRow>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [refreshTokenHash],
    );

    const storedToken = result.rows[0];

    // Token doesn't exist
    if (!storedToken) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
    }

    // 6. Detect reuse of an already-revoked refresh token
    if (storedToken.revoked_at !== null) {
      // Revoke all active sessions
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = now()
         WHERE user_id = $1
           AND revoked_at IS NULL`,
        [storedToken.user_id],
      );

      // Keep the session revocations
      await client.query("COMMIT");
      inTransaction = false;

      throw new ApiError(
        StatusCodes.UNAUTHORIZED,
        "Refresh token reuse detected",
      );
    }

    // 7. Reject expired refresh tokens
    if (new Date(storedToken.expires_at) < new Date()) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, "Refresh token expired");
    }

    // 8. Generate new access token
    const newAccessToken = jwt.sign(
      { sub: storedToken.user_id },
      env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    );

    // 9. Generate new refresh token
    const { token: newRefreshToken, tokenHash: newRefreshTokenHash } =
      generateAndHashToken();

    // 10. Revoke old refresh token
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE id = $1`,
      [storedToken.id],
    );

    // 11. Store new refresh token hash
    await client.query(
      `INSERT INTO refresh_tokens
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [storedToken.user_id, newRefreshTokenHash, REFRESH_TOKEN_EXPIRES_IN],
    );

    // 12. Commit rotation
    await client.query("COMMIT");
    inTransaction = false;

    // 13. Send new access token
    res.cookie("access_token", newAccessToken, {
      ...accessCookieOptions,
      maxAge: ACCESS_TOKEN_EXPIRES_IN * 1000,
    });

    // 14. Send new refresh token
    res.cookie("refresh_token", newRefreshToken, {
      ...refreshCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
    });

    // 15. Return success
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Token refreshed successfully",
    });
  } catch (error) {
    // Only rollback when a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    throw error;
  } finally {
    // Always release the connection
    client.release();
  }
}

// ─────────────────────────────────────────────
// 5. Logout Controller
// ─────────────────────────────────────────────

export async function logoutController(req: Request, res: Response) {
  // 1. Get the current refresh token from the cookie
  const refreshToken = req.cookies.refresh_token;

  // 2. Revoke the current refresh-token session
  if (refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);

    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [refreshTokenHash],
    );
  }

  // 3. Remove authentication cookies
  res.clearCookie("access_token", accessCookieOptions);
  res.clearCookie("refresh_token", refreshCookieOptions);

  // 4. Logout succeeds even if no refresh token was present
  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Logged out",
  });
}

// ─────────────────────────────────────────────
// 6. Resend Verification Email Controller
// ─────────────────────────────────────────────

export async function resendVerificationController(
  req: Request,
  res: Response,
) {
  // 1. Validated by validate(resendVerificationSchema) on the route
  const { email } = req.body as ResendVerificationInput;

  // Same response whether account exists, is verified,
  // or the rate limit has been reached.
  const genericResponse = {
    success: true,
    message: "If an account needs verification, a new link has been sent",
  };

  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 2. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 3. Find and LOCK the unverified user
    const userResult = await client.query<
      Pick<PublicUser, "id" | "name" | "email">
    >(
      `SELECT id, name, email
       FROM users
       WHERE email = $1
         AND is_verified = FALSE
       FOR UPDATE`,
      [email],
    );

    const user = userResult.rows[0];

    // 4. No unverified account
    if (!user) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return res.status(StatusCodes.OK).json(genericResponse);
    }

    // 5. Count recent verification emails
    const countResult = await client.query<{
      recent_sends: number;
    }>(
      `SELECT COUNT(*)::int AS recent_sends
       FROM email_verification_tokens
       WHERE user_id = $1
         AND created_at > now() - ($2 || ' seconds')::interval`,
      [user.id, EMAIL_SEND_WINDOW],
    );

    const recentSends = countResult.rows[0]?.recent_sends ?? 0;

    // 6. Apply rate limit
    if (recentSends >= MAX_EMAILS_PER_WINDOW) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return res.status(StatusCodes.OK).json(genericResponse);
    }

    // 7. Generate new verification token
    const { token: verificationToken, tokenHash: verificationTokenHash } =
      generateAndHashToken();

    // 8. Invalidate previous unused tokens
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id],
    );

    // 9. Store new verification token hash
    await client.query(
      `INSERT INTO email_verification_tokens
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [user.id, verificationTokenHash, EMAIL_VERIFICATION_TOKEN_EXPIRES_IN],
    );

    // 10. Commit database changes
    await client.query("COMMIT");
    inTransaction = false;

    // 11. Send email AFTER transaction commits
    try {
      await sendVerificationEmail(user.name, user.email, verificationToken);
    } catch (error) {
      req.log.error(error, "Failed to send verification email");
    }

    // 12. Return generic response
    return res.status(StatusCodes.OK).json(genericResponse);
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    throw error;
  } finally {
    // 13. Always release database connection
    client.release();
  }
}

// ─────────────────────────────────────────────
// 7. Forgot Password Controller
// ─────────────────────────────────────────────

export async function forgotPasswordController(req: Request, res: Response) {
  // 1. Validated by validate(forgotPasswordSchema) on the route
  const { email } = req.body as ForgotPasswordInput;

  // Same response whether or not the account exists
  const genericResponse = {
    success: true,
    message: "If an account exists for that email, a reset link has been sent",
  };

  // 2. Get a dedicated connection for the transaction
  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 3. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 4. Find and lock the user row
    // This prevents two simultaneous password-reset requests
    // for the same user from passing the rate limit together.
    const userResult = await client.query<
      Pick<PublicUser, "id" | "name" | "email">
    >(
      `SELECT id, name, email
       FROM users
       WHERE email = $1
       FOR UPDATE`,
      [email],
    );

    const user = userResult.rows[0];

    // 5. Stop here if no account uses this email
    if (!user) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return res.status(StatusCodes.OK).json(genericResponse);
    }

    // 6. Count recent password-reset emails
    const countResult = await client.query<{
      recent_sends: number;
    }>(
      `SELECT COUNT(*)::int AS recent_sends
       FROM password_reset_tokens
       WHERE user_id = $1
         AND created_at > now() - ($2 || ' seconds')::interval`,
      [user.id, EMAIL_SEND_WINDOW],
    );

    const recentSends = countResult.rows[0]?.recent_sends ?? 0;

    // 7. Apply rate limit
    if (recentSends >= MAX_EMAILS_PER_WINDOW) {
      await client.query("ROLLBACK");
      inTransaction = false;

      return res.status(StatusCodes.OK).json(genericResponse);
    }

    // 8. Generate and hash secure reset token
    const { token: resetToken, tokenHash: resetTokenHash } =
      generateAndHashToken();

    // 9. Invalidate previous unused reset tokens
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [user.id],
    );

    // 10. Store the new reset token hash
    await client.query(
      `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [user.id, resetTokenHash, PASSWORD_RESET_TOKEN_EXPIRES_IN],
    );

    // 11. Commit database changes
    await client.query("COMMIT");
    inTransaction = false;

    // 12. Send email AFTER transaction commits
    try {
      await sendPasswordResetEmail(user.name, user.email, resetToken);
    } catch (error) {
      req.log.error(error, "Failed to send password reset email");
    }

    // 13. Return generic response
    return res.status(StatusCodes.OK).json(genericResponse);
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    throw error;
  } finally {
    // 14. Always release connection
    client.release();
  }
}

// ─────────────────────────────────────────────
// 8. Reset Password Controller
// ─────────────────────────────────────────────

export async function resetPasswordController(req: Request, res: Response) {
  // 1. Validated by validate(resetPasswordSchema) on the route
  const { token, password } = req.body as ResetPasswordInput;

  // 2. Hash the reset token
  const tokenHash = hashToken(token);

  // 3. Hash the new password
  // Do this before opening the database transaction because
  // bcrypt can take some time.
  const passwordHash = await hashPassword(password);

  // 4. Get a dedicated database connection
  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 5. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 6. Find and LOCK the reset token
    const result = await client.query<TokenRow>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );

    const storedToken = result.rows[0];

    // Token doesn't exist
    if (!storedToken) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Invalid reset link");
    }

    // 7. Prevent reset token reuse
    if (storedToken.used_at !== null) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This reset link has already been used",
      );
    }

    // 8. Prevent expired token
    if (new Date(storedToken.expires_at) < new Date()) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "This reset link has expired",
      );
    }

    // 9. Change password
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = now()
       WHERE id = $2`,
      [passwordHash, storedToken.user_id],
    );

    // 10. Invalidate all unused password reset tokens
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [storedToken.user_id],
    );

    // 11. Revoke all active refresh tokens
    // This signs the user out from every device.
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [storedToken.user_id],
    );

    // 12. Commit everything together
    await client.query("COMMIT");
    inTransaction = false;

    // 13. Clear cookies from this browser
    res.clearCookie("access_token", accessCookieOptions);
    res.clearCookie("refresh_token", refreshCookieOptions);

    // 14. Return success
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Password reset successfully, please log in again",
    });
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    throw error;
  } finally {
    // Always release connection
    client.release();
  }
}

// ─────────────────────────────────────────────
// 9. Change Password Controller
// ─────────────────────────────────────────────

export async function changePasswordController(req: Request, res: Response) {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // 1. Validated by validate(changePasswordSchema) on the route
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  // 2. Read the stored hash
  const result = await pool.query<
    Pick<UserWithPassword, "id" | "password_hash">
  >(
    `SELECT id, password_hash
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const user = result.rows[0];

  // JWT is valid, but user no longer exists.
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // 3. Confirm whoever is at the keyboard knows the current password.
  // Without this an unlocked laptop is enough to take the account for good.
  const isPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password_hash,
  );

  /*
   * FORBIDDEN, not UNAUTHORIZED, and the distinction is load-bearing.
   *
   * requireAuth has already passed, so the session is fine — what failed is
   * the extra proof this one action demands. Answering 401 would collide with
   * "your access token expired", which the frontend responds to by rotating
   * the refresh token and retrying: a mistyped password would silently burn a
   * rotation and spend two attempts against the rate limiter instead of one.
   *
   * loginController makes the same distinction, answering 403 for an
   * unverified account rather than 401.
   */
  if (!isPasswordValid) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Current password is incorrect");
  }

  // 4. Hash the new password before opening the transaction, because bcrypt is
  // deliberately slow and holding a pooled connection through it is waste.
  const passwordHash = await hashPassword(newPassword);

  /*
   * 5. Mint this browser's replacement session before the transaction too, so
   *    the work inside it is only database writes.
   *
   *    A replacement is needed because the refresh_token cookie is scoped to
   *    path /api/v1/auth/refresh and so is never sent here — the server has no
   *    way to tell which stored row belongs to the browser making this
   *    request. Revoking every session and issuing this one a fresh token
   *    reaches the same end state: signed out everywhere else, still signed in
   *    here.
   */
  const accessToken = jwt.sign({ sub: userId }, env.ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

  const { token: refreshToken, tokenHash: refreshTokenHash } =
    generateAndHashToken();

  // 6. Get a dedicated database connection
  const client = await pool.connect();

  let inTransaction = false;

  try {
    // 7. Start transaction
    await client.query("BEGIN");
    inTransaction = true;

    // 8. Change the password
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           updated_at = now()
       WHERE id = $2`,
      [passwordHash, userId],
    );

    /*
     * 9. Spend any outstanding reset links.
     *
     * Someone who asked for a reset email and then changed their password from
     * inside the app has left a live link sitting in their inbox. It sets a
     * password they no longer chose, so it dies here.
     */
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId],
    );

    /*
     * 10. Revoke every session, this browser's included.
     *
     * Changing a password is what people do when they think someone else is
     * in. Leaving that someone's session alive would defeat the point.
     */
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = now()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [userId],
    );

    // 11. Then hand this browser the replacement minted above
    await client.query(
      `INSERT INTO refresh_tokens
       (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
      [userId, refreshTokenHash, REFRESH_TOKEN_EXPIRES_IN],
    );

    // 12. Commit everything together
    await client.query("COMMIT");
    inTransaction = false;

    // 13. Swap in the new session's cookies
    res.cookie("access_token", accessToken, {
      ...accessCookieOptions,
      maxAge: ACCESS_TOKEN_EXPIRES_IN * 1000,
    });

    res.cookie("refresh_token", refreshToken, {
      ...refreshCookieOptions,
      maxAge: REFRESH_TOKEN_EXPIRES_IN * 1000,
    });

    /*
     * 14. Return success.
     *
     * Other devices keep working until their access token expires — up to 15
     * minutes. Revoking a refresh token cannot reach a JWT already issued;
     * that is the trade a stateless access token makes. They are locked out at
     * the next refresh, which is the soonest anything server-side is consulted.
     */
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Password changed, other devices have been signed out",
    });
  } catch (error) {
    // Only rollback if a transaction is actually open
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    throw error;
  } finally {
    // Always release connection
    client.release();
  }
}
