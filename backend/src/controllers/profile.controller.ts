import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { env } from "../config/env.js";
import {
  accessCookieOptions,
  refreshCookieOptions,
} from "../controllers/auth.controller.js";
import { pool } from "../db/index.js";
import { ApiError } from "../middlewares/errorHandler.middleware.js";
import type {
  DeleteAccountInput,
  UpdateProfileInput,
} from "../schemas/profile.schema.js";
import type { PublicUser, UserWithPassword } from "../types/db.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload an avatar to Cloudinary.
 *
 * Every user has one fixed Cloudinary public ID:
 *
 * shortly/avatars/<userId>/avatar
 *
 * A new upload overwrites the previous avatar.
 */
async function uploadAvatar(userId: string, image: Buffer): Promise<string> {
  const uploaded = await new Promise<{ secure_url: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `shortly/avatars/${userId}`,
          public_id: "avatar",

          overwrite: true,
          invalidate: true,

          resource_type: "image",

          transformation: [
            {
              width: 512,
              height: 512,
              crop: "fill",
              gravity: "face",
            },
            {
              quality: "auto",
              fetch_format: "auto",
            },
          ],
        },
        (error, result) => {
          if (error) {
            return reject(error);
          }

          if (!result) {
            return reject(new Error("Cloudinary returned no result"));
          }

          resolve(result);
        },
      );

      stream.end(image);
    },
  );

  return uploaded.secure_url;
}

// ─────────────────────────────────────────────
// 1. Get User Profile
// ─────────────────────────────────────────────

export async function userProfileController(req: Request, res: Response) {
  // requireAuth should have populated this.
  // The explicit check also keeps TypeScript happy.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const result = await pool.query<PublicUser>(
    `SELECT
       id,
       name,
       email,
       is_verified,
       avatar_url,
       created_at
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const user = result.rows[0];

  // JWT is valid, but user no longer exists.
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  return res.status(StatusCodes.OK).json({
    success: true,
    user,
  });
}

// ─────────────────────────────────────────────
// 2. Update User Profile
// ─────────────────────────────────────────────

export async function updateUserProfileController(req: Request, res: Response) {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // Multer parses multipart/form-data, then validate(updateProfileSchema)
  // checks the text fields. Both run on the route, before this handler.
  const { name } = req.body as UpdateProfileInput;
  const image = req.file;

  // Reject an empty update.
  if (name === undefined && !image) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Provide a name or an image to update",
    );
  }

  // Upload the avatar before changing the database.
  // If Cloudinary fails, the database remains unchanged.
  const avatarUrl = image ? await uploadAvatar(userId, image.buffer) : null;

  const result = await pool.query<PublicUser>(
    `UPDATE users
     SET
       name = COALESCE($1, name),
       avatar_url = COALESCE($2, avatar_url),
       updated_at = now()
     WHERE id = $3
     RETURNING
       id,
       name,
       email,
       is_verified,
       avatar_url,
       created_at`,
    [name ?? null, avatarUrl, userId],
  );

  const user = result.rows[0];

  // JWT is valid, but user no longer exists: the UPDATE matched no row.
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Profile updated",
    user,
  });
}

// ─────────────────────────────────────────────
// 3. Delete User Account
// ─────────────────────────────────────────────

export async function deleteUserAccountController(req: Request, res: Response) {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // 1. Validated by validate(deleteAccountSchema) on the route
  const { password } = req.body as DeleteAccountInput;

  // 2. Read the stored hash, and the avatar that has to go with the row
  const result = await pool.query<
    Pick<UserWithPassword, "id" | "password_hash" | "avatar_url">
  >(
    `SELECT id, password_hash, avatar_url
     FROM users
     WHERE id = $1`,
    [userId],
  );

  const user = result.rows[0];

  // JWT is valid, but user no longer exists.
  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // 3. Ask for the password again. This is irreversible and takes every link
  // with it, so an unlocked laptop must not be enough on its own.
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  /*
   * FORBIDDEN rather than UNAUTHORIZED, matching changePasswordController:
   * requireAuth has already passed, so the session is fine — it is the extra
   * proof this action demands that failed. Answering 401 would collide with
   * "your access token expired", which the frontend answers by rotating the
   * refresh token and retrying the request.
   */
  if (!isPasswordValid) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Password is incorrect");
  }

  /*
   * 4. One DELETE is the whole thing.
   *
   * links, link_clicks, refresh_tokens, email_verification_tokens and
   * password_reset_tokens all reference users with ON DELETE CASCADE, so the
   * database removes them itself — no transaction to coordinate.
   */
  await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);

  /*
   * 5. Then the avatar, best effort and deliberately after the row is gone.
   *
   * A failed destroy leaves an orphaned image in Cloudinary, which can be
   * cleaned up later. Destroying first and then failing to delete would leave
   * a live account whose avatar 404s, which the user would have to look at.
   */
  if (user.avatar_url) {
    try {
      await cloudinary.uploader.destroy(`shortly/avatars/${userId}/avatar`, {
        invalidate: true,
      });
    } catch (error) {
      console.error("Failed to delete avatar from Cloudinary:", error);
    }

    /*
     * 6. And the folder that held it.
     *
     * destroy() removes the asset only — Cloudinary keeps the folder, empty,
     * for good. Every deleted account would otherwise leave a
     * shortly/avatars/<uuid>/ behind with nothing in it.
     *
     * Separate try/catch so a folder that will not go does not get logged as a
     * failed avatar deletion. It can legitimately fail: delete_folder refuses
     * a folder that is not empty, and the destroy above is not always visible
     * to the Admin API the instant it returns. An empty folder is cosmetic, so
     * this is worth one attempt and not a retry.
     */
    try {
      await cloudinary.api.delete_folder(`shortly/avatars/${userId}`);
    } catch (error) {
      console.error("Failed to delete avatar folder from Cloudinary:", error);
    }
  }

  // 7. Remove authentication cookies. The refresh-token rows cascaded away
  // with the user, so nothing is left for these to unlock.
  res.clearCookie("access_token", accessCookieOptions);
  res.clearCookie("refresh_token", refreshCookieOptions);

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Account deleted",
  });
}
