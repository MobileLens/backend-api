import * as Minio from "minio";

const ENDPOINT  = process.env["MINIO_ENDPOINT"]  ?? "localhost";
const PORT      = parseInt(process.env["MINIO_PORT"] ?? "9000", 10);
const ACCESS    = process.env["MINIO_ROOT_USER"]     ?? "minioadmin";
const SECRET    = process.env["MINIO_ROOT_PASSWORD"] ?? "minioadmin";
const USE_SSL   = process.env["MINIO_USE_SSL"] === "true";

export const minioClient = new Minio.Client({
  endPoint:        ENDPOINT,
  port:            PORT,
  useSSL:          USE_SSL,
  accessKey:       ACCESS,
  secretKey:       SECRET,
});

export const BUCKETS = {
  photos:        "photos",
  videos:        "videos",
  reviewMedia:   "review-media",
  deviceImages:  "device-images",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/** Generate a presigned PUT URL valid for 15 minutes */
export async function presignedPut(bucket: BucketName, objectKey: string): Promise<string> {
  return minioClient.presignedPutObject(bucket, objectKey, 15 * 60);
}

/** Generate a presigned GET URL valid for 1 hour */
export async function presignedGet(bucket: BucketName, objectKey: string): Promise<string> {
  return minioClient.presignedGetObject(bucket, objectKey, 60 * 60);
}

/** Public-style URL used in DB storage_url column */
export function storageUrl(bucket: BucketName, objectKey: string): string {
  return `minio://${bucket}/${objectKey}`;
}
