import type { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { MulterError } from "multer";
import { ZodError, z } from "zod";

import { env } from "../config/env.js";
import { MAX_AVATAR_LABEL } from "../config/uploads.js";

/**
 * An error a controller raises on purpose, carrying the status and the
 * message the client is allowed to see. Anything else becomes a 500.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Runs when no route matched, so unknown URLs get JSON instead of Express's HTML. */
export function notFoundHandler(req: Request, res: Response) {
  return res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

/**
 * The single place that decides how an error becomes a response.
 * Express 5 forwards rejected promises here on its own, so controllers
 * can throw instead of carrying their own try/catch.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Express requires the 4-arg shape; if headers are already sent it must
  // hand back to the default handler, which closes the connection.
  if (res.headersSent) {
    return next(error);
  }

  // Raised deliberately by a controller
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  // A schema was parsed with .parse() instead of .safeParse()
  if (error instanceof ZodError) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      errors: z.treeifyError(error),
    });
  }

  // Upload rejected by multer: too large, too many files, wrong field name
  if (error instanceof MulterError) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? `Image must be ${MAX_AVATAR_LABEL} or smaller`
          : `Upload failed: ${error.message}`,
    });
  }

  // Postgres unique violation, e.g. an email that already exists
  if (error instanceof Error && "code" in error && error.code === "23505") {
    return res.status(StatusCodes.CONFLICT).json({
      success: false,
      message: "Already exists",
    });
  }

  // Anything unrecognised: log the real cause, tell the client nothing.
  // Leaking a stack trace or a SQL error to the client is how internals escape.
  req.log.error(error);

  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal server error",
    ...(env.IS_PRODUCTION
      ? {}
      : { debug: error instanceof Error ? error.message : String(error) }),
  });
}
