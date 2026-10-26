import type { Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../lib/http-error.js";

type ValidatedHandler<T> = (
  req: Request,
  res: Response,
  body: T,
) => Promise<void> | void;

export function validateBody<T>(
  schema: ZodType<T>,
  handler: ValidatedHandler<T>,
): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new HttpError(400, "Data permintaan tidak valid."));
    }

    return Promise.resolve(handler(req, res, result.data)).catch(next);
  };
}