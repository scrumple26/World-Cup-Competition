import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminStorage } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  const storage = getAdminStorage();
  if (!auth || !storage) {
    return NextResponse.json({ error: "Server not configured" }, { status: 503 });
  }

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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!;
  const bucket = storage.bucket(bucketName);
  const storageFile = bucket.file(`logos/${uid}`);

  await storageFile.save(buffer, {
    contentType: file.type,
    metadata: { cacheControl: "public, max-age=31536000" },
  });
  await storageFile.makePublic();

  const url = storageFile.publicUrl();
  return NextResponse.json({ url });
}
