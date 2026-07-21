import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../env.js";
import { SESSION_COOKIE } from "../../plugins/auth.js";
import { verifyPassword } from "../../utils/password.js";
import { ApiError, errorResponse, parseRequest } from "../../utils/response.js";
import { createAuditLog } from "../audit/audit.service.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required"),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = parseRequest(loginSchema, request.body);
    const email = body.email.trim().toLowerCase();
    const user = await app.prisma.user.findUnique({ where: { email } });
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;

    if (!user || !valid) {
      await createAuditLog(app.prisma, {
        action: "auth.login_failed",
        entityType: "user",
        metadata: { email },
      }).catch((error: unknown) => {
        request.log.warn({ err: error }, "Unable to write failed-login audit log");
      });

      return reply
        .code(401)
        .send(errorResponse("UNAUTHORIZED", "Invalid email or password"));
    }

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: "12h" },
    );

    reply.setCookie(SESSION_COOKIE, token, cookieOptions);

    await createAuditLog(app.prisma, {
      userId: user.id,
      action: "auth.login_succeeded",
      entityType: "user",
      entityId: user.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  });

  app.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    return { success: true };
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    return { user };
  });
}
