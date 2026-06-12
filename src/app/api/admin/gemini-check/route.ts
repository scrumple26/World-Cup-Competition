import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY diagnostic — guarded by CRON_SECRET. Reports whether the prod
 * environment actually has a usable Gemini key and what Google says when called.
 * Remove after diagnosing.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.nextUrl.searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const info: Record<string, unknown> = {
    hasKey: !!key,
    keyLen: key?.length ?? 0,
    model,
    // Surface which Gemini-ish env var names exist (names only, never values).
    envNames: Object.keys(process.env).filter((n) => /GEMINI|GOOGLE|GENAI/i.test(n)),
  };
  if (!key) return NextResponse.json(info);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        }),
      },
    );
    info.status = res.status;
    info.body = (await res.text()).slice(0, 600);
  } catch (e) {
    info.fetchError = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(info);
}
