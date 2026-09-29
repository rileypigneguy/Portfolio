# Portfolio site

This is a static portfolio website built with plain HTML, CSS, and JavaScript.
There is no build step, framework, or dependency.

## The idea

The page is told as a neural network's forward pass, and the reader is the
signal travelling through it:

1. **Cold open**: a single neuron, three lines that write themselves as you
   scroll (including the live time in Perth), then the neuron fires into the page
2. **Layer 0 · Input**: who I am, plus a working terminal you can type into
3. **Layer 1 · Hidden**: three years at UWA as three training epochs
4. **Layer 2 · Activations**: the six builds, including a live, scrollable
   preview of michaelpigneguy.com
5. **Layer 3 · Weights**: an interactive graph of every tool and what it built
6. **Layer 4 · Your turn**: a small neural network the reader trains in the browser
7. **Layer 5 · Output**: contact, plus a receipt of the reader's own trip

Every block of content is a node. Glowing wires connect each node to the next,
and a pulse travels down them as you scroll, lighting nodes and words as it
reaches them.

## Files

- `index.html` - all content, in story order
- `styles.css` - styling, dormant and lit states, and responsive rules
- `script.js` - the signal engine, cold open, terminal, graph, and neural network
- `Assets/optimized/` - web-sized JPEG screenshots used by the page
- `Assets/*.png` - original full-size screenshots (not loaded by the page)

## How to run

From the project folder, run:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

To stop the server, press `Ctrl + C`.

## How to edit

- **Wiring**: any element with `data-node` becomes part of the network and is
  wired to the next `data-node` in the page. `data-ports="3"` sets how many
  connection points it has on its top and bottom edges; `data-ports="children"`
  gives each child its own port when they sit in one row.
- **Reading glow**: add `data-read` to a heading or paragraph to make its words
  light up as the signal passes.
- **Colours**: each section's `data-palette` picks a palette from `PALETTES` in
  `script.js`.
- **Adding a build**: copy an `<article class="build">` in `index.html`, add its
  screenshots to `Assets/optimized/`, and alternate `is-flip` so screenshots swap
  sides. Add it to `GRAPH_NODES` and `GRAPH_LINKS` in `script.js` so it appears in
  the weights graph.
- **Terminal commands** live in `respond()` in `script.js`.
- **Neural network**: layer sizes are set in `createNetwork([2, 10, 10, 1])`;
  starting datasets are in `PATTERNS`.

## Contact form

The site stays on GitHub Pages, which can only serve files. Sending email needs
a secret Resend API key, which must never be in the page, so a small Cloudflare
Worker in `contact-worker/` receives each message and sends it through Resend.

To deploy it (from the `contact-worker/` folder):

```bash
npx wrangler deploy
```

```bash
npx wrangler secret put RESEND_API_KEY
```

The first command prints the Worker's URL. Put that URL in the form's
`data-endpoint` attribute in `index.html`. Until then, pressing Send opens the
visitor's email app with the message filled in.

- Messages go to `RESEND_TO_EMAIL` and come from `RESEND_FROM_EMAIL` (both in
  `contact-worker/wrangler.jsonc`), with reply-to set to the visitor's email.
- The default sender, `onboarding@resend.dev`, can only deliver to the email that
  owns the Resend account. To send from your own address, verify a domain in Resend
  and update `RESEND_FROM_EMAIL`.
- Only the origins in `ALLOWED_ORIGINS` can use the Worker. A hidden honeypot field
  and a minimum fill time quietly drop most bots.

## Notes

- Visitors with reduced motion turned on get a still version: everything is
  visible, nothing pins or animates.
- The live preview only works for michaelpigneguy.com; thesoundsculptor.com.au
  blocks being embedded, so it shows screenshots instead.
