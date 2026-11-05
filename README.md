# Riley Pigneguy — Minimal editorial preview

A separate design direction on `preview/minimal-editorial`, inspired by monochrome print, file windows, and tactile dot textures. Production stays on `main`.

Plain HTML, CSS and JavaScript. No frontend build step or dependencies. Run `python3 -m http.server 4173` for a static local preview; deploy to Vercel for `/api/contact`.

The six projects retain their descriptions, technology lists, screenshot galleries, and live/source links. Education, Uplyft work, the pending CMCA internship, and the full toolkit remain available. The contact form includes validation, a honeypot, loading/error states, and a direct email fallback; email copying and the embedded artist website preview also work.

`api/contact.mjs` forwards to the existing Cloudflare email Worker. The Resend key remains in Cloudflare. Accepted form origins are production and the exact Vercel deployment/branch hostnames supplied by the runtime.

Preview pages are noindex. The production canonical and Google verification file are preserved. Motion respects reduced-motion preferences; content is readable without JavaScript.

Screenshot galleries use responsive 640px and 1200px WebP files in
`Assets/previews/`. Filenames include a content hash so Vercel and the browser
can cache them for a year without serving stale replacements. Original PNGs
and the previous JPEG exports remain in the repository. Galleries preload and
decode when their project approaches the viewport, including closed project
entries, and keep the current image visible until a new selection is ready.
