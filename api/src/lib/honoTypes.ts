import type { Session, User } from "better-auth";

// Role jako pojedyncze źródło prawdy — używane też w middleware/requireAuth.ts
export type Role = "user" | "reviewer" | "moderator" | "admin";

// Hono context variables shared across routes.
// WAŻNE: to musi być realnie podpięte jako `new Hono<{ Variables: HonoVariables }>()`
// w każdym routerze, który korzysta z c.get("user") / c.get("session") —
// inaczej TypeScript nic tu nie sprawdzi i wracamy do zgadywania kształtu obiektu.
export type HonoVariables = {
  user: User & { role?: Role };
  session: Session;
};
