import { Hono } from "hono";
import { auth } from "../lib/auth.js";

const authRouter = new Hono();

// Delegate all /api/auth/* to better-auth
authRouter.all("/*", (c) => auth.handler(c.req.raw));

export { authRouter };
