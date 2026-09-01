import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/**
 * Validates req.body against a schema and REPLACES it with the parsed result.
 *
 * The replacement is the whole point: these schemas transform as well as
 * check — emailSchema trims and lowercases — so a controller reading the
 * raw body would defeat the email UNIQUE constraint.
 *
 * A ZodError thrown here is caught by Express and formatted by errorHandler.
 */
export function validate(schema: ZodType) {
  return function validateRequestBody(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    req.body = schema.parse(req.body);
    next();
  };
}
