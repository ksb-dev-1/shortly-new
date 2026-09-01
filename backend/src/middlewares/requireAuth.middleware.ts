import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // 1. Get access token from HTTP-only cookie
  const token = req.cookies.access_token;

  if (!token) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized",
    });
  }

  try {
    // 2. Verify JWT signature and expiration
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    // 3. Make sure the JWT has the expected structure
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.sub !== "string"
    ) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 4. Store authenticated user ID on the request
    req.userId = payload.sub;

    // 5. Continue to controller
    next();
  } catch {
    // Invalid, expired, or tampered token
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized",
    });
  }
}
