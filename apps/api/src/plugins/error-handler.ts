import fp from "fastify-plugin";
import { ApiError, errorResponse } from "../utils/response.js";

export const errorHandlerPlugin = fp(async (app) => {
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send(errorResponse("NOT_FOUND", "Route not found"));
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(errorResponse(error.code, error.message));
    }

    request.log.error({ err: error }, "Unhandled API error");
    return reply.code(500).send(errorResponse("INTERNAL_ERROR", "Internal server error"));
  });
});
