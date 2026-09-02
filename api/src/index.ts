import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  authRouter, brandsRouter, smartphonesRouter, camerasRouter,
  uploadRouter, reviewsRouter, favoritesRouter, adminRouter
} from "./routes/index.js";

import { startAggregationScheduler } from "./services/cameraAggregation.js";

const app = new Hono();

// ── Global middleware ─────────────────────────────────────────────────────────

app.use("*", logger());

app.use("*", cors({
  origin: (origin) => origin, // Echo origin — restrict in prod via ALLOWED_ORIGINS env
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
}));

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok", ts: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.route("/api/auth",        authRouter);
app.route("/api/brands",      brandsRouter);
app.route("/api/smartphones", smartphonesRouter);
app.route("/api/cameras",     camerasRouter);
app.route("/api/upload",      uploadRouter);
app.route("/api/reviews",     reviewsRouter);
app.route("/api/favorites",   favoritesRouter);
app.route("/api/admin",       adminRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ── Start aggregation scheduler ───────────────────────────────────────────────

startAggregationScheduler();

// ── Server ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] MobileLens API running on http://localhost:${info.port}`);
  console.log(`[server] NODE_ENV=${process.env["NODE_ENV"] ?? "development"}`);
});
