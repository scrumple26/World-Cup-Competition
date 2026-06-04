import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { v2 as cloudinary } from "cloudinary";

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

export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Must be an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });

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

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cloudinary error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
