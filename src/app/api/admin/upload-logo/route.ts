import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmin } from "@/lib/firebase/requireAdmin";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

function configureCloudinary(): boolean {
  const name   = process.env.CLOUDINARY_CLOUD_NAME;
  const key    = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!name || !key || !secret) return false;
  cloudinary.config({ cloud_name: name, api_key: key, api_secret: secret });
  return true;
}

/**
 * POST /api/admin/upload-logo  (admin only, multipart form-data)
 * Fields: uid (target team), image (file).
 * Uploads the logo under the target team's id and sets users/{uid}.logoUrl.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const uid = String(form?.get("uid") ?? "").trim();
  const file = form?.get("image") as File | null;

  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
  if (!file || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }
  if (!configureCloudinary()) {
    return NextResponse.json({ error: "Cloudinary not configured" }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "wc-competition/logos",
          public_id: `logo-${uid}`,
          overwrite: true,
          transformation: [
            { width: 200, height: 200, crop: "fill", gravity: "auto", quality: "auto", fetch_format: "auto" },
          ],
        },
        (err, res) => {
          if (err || !res) reject(err ?? new Error("Upload failed"));
          else resolve(res as { secure_url: string });
        },
      );
      stream.end(buffer);
    });

    await db.collection("users").doc(uid).set({ logoUrl: result.secure_url }, { merge: true });
    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cloudinary error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
