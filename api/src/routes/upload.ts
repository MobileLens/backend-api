import { Hono } from "hono";
import { db } from "../db/index.js";
import { photo, video } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { presignedPut, storageUrl, objectExists, BUCKETS } from "../lib/minio.js";
import type { HonoVariables } from "../types/honoTypes.js";
import { randomUUID } from "node:crypto";

const uploadRouter = new Hono<{ Variables: HonoVariables }>();

uploadRouter.post("/photo/request", requireAuth, async (c) => {
  const body = await c.req.json<{
    cameraId: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    widthPx: number;
    heightPx: number;
  }>();
  if (!body.cameraId) return c.json({ error: "cameraId required" }, 400);

  const ext = body.mimeType === "image/png" ? "png" : body.mimeType === "image/webp" ? "webp" : "jpg";
  const objectKey = `${body.cameraId}/${randomUUID()}.${ext}`;
  const uploadUrl = await presignedPut(BUCKETS.photos, objectKey);
  return c.json({ uploadUrl, objectKey });
});

uploadRouter.post("/photo/confirm", requireAuth, async (c) => {
  const user = c.get("user");

  const body = await c.req.json<{
    objectKey: string;
    cameraId: string;
    widthPx: number;
    heightPx: number;
    exifFocalLength?: number;
    exifAperture?: number;
    exifIso?: number;
    exifShutterSpeed?: number;
  }>();
  if (!body.objectKey || !body.cameraId) return c.json({ error: "objectKey and cameraId required" }, 400);

  if (!body.objectKey.startsWith(`${body.cameraId}/`)) {
    return c.json({ error: "objectKey does not match cameraId" }, 400);
  }


  if (!(await objectExists(BUCKETS.photos, body.objectKey))) {
    return c.json({ error: "Uploaded object not found — upload it before confirming" }, 409);
  }

  const newPhoto = {
    id:               randomUUID(),
    uploaderId:       user.id,
    cameraId:         body.cameraId,
    storageUrl:       storageUrl(BUCKETS.photos, body.objectKey),
    exifFocalLength:  body.exifFocalLength ?? null,
    exifAperture:     body.exifAperture ?? null,
    exifIso:          body.exifIso ?? null,
    exifShutterSpeed: body.exifShutterSpeed ?? null,
    widthPx:          body.widthPx,
    heightPx:         body.heightPx,
    uploadDate:       new Date(),
    status:           "pending" as const,
  };

  await db.insert(photo).values(newPhoto);
  return c.json({ id: newPhoto.id, status: "pending" }, 201);
});

uploadRouter.post("/video/request", requireAuth, async (c) => {
  const body = await c.req.json<{
    cameraId: string;
    mimeType: string;
    widthPx: number;
    heightPx: number;
    fps: number;
  }>();
  if (!body.cameraId) return c.json({ error: "cameraId required" }, 400);

  const ext = body.mimeType.includes("quicktime") ? "mov" : body.mimeType.includes("webm") ? "webm" : "mp4";
  const objectKey = `${body.cameraId}/${randomUUID()}.${ext}`;
  const uploadUrl = await presignedPut(BUCKETS.videos, objectKey);
  return c.json({ uploadUrl, objectKey });
});

uploadRouter.post("/video/confirm", requireAuth, async (c) => {
  const user = c.get("user");

  const body = await c.req.json<{
    objectKey: string;
    cameraId: string;
    widthPx: number;
    heightPx: number;
    fps: number;
  }>();
  if (!body.objectKey || !body.cameraId || !body.fps) {
    return c.json({ error: "objectKey, cameraId, fps required" }, 400);
  }

  if (!body.objectKey.startsWith(`${body.cameraId}/`)) {
    return c.json({ error: "objectKey does not match cameraId" }, 400);
  }

  if (!(await objectExists(BUCKETS.videos, body.objectKey))) {
    return c.json({ error: "Uploaded object not found — upload it before confirming" }, 409);
  }

  const newVideo = {
    id:         randomUUID(),
    uploaderId: user.id,
    cameraId:   body.cameraId,
    storageUrl: storageUrl(BUCKETS.videos, body.objectKey),
    widthPx:    body.widthPx,
    heightPx:   body.heightPx,
    fps:        body.fps,
    uploadDate: new Date(),
    status:     "pending" as const,
  };

  await db.insert(video).values(newVideo);
  return c.json({ id: newVideo.id, status: "pending" }, 201);
});

uploadRouter.post("/review-media/request", requireAuth, async (c) => {
  const body = await c.req.json<{ type: "photo" | "video"; mimeType: string }>();
  const ext = body.mimeType.includes("png") ? "png"
    : body.mimeType.includes("webp") ? "webp"
    : body.mimeType.includes("mov") ? "mov"
    : body.mimeType.includes("webm") ? "webm"
    : body.type === "video" ? "mp4" : "jpg";

  const objectKey = `${randomUUID()}.${ext}`;
  const uploadUrl = await presignedPut(BUCKETS.reviewMedia, objectKey);
  return c.json({ uploadUrl, objectKey });
});

uploadRouter.post("/device-image/request", requireRole("moderator"), async (c) => {
  const body = await c.req.json<{ mimeType: string }>();
  const ext = body.mimeType.includes("png") ? "png" : body.mimeType.includes("webp") ? "webp" : "jpg";
  const objectKey = `${randomUUID()}.${ext}`;
  const uploadUrl = await presignedPut(BUCKETS.deviceImages, objectKey);
  return c.json({ uploadUrl, objectKey });
});

export { uploadRouter };
