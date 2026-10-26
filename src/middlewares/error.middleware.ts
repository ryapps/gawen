import type { ErrorRequestHandler } from "express";
import { HttpError } from "../lib/http-error.js";

function isPrismaUniqueConstraintError(
  error: unknown,
): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

const errorHandler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
) => {
  let statusCode = 500;
  let message = "Terjadi kesalahan pada server.";

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (isPrismaUniqueConstraintError(err)) {
    statusCode = 409;
    message = "Data yang diminta sudah terdaftar.";
  } else if (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err.status === 400 || err.status === 413)
  ) {
    statusCode = err.status;
    message =
      err.status === 413
        ? "Ukuran request melebihi batas."
        : "Format request tidak valid.";
  }

  if (statusCode >= 500) {
    const errorName =
      err instanceof Error ? err.name : "Unknown request error";
    console.error(`Request failed: ${errorName}`);
  }

  res.status(statusCode).json({
    status: "error",
    message,
  });
};

export default errorHandler;