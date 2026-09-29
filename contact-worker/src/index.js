// Contact form endpoint for the portfolio. The site stays on GitHub Pages;
// this Worker holds the Resend API key and sends each message to Riley.
//
// Secret:   RESEND_API_KEY (set with `npx wrangler secret put RESEND_API_KEY`)
// Vars:     ALLOWED_ORIGINS, RESEND_TO_EMAIL, RESEND_FROM_EMAIL (see wrangler.jsonc)

const DEFAULT_TO = "riley.pigneguy@gmail.com";
const DEFAULT_FROM = "Riley Pigneguy Portfolio <onboarding@resend.dev>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Real people take a few seconds to write a message; instant submissions are bots.
const MIN_FILL_MS = 2500;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const isAllowed = allowed.includes(origin);
    const cors = isAllowed
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: isAllowed ? 204 : 403, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, cors);
    }
    if (!isAllowed) {
      return json({ ok: false, error: "This form only works from Riley's portfolio." }, 403, cors);
    }

    const raw = await request.text();
    if (raw.length > 20000) {
      return json({ ok: false, error: "That message is too long." }, 413, cors);
    }

    let payload;
    try {
      payload = JSON.parse(raw || "{}");
    } catch {
      return json({ ok: false, error: "Invalid request." }, 400, cors);
    }

    // Bots fill the hidden field or submit instantly: accept quietly and send nothing.
    if (payload.website || Number(payload.elapsed) < MIN_FILL_MS) {
      return json({ ok: true }, 200, cors);
    }

    const name = clean(payload.name, 100);
    const email = clean(payload.email, 320);
    const message = clean(payload.message, 5000, true);

    if (!message) {
      return json({ ok: false, error: "Please write a message first." }, 400, cors);
    }
    if (!EMAIL_PATTERN.test(email)) {
      return json({ ok: false, error: "Please enter a valid email so I can reply." }, 400, cors);
    }
    if (!env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return json({ ok: false, error: "Email isn't set up yet." }, 500, cors);
    }

    const sender = name ? `${name} <${email}>` : email;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
        to: [env.RESEND_TO_EMAIL || DEFAULT_TO],
        reply_to: email,
        subject: `Portfolio message from ${name || email}`,
        text: `${message}\n\n— ${sender}\nSent from the contact form on rileypigneguy.github.io/Portfolio`,
      }),
    });

    if (!response.ok) {
      console.error("Resend rejected the email:", response.status, await response.text());
      return json({ ok: false, error: "The message couldn't be sent right now." }, 502, cors);
    }

    return json({ ok: true }, 200, cors);
  },
};

// Trim, cap the length, and strip control characters. Single-line fields also
// lose line breaks, so a name can't smuggle extra lines into the subject.
function clean(value, maxLength, multiline = false) {
  if (value === undefined || value === null) {
    return "";
  }
  const pattern = multiline ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  return String(value).replace(pattern, " ").trim().slice(0, maxLength);
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
