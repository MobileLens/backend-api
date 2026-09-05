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


export async function presignedPut(bucket: BucketName, objectKey: string): Promise<string> {
  return minioClient.presignedPutObject(bucket, objectKey, 15 * 60);
}


export async function presignedGet(bucket: BucketName, objectKey: string): Promise<string> {
  return minioClient.presignedGetObject(bucket, objectKey, 60 * 60);
}

export function storageUrl(bucket: BucketName, objectKey: string): string {
  return `minio://${bucket}/${objectKey}`;
}


export async function objectExists(bucket: BucketName, objectKey: string): Promise<boolean> {
  try {
    await minioClient.statObject(bucket, objectKey);
    return true;
  } catch {
    return false;
  }
}
