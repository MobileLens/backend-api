import { Hono } from "hono";
import { db } from "../db/index.js";
import { favorite, smartphone, brand } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/requireAuth.js";
import { auth } from "../lib/auth.js";

const favoritesRouter = new Hono();

favoritesRouter.get("/", requireAuth, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const rows = await db
    .select({
      smartphoneId: favorite.smartphoneId,
      addedAt:      favorite.addedAt,
      modelName:    smartphone.modelName,
      imageUrl:     smartphone.imageUrl,
      brandName:    brand.name,
    })
    .from(favorite)
    .leftJoin(smartphone, eq(favorite.smartphoneId, smartphone.id))
    .leftJoin(brand, eq(smartphone.brandId, brand.id))
    .where(eq(favorite.userId, session.user.id));

  return c.json(rows);
});

favoritesRouter.post("/:smartphoneId", requireAuth, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  await db.insert(favorite)
    .values({ userId: session.user.id, smartphoneId: c.req.param("smartphoneId") as string, addedAt: new Date() })
    .onConflictDoNothing();

  return c.json({ ok: true }, 201);
});

favoritesRouter.delete("/:smartphoneId", requireAuth, async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  await db.delete(favorite).where(
    and(
      eq(favorite.userId, session.user.id),
      eq(favorite.smartphoneId, c.req.param("smartphoneId") as string)
    )
  );

  return c.json({ ok: true });
});

export { favoritesRouter };
