import { Router } from "express";

import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  refreshController,
  resendVerificationController,
  resetPasswordController,
  signupController,
  verifyEmailController,
} from "../controllers/auth.controller.js";
import {
  changePasswordLimiter,
  emailLimiter,
  loginLimiter,
  refreshLimiter,
  signupLimiter,
  tokenLimiter,
} from "../middlewares/authRateLimiter.middleware.js";
import { requireAuth } from "../middlewares/requireAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from "../schemas/auth.schema.js";

const router = Router();

router.post("/signup", signupLimiter, validate(signupSchema), signupController);

router.post(
  "/verify-email",
  tokenLimiter,
  validate(verifyEmailSchema),
  verifyEmailController,
);

router.post(
  "/resend-verification",
  emailLimiter,
  validate(resendVerificationSchema),
  resendVerificationController,
);

router.post("/login", loginLimiter, validate(loginSchema), loginController);

// No schema: reads the refresh_token cookie, not a body
router.post("/refresh", refreshLimiter, refreshController);

// No schema: reads the refresh_token cookie, not a body
router.post("/logout", logoutController);

router.post(
  "/forgot-password",
  emailLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordController,
);

router.post(
  "/reset-password",
  tokenLimiter,
  validate(resetPasswordSchema),
  resetPasswordController,
);

// The only auth route behind requireAuth: every other one is how you get a
// session, this one changes the account you are already signed in to.
router.post(
  "/change-password",
  changePasswordLimiter,
  requireAuth,
  validate(changePasswordSchema),
  changePasswordController,
);

export default router;
