import type { Session, User } from "better-auth";

// Hono context variables shared across routes
export type HonoVariables = {
  user: User & { role?: string };
  session: Session;
};
