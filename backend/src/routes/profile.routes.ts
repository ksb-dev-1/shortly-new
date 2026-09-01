import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import multer from "multer";

import { MAX_AVATAR_BYTES } from "../config/uploads.js";
import {
  deleteUserAccountController,
  updateUserProfileController,
  userProfileController,
} from "../controllers/profile.controller.js";
import { deleteAccountLimiter } from "../middlewares/authRateLimiter.middleware.js";
import { ApiError } from "../middlewares/errorHandler.middleware.js";
import { requireAuth } from "../middlewares/requireAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  deleteAccountSchema,
  updateProfileSchema,
} from "../schemas/profile.schema.js";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_AVATAR_BYTES,
    files: 1,
  },

  fileFilter(_req, file, callback) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      return callback(
        new ApiError(
          StatusCodes.BAD_REQUEST,
          "Image must be a JPEG, PNG or WebP file",
        ),
      );
    }

    callback(null, true);
  },
});

const router = Router();

router.get("/", requireAuth, userProfileController);

// upload.single must run before validate: req.body does not exist until
// multer has parsed the multipart payload.
router.patch(
  "/",
  requireAuth,
  upload.single("image"),
  validate(updateProfileSchema),
  updateUserProfileController,
);

// The password arrives in a body, which DELETE is allowed to carry and which
// express.json() parses like any other. The alternative — a password in the
// query string — would end up in server logs.
router.delete(
  "/",
  deleteAccountLimiter,
  requireAuth,
  validate(deleteAccountSchema),
  deleteUserAccountController,
);

export default router;
