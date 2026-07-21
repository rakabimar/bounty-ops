import type { ZodType } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TELEGRAM_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(code: ErrorCode, message: string) {
  return { error: { code, message } };
}

export function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request";
    throw new ApiError(400, "BAD_REQUEST", message);
  }

  return result.data;
}
