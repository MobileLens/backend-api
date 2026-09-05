import * as Minio from "minio";

const ENDPOINT  = process.env["MINIO_ENDPOINT"]  ?? "localhost";
const PORT      = parseInt(process.env["MINIO_PORT"] ?? "9000", 10);
const ACCESS    = process.env["MINIO_ROOT_USER"]     ?? "minioadmin";
const SECRET    = process.env["MINIO_ROOT_PASSWORD"] ?? "minioadmin";
const USE_SSL   = process.env["MINIO_USE_SSL"] === "true";

const PUBLIC_MINIO_URL = process.env["PUBLIC_MINIO_URL"] ?? "http://localhost:9000";

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

  const internalUrl = await minioClient.presignedPutObject(bucket, objectKey, 15 * 60);

  return internalUrl.replace(/^https?:\/\/[^/]+/, PUBLIC_MINIO_URL);
}


export async function presignedGet(bucket: BucketName, objectKey: string): Promise<string> {
  const internalUrl = await minioClient.presignedGetObject(bucket, objectKey, 60 * 60);
  return internalUrl.replace(/^https?:\/\/[^/]+/, PUBLIC_MINIO_URL);
}


export function storageUrl(bucket: BucketName, objectKey: string): string {
  return `minio://${bucket}/${objectKey}`;
}


export async function uploadStream(
  bucket: BucketName,
  objectKey: string,
  stream: ReadableStream<Uint8Array>,
  size: number,
): Promise<void> {
  const nodeStream = stream as any;

  await minioClient.putObject(bucket, objectKey, nodeStream, size);
}

export async function objectExists(bucket: BucketName, objectKey: string): Promise<boolean> {
  try {
    await minioClient.statObject(bucket, objectKey);
    return true;
  } catch {
    return false;
  }
}
