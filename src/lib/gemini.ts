import "server-only";

/**
 * POST to Gemini `generateContent` with a single rate-limit (429) retry that
 * honors Google's suggested `retryDelay`. Centralizes the call so every AI
 * feature (pundit recap, tweets) gets the same free-tier backoff. Returns the
 * final Response for the caller to parse (and to check `res.ok`).
 */
export async function geminiGenerate(model: string, key: string, payload: unknown): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const opts = (): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
  });

  let res = await fetch(url, opts());
  if (res.status === 429) {
    // Google returns e.g. "retry in 25.9s" / "retryDelay": "25s". Wait that long
    // (capped) and try once more — the free-tier limit resets each minute.
    const txt = await res.text().catch(() => "");
    const m = txt.match(/retry in ([\d.]+)s/i) ?? txt.match(/"retryDelay":\s*"([\d.]+)s"/);
    const waitMs = Math.min(((m ? parseFloat(m[1]) : 7) + 1) * 1000, 15_000);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, opts());
  }
  return res;
}
