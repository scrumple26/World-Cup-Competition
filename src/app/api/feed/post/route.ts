import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";
import type { FeedPost } from "@/lib/feedTypes";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

function configureCloudinary(): boolean {
  const name   = process.env.CLOUDINARY_CLOUD_NAME;
  const key    = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || !key || !secret) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret });
  return true;
}

/**
 * POST /api/feed/post  (admin only, multipart form-data)
 * Fields: text (string, optional), image (file, optional). At least one required.
 * Creates a feed post, uploading the image to Cloudinary when present.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const text = String(form?.get("text") ?? "").trim();
  const file = form?.get("image") as File | null;

  if (!text && !file) {
    return NextResponse.json({ error: "Provide text or an image" }, { status: 400 });
  }

  let imageUrl: string | undefined;
  if (file && typeof file.arrayBuffer === "function") {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Must be an image" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
    }
    if (!configureCloudinary()) {
      return NextResponse.json({ error: "Cloudinary not configured" }, { status: 503 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "wc-competition/feed",
            public_id: `post-${randomUUID()}`,
            overwrite: true,
            transformation: [
              { width: 1280, crop: "limit", quality: "auto", fetch_format: "auto" },
            ],
          },
          (err, res) => {
            if (err || !res) reject(err ?? new Error("Upload failed"));
            else resolve(res as { secure_url: string });
          },
        );
        stream.end(buffer);
      });
      imageUrl = result.secure_url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cloudinary error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const id = randomUUID();
  const post: FeedPost = {
    id,
    text,
    ...(imageUrl ? { imageUrl } : {}),
    authorUid: admin.uid,
    authorName: "Commissioner",
    createdAt: new Date().toISOString(),
  };
  await db.collection("feedPosts").doc(id).set(post);
  return NextResponse.json(post);
}

/** DELETE /api/feed/post  { id }  (admin only) */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await db.collection("feedPosts").doc(id).delete().catch(() => {});
  return NextResponse.json({ ok: true });
}
