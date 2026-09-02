import type { Context, Next } from "hono";
import { auth } from "../lib/auth.js";

export type Role = "user" | "reviewer" | "moderator" | "admin";

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  reviewer: 1,
  moderator: 2,
  admin: 3,
};

export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("session", session.session);
  c.set("user", session.user);
  await next();
}

export function requireRole(minRole: Role) {
  return async (c: Context, next: Next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    c.set("session", session.session);
    c.set("user", session.user);
    const userRole = ((session.user as Record<string, unknown>)["role"] as Role | undefined) ?? "user";
    if (ROLE_RANK[userRole] < ROLE_RANK[minRole]) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}
