// Keep the existing email service and its secret in Cloudflare during the move.
const WORKER_URL =
  "https://riley-portfolio-contact.soundsculptor-riley.workers.dev/";
// Compatibility with the currently deployed Worker's origin allowlist.
const WORKER_ORIGIN = "https://rileypigneguy.github.io";
const SITE_ORIGIN = "https://riley-pigneguy-portfolio.vercel.app";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
  const allowedOrigins = new Set([SITE_ORIGIN]);
  for (const hostname of [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
  ]) {
    if (hostname) allowedOrigins.add(`https://${hostname}`);
  }
  if (!allowedOrigins.has(req.headers.origin)) {
    return res
      .status(403)
      .json({
        ok: false,
        error: "This form only works from Riley's portfolio.",
      });
  }
  const body =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(body, "utf8") > 20000) {
    return res
      .status(413)
      .json({ ok: false, error: "That message is too long." });
  }
  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WORKER_ORIGIN },
      body,
      signal: AbortSignal.timeout(10000),
    });
    return res.status(response.status).json(await response.json());
  } catch {
    console.error("Contact email service unavailable");
    return res
      .status(502)
      .json({ ok: false, error: "The message couldn't be sent right now." });
  }
}
