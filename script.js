/* Signal: the portfolio told as a neural network's forward pass.
   The reader's scroll position is the signal. Everything it passes lights up. */

const root = document.documentElement;
const live = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Keep the HTML readable if the animation script is blocked or unavailable.
root.classList.add("js", live ? "is-live" : "is-still");
const finePointer = window.matchMedia("(pointer: fine)").matches;

// Where the signal sits, as a fraction of the viewport height.
const PULSE = 0.62;
const TAU = Math.PI * 2;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (value, n) => ((value % n) + n) % n;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- Colour ---------- */

// Each layer of the story has its own light. The page blends between them.
const PALETTES = {
  intro: { bg: [5, 8, 20], a1: [75, 224, 255], a2: [124, 255, 176] },
  input: { bg: [5, 8, 20], a1: [75, 224, 255], a2: [124, 255, 176] },
  hidden: { bg: [11, 6, 26], a1: [176, 124, 255], a2: [255, 95, 210] },
  builds: { bg: [16, 8, 18], a1: [255, 176, 84], a2: [255, 107, 129] },
  weights: { bg: [6, 8, 30], a1: [143, 184, 255], a2: [214, 222, 255] },
  lab: { bg: [3, 17, 20], a1: [94, 234, 212], a2: [190, 255, 120] },
  output: { bg: [24, 7, 14], a1: [255, 150, 90], a2: [255, 95, 140] },
};

const mixColor = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const mixPalette = (p, q, t) => ({
  bg: mixColor(p.bg, q.bg, t),
  a1: mixColor(p.a1, q.a1, t),
  a2: mixColor(p.a2, q.a2, t),
});
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ---------- Perth time ---------- */

const perthFormat = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const perthTime = () => perthFormat.format(new Date()).replace(/\s+/g, " ").toLowerCase();

const updateClocks = () => {
  const now = perthTime();
  document.querySelectorAll("[data-perth-time]").forEach((el) => {
    el.textContent = now;
    el.setAttribute("datetime", new Date().toISOString());
  });
};

/* ---------- Pointer ---------- */

const pointer = { x: -9999, y: -9999, active: false };

window.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  },
  { passive: true }
);

document.addEventListener("mouseleave", () => {
  pointer.active = false;
});

/* ---------- Words ---------- */

// Wrap every word in a span so it can light up on its own. Elements like
// <time> count as a single word; the text inside other elements is split too.
const splitWords = (el) => {
  const words = [];
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) {
            return;
          }
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement("span");
          span.className = "w";
          span.textContent = part;
          fragment.appendChild(span);
          words.push(span);
        });
        child.replaceWith(fragment);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.matches("time")) {
          child.classList.add("w");
          words.push(child);
        } else {
          walk(child);
        }
      }
    });
  };
  walk(el);
  return words;
};

// Cached style writes, so idle frames touch nothing.
const styleCache = new WeakMap();
const writeStyle = (el, prop, value) => {
  if (!el) {
    return;
  }
  let cache = styleCache.get(el);
  if (!cache) {
    cache = {};
    styleCache.set(el, cache);
  }
  if (cache[prop] !== value) {
    el.style[prop] = value;
    cache[prop] = value;
  }
};

/* ---------- The field: dust, wires, and the signal itself ---------- */

const SEG = 28;

const makeEdge = (x1, y1, x2, y2, key) => {
  const pts = new Float32Array((SEG + 1) * 2);
  const dy = y2 - y1;
  const c1 = y1 + dy * 0.5;
  const c2 = y2 - dy * 0.5;
  for (let i = 0; i <= SEG; i += 1) {
    const t = i / SEG;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    pts[i * 2] = (a + b) * x1 + (c + d) * x2;
    pts[i * 2 + 1] = a * y1 + b * c1 + c * c2 + d * y2;
  }
  return { pts, y1, y2, key, seed: Math.random(), speed: 0.22 + Math.random() * 0.2 };
};

// Draw an edge's polyline up to a given document y. Returns the cut point if it stopped early.
const trace = (path, pts, uptoY, offset) => {
  path.moveTo(pts[0], pts[1] - offset);
  for (let i = 2; i < pts.length; i += 2) {
    const y = pts[i + 1];
    if (y > uptoY) {
      const px = pts[i - 2];
      const py = pts[i - 1];
      const k = (uptoY - py) / (y - py || 1);
      const x = px + (pts[i] - px) * k;
      path.lineTo(x, uptoY - offset);
      return [x, uptoY - offset];
    }
    path.lineTo(pts[i], y - offset);
  }
  return null;
};

const pointAt = (pts, t, offset) => {
  const f = t * SEG;
  const i = Math.min(SEG - 1, Math.floor(f));
  const k = f - i;
  return [
    lerp(pts[i * 2], pts[i * 2 + 2], k),
    lerp(pts[i * 2 + 1], pts[i * 2 + 3], k) - offset,
  ];
};

const createField = (canvas) => {
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let lastT = 0;

  const dust = Array.from({ length: window.innerWidth < 760 ? 90 : 190 }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.2 + Math.random() * 0.8,
    phase: Math.random() * TAU,
    sx: 0,
    sy: 0,
  }));

  const sprites = new Map();
  const sprite = (color) => {
    const key = color.join(",");
    if (!sprites.has(key)) {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.16, rgb(color, 0.95));
      grad.addColorStop(0.45, rgb(color, 0.28));
      grad.addColorStop(1, rgb(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      sprites.set(key, c);
    }
    return sprites.get(key);
  };

  // Sparks live in document space so they scroll with the page.
  const sparks = [];
  const burst = (x, y, color) => {
    for (let i = 0; i < 90; i += 1) {
      const angle = Math.random() * TAU;
      const speed = 60 + Math.random() * 320;
      sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.5 + Math.random() * 0.7,
        color,
      });
    }
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const reachFrom = (px, py, radius, strength) => {
    for (const d of dust) {
      const dist = Math.hypot(d.sx - px, d.sy - py);
      if (dist < radius) {
        ctx.globalAlpha = (1 - dist / radius) * strength;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(d.sx, d.sy);
        ctx.stroke();
      }
    }
  };

  const draw = ({ scrollY, pulseY, time, palette, edges, nodes, neuron, still }) => {
    const t = time / 1000;
    const dt = lastT ? clamp(t - lastT, 0, 0.05) : 0.016;
    lastT = t;
    const drift = still ? 0 : t;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    // Dust drifts at different depths, so scrolling feels like moving through space.
    ctx.fillStyle = rgb(palette.a1);
    for (const d of dust) {
      d.sx = d.x * width + Math.sin(drift * 0.15 + d.phase) * 10 * d.z;
      d.sy = mod(d.y * height * 1.3 - scrollY * d.z * 0.22 - drift * 5 * d.z, height * 1.3) - height * 0.15;
      const size = 0.6 + d.z * 1.3;
      ctx.globalAlpha = 0.1 + d.z * 0.28;
      ctx.fillRect(d.sx - size / 2, d.sy - size / 2, size, size);
    }

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rgb(palette.a1);
    if (pointer.active && finePointer) {
      reachFrom(pointer.x, pointer.y, 150, 0.3);
    }
    if (neuron) {
      reachFrom(neuron.x, neuron.y, neuron.reach, neuron.strength);
    }

    // The network: faint wires ahead of the signal, bright wires behind it.
    const viewTop = scrollY - 40;
    const viewBottom = scrollY + height + 40;
    const groups = new Map();
    for (const e of edges) {
      if (e.y2 < viewTop || e.y1 > viewBottom) {
        continue;
      }
      let g = groups.get(e.key);
      if (!g) {
        g = { base: new Path2D(), lit: new Path2D(), heads: [], packets: [] };
        groups.set(e.key, g);
      }
      trace(g.base, e.pts, Infinity, scrollY);
      if (pulseY > e.y1) {
        const head = trace(g.lit, e.pts, pulseY, scrollY);
        if (head) {
          g.heads.push(head);
        } else if (!still) {
          g.packets.push(pointAt(e.pts, mod(t * e.speed + e.seed, 1), scrollY));
        }
      }
    }

    groups.forEach((g, key) => {
      const pal = PALETTES[key];
      ctx.globalAlpha = 0.11;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb(pal.a1);
      ctx.stroke(g.base);
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = rgb(pal.a2);
      ctx.stroke(g.lit);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgb(pal.a1);
      ctx.stroke(g.lit);
      ctx.globalAlpha = 1;
      const head = sprite(pal.a1);
      g.heads.forEach(([x, y]) => ctx.drawImage(head, x - 18, y - 18, 36, 36));
      ctx.globalAlpha = 0.85;
      const packet = sprite(pal.a2);
      g.packets.forEach(([x, y]) => ctx.drawImage(packet, x - 7, y - 7, 14, 14));
    });

    // Ports on every node, and a ripple when the signal arrives.
    for (const n of nodes) {
      if (n.bottom < viewTop || n.top > viewBottom) {
        continue;
      }
      const pal = PALETTES[n.key];
      const glow = sprite(pal.a1);
      for (const [x, py] of n.ports) {
        const y = py - scrollY;
        if (pulseY >= py) {
          ctx.globalAlpha = 0.9;
          ctx.drawImage(glow, x - 9, y - 9, 18, 18);
        } else {
          ctx.globalAlpha = 0.4;
          ctx.strokeStyle = rgb(pal.a1);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, TAU);
          ctx.stroke();
        }
      }
      const since = (time - n.litAt) / 900;
      if (!still && n.lit && since >= 0 && since < 1) {
        ctx.globalAlpha = (1 - since) * 0.8;
        ctx.strokeStyle = rgb(pal.a2);
        ctx.lineWidth = 1.2;
        n.tops.forEach(([x, py]) => {
          ctx.beginPath();
          ctx.arc(x, py - scrollY, 4 + since * 30, 0, TAU);
          ctx.stroke();
        });
      }
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.96;
      s.vy = s.vy * 0.96 + 30 * dt;
      s.life -= s.decay * dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = s.life;
      const size = 4 + s.life * 10;
      ctx.drawImage(sprite(s.color), s.x - size / 2, s.y - scrollY - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  resize();
  window.addEventListener("resize", resize);

  return { draw, burst };
};

/* ---------- The story engine ---------- */

const LAYER_NAMES = ["Input", "Hidden", "Activations", "Weights", "Your turn", "Output"];

const setupStory = () => {
  const canvas = document.getElementById("field");
  const field = canvas ? createField(canvas) : null;
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const chapters = [...document.querySelectorAll("[data-palette]")].map((el) => ({
    el,
    key: el.dataset.palette,
    top: 0,
    isLayer: el.classList.contains("chapter"),
  }));
  const layers = chapters.filter((c) => c.isLayer);
  const reads = [...document.querySelectorAll("[data-read]")].map((el) => ({
    el,
    words: splitWords(el),
    top: 0,
    span: 1,
    state: "",
  }));
  const nodeEls = [...document.querySelectorAll("[data-node]")];
  const meterLinks = [...document.querySelectorAll("[data-meter]")];
  const meterIndex = document.querySelector("[data-meter-index]");
  const meterName = document.querySelector("[data-meter-name]");

  const litListeners = [];
  const stats = { distance: 0, activeMs: 0, maxLit: 0 };
  let vh = window.innerHeight;
  let maxScroll = 0;
  let nodes = [];
  let edges = [];

  const chapterAt = (y) => {
    let i = 0;
    while (i + 1 < chapters.length && chapters[i + 1].top <= y) {
      i += 1;
    }
    return i;
  };

  const BLEND = 280;
  const paletteAt = (y) => {
    let i = 0;
    while (i + 1 < chapters.length && chapters[i + 1].top - BLEND <= y) {
      i += 1;
    }
    const current = PALETTES[chapters[i].key];
    if (i > 0) {
      const t = smoothstep(chapters[i].top - BLEND, chapters[i].top + BLEND, y);
      if (t < 1) {
        return mixPalette(PALETTES[chapters[i - 1].key], current, t);
      }
    }
    return current;
  };

  const measure = () => {
    vh = window.innerHeight;
    const sy = window.scrollY;
    const narrow = window.innerWidth < 760;

    chapters.forEach((c) => {
      c.top = c.el.getBoundingClientRect().top + sy;
    });

    reads.forEach((r) => {
      const rect = r.el.getBoundingClientRect();
      r.top = rect.top + sy;
      r.span = Math.max(48, rect.height);
      r.state = "";
    });

    nodes = nodeEls
      .map((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) {
          return null;
        }
        const top = rect.top + sy;
        const bottom = rect.bottom + sy;
        const tops = [];
        const bottoms = [];
        const mode = el.dataset.ports || "1";

        // One port per child, when the children sit in a single row.
        if (mode === "children") {
          const kids = [...el.children].map((child) => child.getBoundingClientRect());
          const oneRow = kids.length > 1 && kids.every((k) => Math.abs(k.top - kids[0].top) < 6);
          if (oneRow) {
            kids.forEach((k) => {
              const x = k.left + k.width / 2;
              tops.push([x, k.top + sy]);
              bottoms.push([x, k.bottom + sy]);
            });
          }
        }

        if (!tops.length) {
          const wanted = mode === "children" ? 1 : parseInt(mode, 10) || 1;
          const count = narrow ? Math.min(wanted, 3) : wanted;
          for (let i = 0; i < count; i += 1) {
            const x =
              count === 1
                ? rect.left + rect.width / 2
                : rect.left + rect.width * (0.16 + (0.68 * i) / (count - 1));
            tops.push([x, top]);
            bottoms.push([x, bottom]);
          }
        }

        return {
          el,
          top,
          bottom,
          tops,
          bottoms,
          ports: tops.concat(bottoms),
          key: chapters[chapterAt(top)].key,
          lit: el.classList.contains("is-lit"),
          litAt: -1e6,
        };
      })
      .filter(Boolean);

    // Every node is wired to the next one, port to port, like layers of a network.
    edges = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      a.bottoms.forEach(([x1, y1]) => {
        b.tops.forEach(([x2, y2]) => {
          if (y2 > y1 + 4) {
            edges.push(makeEdge(x1, y1, x2, y2, b.key));
          }
        });
      });
    }

    maxScroll = Math.max(0, root.scrollHeight - vh);
  };

  let appliedPalette = "";
  const applyPalette = (p) => {
    const key = `${p.bg}|${p.a1}|${p.a2}`;
    if (key === appliedPalette) {
      return;
    }
    appliedPalette = key;
    root.style.setProperty("--bg", p.bg.join(" "));
    root.style.setProperty("--a1", p.a1.join(" "));
    root.style.setProperty("--a2", p.a2.join(" "));
    if (themeMeta) {
      themeMeta.setAttribute("content", `rgb(${p.bg.join(",")})`);
    }
  };

  let meterState = null;
  const updateMeter = (pulseY) => {
    let index = -1;
    layers.forEach((c, i) => {
      if (c.top <= pulseY) {
        index = i;
      }
    });
    if (index === meterState) {
      return;
    }
    meterState = index;
    meterLinks.forEach((link, i) => {
      link.classList.toggle("is-current", i === index);
      link.classList.toggle("is-passed", i < index);
      if (i === index) {
        link.setAttribute("aria-current", "step");
      } else {
        link.removeAttribute("aria-current");
      }
    });
    if (meterIndex) {
      meterIndex.textContent = index < 0 ? "··" : `L${index}`;
    }
    if (meterName) {
      meterName.textContent = index < 0 ? "Incoming signal" : LAYER_NAMES[index];
    }
  };

  // Light every node, word, and wire the signal has reached.
  const update = (y, now) => {
    // Near the end of the page the signal slides down to the bottom edge,
    // so the last nodes light up even though the page can't scroll further.
    const ending = smoothstep(maxScroll - vh * 0.6, maxScroll, y);
    const pulseY = y + vh * lerp(PULSE, 0.98, ending);

    for (const n of nodes) {
      const lit = pulseY >= n.top + 10;
      if (lit !== n.lit) {
        n.lit = lit;
        n.el.classList.toggle("is-lit", lit);
        if (lit) {
          n.litAt = now;
          litListeners.forEach((fn) => fn(n.el, n));
        }
      }
    }

    for (const r of reads) {
      if (pulseY < r.top) {
        if (r.state !== "none") {
          r.words.forEach((w) => w.classList.remove("is-lit"));
          r.state = "none";
        }
      } else if (pulseY >= r.top + r.span) {
        if (r.state !== "all") {
          r.words.forEach((w) => w.classList.add("is-lit"));
          r.state = "all";
        }
      } else {
        r.state = "partial";
        const lit = Math.ceil(((pulseY - r.top) / r.span) * r.words.length);
        r.words.forEach((w, i) => w.classList.toggle("is-lit", i < lit));
      }
    }

    let litCount = 0;
    for (const e of edges) {
      if (e.y2 <= pulseY) {
        litCount += 1;
      }
    }
    stats.maxLit = Math.max(stats.maxLit, litCount);

    applyPalette(paletteAt(pulseY));
    updateMeter(pulseY);
    return pulseY;
  };

  /* ----- Travel between places ----- */

  let anim = null;
  const animateTo = (target, duration) => {
    const start = window.scrollY;
    const end = clamp(target, 0, maxScroll);
    const distance = end - start;
    if (Math.abs(distance) < 2) {
      return;
    }
    if (!live) {
      window.scrollTo(0, end);
      return;
    }
    const time = duration || clamp(700 + Math.abs(distance) * 0.09, 700, 2600);
    const token = {};
    anim = token;
    const begin = performance.now();
    const tick = (now) => {
      if (anim !== token) {
        return;
      }
      const k = clamp((now - begin) / time);
      window.scrollTo(0, start + distance * easeInOutCubic(k));
      if (k < 1) {
        window.requestAnimationFrame(tick);
      } else {
        anim = null;
      }
    };
    window.requestAnimationFrame(tick);
  };

  ["wheel", "touchstart", "keydown"].forEach((type) => {
    window.addEventListener(type, () => (anim = null), { passive: true });
  });

  // Where each destination sits: just past the signal line, so it arrives lit.
  const targetFor = (el) => {
    if (!el) {
      return null;
    }
    if (el.id === "top" || el.closest(".intro")) {
      return 0;
    }
    const chapter = el.closest(".chapter");
    if (!chapter) {
      return null;
    }
    const sy = window.scrollY;
    if (chapter.id === "output") {
      const node = chapter.querySelector(".output-node");
      return node.getBoundingClientRect().top + sy - vh * 0.24;
    }
    const tag = chapter.querySelector(".layer-tag");
    return tag.getBoundingClientRect().top + sy - vh * 0.18;
  };

  const goTo = (el) => {
    const target = targetFor(el);
    if (target !== null) {
      animateTo(target);
    }
  };

  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!link) {
      return;
    }
    const id = decodeURIComponent(link.getAttribute("href").slice(1));
    const el = id ? document.getElementById(id) : null;
    const target = targetFor(el);
    if (target === null) {
      return;
    }
    event.preventDefault();
    animateTo(target);
    if (link.classList.contains("skip-link")) {
      const heading = document.getElementById("output-title");
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  });

  const jumpToHash = () => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const target = targetFor(id ? document.getElementById(id) : null);
    if (target !== null && target > 0) {
      window.scrollTo(0, clamp(target, 0, maxScroll));
    }
  };

  return {
    field,
    stats,
    measure,
    update,
    paletteAt,
    animateTo,
    goTo,
    jumpToHash,
    onLit: (fn) => litListeners.push(fn),
    get anim() {
      return anim;
    },
    get vh() {
      return vh;
    },
    get nodes() {
      return nodes;
    },
    get edges() {
      return edges;
    },
  };
};

/* ---------- The cold open ---------- */

const setupIntro = () => {
  const intro = document.querySelector(".intro");
  if (!intro) {
    return null;
  }
  const beats = [...intro.querySelectorAll("[data-beat]")].map((el) => ({
    el,
    words: el.classList.contains("beat-name") ? [] : splitWords(el),
    shown: -1,
  }));
  const neuron = intro.querySelector(".neuron");
  const cue = intro.querySelector(".intro-cue");
  const start = performance.now();
  let top = 0;
  let range = 1;

  const measure = () => {
    top = intro.getBoundingClientRect().top + window.scrollY;
    range = Math.max(1, intro.offsetHeight - window.innerHeight);
  };

  const show = (beat, amount) => {
    const count = Math.round(clamp(amount) * beat.words.length);
    if (count === beat.shown) {
      return;
    }
    beat.shown = count;
    beat.words.forEach((w, i) => w.classList.toggle("is-on", i < count));
  };

  const place = (el, opacity, shift) => {
    writeStyle(el, "opacity", opacity.toFixed(3));
    writeStyle(el, "transform", shift ? `translate3d(0, ${shift.toFixed(1)}px, 0)` : "none");
  };

  if (!live) {
    beats.forEach((beat) => show(beat, 1));
  }

  // Three beats replace each other while the stage is pinned, then the neuron fires.
  const update = (y, now) => {
    if (!live) {
      return 1;
    }
    const p = clamp((y - top) / range);
    const opening = clamp((now - start - 350) / 1100);
    show(beats[0], opening);
    const out0 = smoothstep(0.2, 0.28, p);
    place(beats[0].el, 1 - out0, -out0 * 40);
    show(beats[1], smoothstep(0.28, 0.4, p));
    const out1 = smoothstep(0.55, 0.62, p);
    place(beats[1].el, 1 - out1, -out1 * 40);
    show(beats[2], smoothstep(0.62, 0.74, p));
    neuron.style.setProperty("--charge", p.toFixed(3));
    neuron.style.setProperty("--axon", smoothstep(0.8, 1, p).toFixed(3));
    writeStyle(cue, "opacity", (smoothstep(0.7, 1, opening) * (1 - smoothstep(0.01, 0.07, p))).toFixed(3));
    return p;
  };

  const holds = () => [
    [top, top + range * 0.2],
    [top + range * 0.4, top + range * 0.55],
    [top + range * 0.74, top + range],
  ];

  const neuronPoint = () => {
    const rect = neuron.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  return {
    measure,
    update,
    holds,
    neuronPoint,
    get end() {
      return top + range + window.innerHeight;
    },
  };
};

/* ---------- Layer 0: the terminal ---------- */

const EMAIL = "riley.pigneguy@gmail.com";

const respond = (cmd) => {
  const out = (...items) => ({
    lines: items.map((item) => (typeof item === "string" ? { text: item } : item)),
  });
  switch (cmd) {
    case "help":
    case "?":
      return out(
        { text: "commands:", cls: "term-dim" },
        "  whoami      who is sending this signal",
        "  now         what I'm working on",
        "  ls builds   everything I've shipped",
        "  experience  internships, past and pending",
        "  stack       the tools I reach for",
        "  contact     how to reach me",
        "  time        the time in Perth",
        "  clear       wipe the screen"
      );
    case "whoami":
      return out(
        "Riley Pigneguy",
        "Bachelor of Advanced Computer Science (Honours) · UWA",
        "Major: Artificial Intelligence · Year 3, Semester 2",
        "Based in Perth, Western Australia"
      );
    case "now":
      return out(
        "Semester 2, 2026:",
        "→ shipped The Sound Sculptor and Michael Pignéguy (both live)",
        "→ Networth Tracker is in private beta",
        "→ UWA CMCA internship: pending",
        { text: "Semester 1: ICT intern at Uplyft (Winter 2026).", cls: "term-dim" }
      );
    case "ls":
    case "ls builds":
    case "builds":
    case "projects":
      return out(
        "sound-sculptor/     live      2026",
        "michael-pigneguy/   live      2026",
        "networth-tracker/   beta      now",
        "graph.fm/           github    2025",
        "grade-tracker/      github    2025",
        "oddscreener-bot/    private   2024–25"
      );
    case "experience":
    case "exp":
    case "work":
    case "internships":
      return out(
        "ICT Intern – Systems, Data and Infrastructure",
        { text: "Uplyft · Winter 2026", cls: "term-dim" },
        "→ automated ICT workflows: Power Automate, Forms, SharePoint",
        "→ security review: Essential Eight, NIST CSF 2.0, ISO 27001, SMB1001",
        "→ physical access audits across WA sites",
        "→ staff security training and Microsoft 365 guides",
        "",
        "Custom internship · UWA CMCA",
        { text: "Semester 2, 2026 · pending", cls: "term-dim" }
      );
    case "stack":
      return out(
        "languages   python · javascript · java · c",
        "frontend    next.js · react · vite · html + css",
        "backend     flask · streamlit · postgresql · sqlite",
        "shipping    vercel · cloudflare · stripe · resend · neon",
        "workplace   power automate · microsoft forms · sharepoint · m365"
      );
    case "contact":
      return out(
        `email    ${EMAIL}`,
        "github   github.com/rileypigneguy",
        { text: "or keep scrolling: the output layer is waiting for you", cls: "term-dim" }
      );
    case "time":
    case "date":
      return out(`It's ${perthTime()} in Perth (AWST).`);
    case "sudo hire riley":
      return {
        lines: [
          { text: "[sudo] password for recruiter: ••••••••" },
          { text: "access granted. routing you to the output layer…", cls: "term-accent" },
        ],
        after: "output",
      };
    case "hire":
    case "hire riley":
      return out({ text: "permission denied. (try: sudo hire riley)", cls: "term-dim" });
    case "exit":
    case "quit":
      return out({ text: "there's no exit. only forward ↓", cls: "term-dim" });
    default:
      return out({ text: `command not found: ${cmd}. try 'help'.`, cls: "term-dim" });
  }
};

const setupTerminal = (el, story) => {
  if (!el) {
    return null;
  }
  const log = el.querySelector(".terminal-log");
  const form = el.querySelector(".terminal-form");
  const input = el.querySelector(".terminal-input");
  const history = [];
  let historyIndex = 0;
  let queue = Promise.resolve();
  let started = false;

  const addLine = (text, cls = "") => {
    const line = document.createElement("p");
    line.className = `term-line ${cls}`.trim();
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > 140) {
      log.firstChild.remove();
    }
    log.scrollTop = log.scrollHeight;
    return line;
  };

  const typeLine = ({ text, cls = "" }) =>
    new Promise((resolve) => {
      if (!live) {
        addLine(text, cls);
        resolve();
        return;
      }
      const line = addLine("", `${cls} term-cursor`);
      const step = Math.max(1, Math.ceil(text.length / 22));
      let i = 0;
      const tick = () => {
        i = Math.min(text.length, i + step);
        line.textContent = text.slice(0, i);
        log.scrollTop = log.scrollHeight;
        if (i < text.length) {
          window.setTimeout(tick, 16);
        } else {
          line.classList.remove("term-cursor");
          resolve();
        }
      };
      tick();
    });

  const run = (raw) => {
    const cmd = raw.trim().replace(/\s+/g, " ");
    queue = queue.then(async () => {
      const echo = addLine("", "term-cmd");
      const prompt = document.createElement("span");
      prompt.className = "term-prompt";
      prompt.textContent = "riley@perth:~$";
      echo.append(prompt, ` ${cmd}`);
      if (!cmd) {
        return;
      }
      if (cmd.toLowerCase() === "clear") {
        log.textContent = "";
        return;
      }
      const result = respond(cmd.toLowerCase());
      for (const line of result.lines) {
        await typeLine(line);
      }
      if (result.after === "output") {
        window.setTimeout(() => story.goTo(document.getElementById("output")), 600);
      }
    });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    if (value.trim()) {
      history.push(value.trim());
      historyIndex = history.length;
    }
    run(value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" && history.length) {
      event.preventDefault();
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
    } else if (event.key === "ArrowDown" && history.length) {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || "";
    }
  });

  el.querySelectorAll("[data-cmd]").forEach((chip) => {
    chip.addEventListener("click", () => run(chip.dataset.cmd));
  });

  // The first time the signal reaches the terminal, it answers on its own.
  story.onLit((node) => {
    if (node === el && !started && live) {
      started = true;
      log.textContent = "";
      run("whoami");
    }
  });

  return { run };
};

/* ---------- Layer 2: screenshots and the live preview ---------- */

const setupBuilds = () => {
  document.querySelectorAll("[data-carousel]").forEach((frame) => {
    const slides = [...frame.querySelectorAll(".slide")];
    const dots = [...frame.querySelectorAll(".slide-dot")];
    const screen = frame.querySelector(".frame-screen");
    const column = frame.parentElement;
    let index = 0;
    let timer = null;
    let held = false;

    const ratioOf = (img) => {
      const w = img.naturalWidth || Number(img.getAttribute("width"));
      const h = img.naturalHeight || Number(img.getAttribute("height"));
      return w && h ? w / h : 1600 / 872;
    };

    // Each window keeps one height and changes its width to match the screenshot
    // on show, so every screenshot fills it exactly: nothing cropped, no bars.
    const fit = () => {
      const available = column.clientWidth;
      if (!available || !slides.length) {
        return;
      }
      // The frame's own side borders sit outside the screenshot, so leave room for them.
      const borders = frame.offsetWidth - frame.clientWidth;
      const widest = Math.max(...slides.map(ratioOf));
      const cap = Math.min(window.innerHeight * 0.62, frame.classList.contains("is-portrait") ? 470 : 560);
      const height = Math.min((available - borders) / widest, cap);
      screen.style.height = `${height.toFixed(2)}px`;
      frame.style.width = `${(height * ratioOf(slides[index]) + borders).toFixed(2)}px`;
    };

    slides.forEach((img) => img.addEventListener("load", fit));
    new ResizeObserver(fit).observe(column);
    fit();

    if (slides.length < 2) {
      return;
    }

    const show = (next) => {
      index = next;
      slides.forEach((slide, i) => slide.classList.toggle("is-active", i === next));
      dots.forEach((dot, i) => dot.classList.toggle("is-active", i === next));
      fit();
    };
    const play = () => {
      if (!live || timer || held) {
        return;
      }
      timer = window.setInterval(() => {
        // Hold still while someone is browsing the live preview.
        if (!frame.querySelector(".live-frame")) {
          show((index + 1) % slides.length);
        }
      }, 2600);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = null;
    };

    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => {
        held = true;
        stop();
        show(i);
      });
    });

    new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          play();
        } else {
          stop();
          held = false;
        }
      },
      { threshold: 0.55 }
    ).observe(screen);
  });

  // A real, scrollable copy of the live site inside the frame.
  document.querySelectorAll("[data-live-preview]").forEach((button) => {
    const screen = button.closest(".build").querySelector(".frame-screen");
    let holder = null;

    const fit = () => {
      if (!holder) {
        return;
      }
      const iframe = holder.querySelector("iframe");
      const scale = screen.clientWidth / 1280;
      iframe.style.transform = `scale(${scale})`;
      iframe.style.height = `${screen.clientHeight / scale}px`;
    };

    const close = () => {
      if (holder) {
        holder.remove();
        holder = null;
      }
      button.setAttribute("aria-expanded", "false");
    };

    const open = () => {
      holder = document.createElement("div");
      holder.className = "live-frame";
      const iframe = document.createElement("iframe");
      iframe.src = button.dataset.livePreview;
      iframe.title = "Live preview of michaelpigneguy.com";
      iframe.referrerPolicy = "no-referrer";
      const shut = document.createElement("button");
      shut.type = "button";
      shut.className = "live-close";
      shut.textContent = "Close live preview ✕";
      shut.addEventListener("click", () => {
        close();
        button.focus();
      });
      holder.append(iframe, shut);
      screen.appendChild(holder);
      fit();
      button.setAttribute("aria-expanded", "true");
      shut.focus({ preventScroll: true });
    };

    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => (holder ? close() : open()));
    window.addEventListener("resize", fit);
  });
};

/* ---------- Layer 3: the weights graph ---------- */

const GRAPH_NODES = [
  ["riley", "Riley", "hub"],
  ["uwa", "UWA", "context", "learned at UWA"],
  ["uplyft", "Uplyft internship", "context", "used in the Uplyft internship"],
  ["cmca", "CMCA (pending)", "context", "planned for the CMCA internship"],
  ["sound", "The Sound Sculptor", "build"],
  ["michael", "Michael Pignéguy", "build"],
  ["networth", "Networth Tracker", "build"],
  ["graphfm", "Graph.fm", "build"],
  ["bot", "Oddscreener Bot", "build"],
  ["grades", "Grade Tracker", "build"],
  ["python", "Python", "tool"],
  ["nextjs", "Next.js", "tool"],
  ["react", "React", "tool"],
  ["javascript", "JavaScript", "tool"],
  ["html", "HTML", "tool"],
  ["css", "CSS", "tool"],
  ["streamlit", "Streamlit", "tool"],
  ["flask", "Flask", "tool"],
  ["postgres", "PostgreSQL", "tool"],
  ["sqlite", "SQLite", "tool"],
  ["github", "GitHub", "tool"],
  ["neon", "Neon DB", "tool"],
  ["vercel", "Vercel", "tool"],
  ["cloudflare", "Cloudflare", "tool"],
  ["vite", "Vite", "tool"],
  ["stripe", "Stripe", "tool"],
  ["replit", "Replit", "tool"],
  ["resend", "Resend", "tool"],
  ["lastfm", "Last.fm API", "tool"],
  ["sports", "Sports API", "tool"],
  ["discord", "Discord API", "tool"],
  ["massive", "Massive API", "tool"],
  ["gitbook", "GitBook", "tool"],
  ["java", "Java", "tool"],
  ["c", "C", "tool"],
  ["powerautomate", "Power Automate", "tool"],
  ["msforms", "Microsoft Forms", "tool"],
  ["sharepoint", "SharePoint", "tool"],
  ["m365", "Microsoft 365", "tool"],
];

const GRAPH_LINKS = [
  ["riley", "uwa"],
  ["riley", "uplyft"],
  ["riley", "cmca"],
  ["riley", "sound"],
  ["riley", "michael"],
  ["riley", "networth"],
  ["riley", "graphfm"],
  ["riley", "bot"],
  ["riley", "grades"],
  ["riley", "github"],
  ["riley", "neon"],
  ["riley", "replit"],
  ["sound", "stripe"],
  ["sound", "cloudflare"],
  ["michael", "vite"],
  ["michael", "vercel"],
  ["michael", "resend"],
  ["networth", "nextjs"],
  ["networth", "react"],
  ["networth", "postgres"],
  ["networth", "massive"],
  ["graphfm", "python"],
  ["graphfm", "streamlit"],
  ["graphfm", "lastfm"],
  ["bot", "python"],
  ["bot", "sports"],
  ["bot", "discord"],
  ["grades", "html"],
  ["grades", "css"],
  ["grades", "javascript"],
  ["grades", "flask"],
  ["grades", "sqlite"],
  ["uwa", "grades"],
  ["uwa", "java"],
  ["uwa", "c"],
  ["cmca", "gitbook"],
  ["uplyft", "powerautomate"],
  ["uplyft", "msforms"],
  ["uplyft", "sharepoint"],
  ["uplyft", "m365"],
];

const setupGraph = (panel, story) => {
  const svg = panel && panel.querySelector(".graph");
  if (!svg) {
    return;
  }
  const caption = panel.querySelector(".graph-caption");
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };
  const RADIUS = { hub: 20, build: 11, context: 8, tool: 4.5 };
  const DEFAULT_CAPTION = "Everything connects back to one person.";

  const nodes = GRAPH_NODES.map(([id, label, type, phrase]) => ({
    id,
    label,
    type,
    phrase,
    r: RADIUS[type],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    dx: 0,
    dy: 0,
    fixed: false,
    phase: Math.random() * TAU,
    links: [],
    fullCr: RADIUS[type] + (type === "tool" ? 12 + label.length * 3 : type === "hub" ? 34 : 20 + label.length * 3.2),
    cr: 0,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = GRAPH_LINKS.map(([a, b]) => ({ source: byId.get(a), target: byId.get(b) }));
  links.forEach((l) => {
    l.source.links.push(l);
    l.target.links.push(l);
  });
  const neighbours = (n) => n.links.map((l) => (l.source === n ? l.target : l.source));

  const describe = (n) => {
    const others = neighbours(n);
    if (n.type === "hub") {
      const tools = nodes.filter((m) => m.type === "tool").length;
      return `Riley: six builds, ${tools} tools, one network.`;
    }
    if (n.type === "build") {
      return `${n.label} ← ${others.filter((o) => o.type === "tool").map((o) => o.label).join(", ")}`;
    }
    if (n.type === "context") {
      return `${n.label} → ${others.filter((o) => o.type !== "hub").map((o) => o.label).join(", ")}`;
    }
    const builds = others.filter((o) => o.type === "build").map((o) => o.label);
    const contexts = others.filter((o) => o.type === "context").map((o) => o.phrase);
    const parts = [];
    if (builds.length) {
      parts.push(`used in ${builds.join(" and ")}`);
    }
    parts.push(...contexts);
    return `${n.label} → ${parts.length ? parts.join(", ") : "part of the everyday toolkit"}`;
  };

  const gLinks = make("g");
  const gNodes = make("g");
  links.forEach((l) => {
    l.el = make("line", { class: "g-link" });
    gLinks.appendChild(l.el);
  });
  nodes.forEach((n) => {
    n.el = make("g", {
      class: `g-node is-${n.type}`,
      tabindex: "0",
      role: "button",
      "aria-label": describe(n),
    });
    n.circle = make("circle", { r: n.r });
    n.text = make("text", { y: n.type === "hub" ? n.r + 20 : 4 });
    n.text.textContent = n.label;
    n.el.append(n.circle, n.text);
    gNodes.appendChild(n.el);
  });
  svg.append(gLinks, gNodes);

  let W = 0;
  let H = 0;
  const size = () => {
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h) {
      return false;
    }
    if (W && H) {
      nodes.forEach((n) => {
        n.x *= w / W;
        n.y *= h / H;
        if (n.tx !== undefined) {
          n.tx *= w / W;
          n.ty *= h / H;
        }
      });
    }
    W = w;
    H = h;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const compact = W < 600;
    svg.classList.toggle("is-compact", compact);
    nodes.forEach((n) => {
      n.cr = n.type === "tool" && compact ? n.r + 12 : n.fullCr;
    });
    if (ready) {
      anchor();
    }
    return true;
  };

  // Builds and contexts sit on a ring around the hub, ordered so neighbours share tools.
  const RING = ["graphfm", "bot", "uplyft", "cmca", "uwa", "grades", "networth", "sound", "michael"];
  const anchor = () => {
    const hub = byId.get("riley");
    hub.ax = W / 2;
    hub.ay = H / 2;
    RING.forEach((id, i) => {
      const n = byId.get(id);
      const angle = (i / RING.length) * TAU - Math.PI / 2 + 0.35;
      const compact = W < 600;
      n.ax = W / 2 + Math.cos(angle) * W * (compact ? 0.3 : 0.34);
      n.ay = H / 2 + Math.sin(angle) * H * (compact ? 0.36 : 0.27);
    });
  };

  const scatter = () => {
    anchor();
    nodes.forEach((n) => {
      n.x = W * (0.1 + Math.random() * 0.8);
      n.y = H * (0.1 + Math.random() * 0.8);
      n.vx = 0;
      n.vy = 0;
    });
  };

  const REST = {
    "build-hub": 0.3,
    "hub-tool": 0.12,
    "context-hub": 0.3,
    "build-tool": 0.16,
    "context-tool": 0.15,
    "build-context": 0.22,
  };

  const tick = (alpha) => {
    const S = Math.min(W, H);
    const charge = W * H * 0.008;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        let f = (charge / d2) * alpha;
        const min = a.cr + b.cr;
        if (d < min) {
          f += (min - d) * 0.25;
        }
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    for (const l of links) {
      const a = l.source;
      const b = l.target;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = (REST[[a.type, b.type].sort().join("-")] || 0.2) * S;
      const f = (d - rest) * 0.05 * alpha;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (const n of nodes) {
      if (n.ax !== undefined) {
        n.vx += (n.ax - n.x) * 0.09 * alpha;
        n.vy += (n.ay - n.y) * 0.09 * alpha;
      }
      if (assembling && n.tx !== undefined) {
        n.vx += (n.tx - n.x) * 0.06;
        n.vy += (n.ty - n.y) * 0.06;
      }
      n.vx += (W / 2 - n.x) * 0.0015 * alpha;
      n.vy += (H / 2 - n.y) * 0.004 * alpha;
      if (n.fixed) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= 0.8;
      n.vy *= 0.8;
      n.x = clamp(n.x + n.vx, n.r + 14, W - n.r - 14);
      n.y = clamp(n.y + n.vy, n.r + 14, H - n.r - 34);
    }
  };

  // Labels sit on whichever side has room.
  const placeLabels = () => {
    nodes.forEach((n) => {
      if (n.type === "hub") {
        n.text.setAttribute("text-anchor", "middle");
        n.text.setAttribute("x", "0");
        return;
      }
      const right = n.x > W * 0.56;
      n.text.setAttribute("text-anchor", right ? "end" : "start");
      n.text.setAttribute("x", String(right ? -(n.r + 7) : n.r + 7));
    });
  };

  const render = (t) => {
    const wobble = live ? 1.8 : 0;
    nodes.forEach((n) => {
      n.dx = n.x + Math.sin(t * 0.0009 + n.phase) * wobble;
      n.dy = n.y + Math.cos(t * 0.0011 + n.phase) * wobble;
      n.el.setAttribute("transform", `translate(${n.dx.toFixed(1)} ${n.dy.toFixed(1)})`);
    });
    links.forEach((l) => {
      l.el.setAttribute("x1", l.source.dx.toFixed(1));
      l.el.setAttribute("y1", l.source.dy.toFixed(1));
      l.el.setAttribute("x2", l.target.dx.toFixed(1));
      l.el.setAttribute("y2", l.target.dy.toFixed(1));
    });
  };

  const settle = (steps) => {
    for (let i = 0; i < steps; i += 1) {
      tick(1 - (i / steps) * 0.85);
    }
    // Remember the settled layout so later assemblies always land on it.
    nodes.forEach((n) => {
      n.tx = n.x;
      n.ty = n.y;
    });
    placeLabels();
  };

  let ready = false;
  let assembling = false;
  const layout = () => {
    if (!size()) {
      return;
    }
    if (!ready) {
      scatter();
      settle(420);
      ready = true;
    }
    render(performance.now());
  };

  let traced = null;
  let dragging = null;
  const traceNode = (n) => {
    traced = n;
    svg.classList.toggle("is-tracing", Boolean(n));
    const near = new Set(n ? [n, ...neighbours(n)] : []);
    nodes.forEach((m) => m.el.classList.toggle("is-hot", near.has(m)));
    links.forEach((l) => l.el.classList.toggle("is-hot", Boolean(n) && (l.source === n || l.target === n)));
    caption.textContent = n ? describe(n) : DEFAULT_CAPTION;
  };

  let alpha = 0;
  let visible = false;
  let running = false;
  const loop = (t) => {
    if (!visible) {
      running = false;
      return;
    }
    if (alpha > 0.01) {
      tick(alpha);
      tick(alpha);
      alpha *= 0.975;
      if (alpha <= 0.01) {
        assembling = false;
        placeLabels();
      }
    }
    render(t);
    window.requestAnimationFrame(loop);
  };
  const wake = () => {
    if (!running && visible && ready) {
      running = true;
      window.requestAnimationFrame(loop);
    }
  };

  nodes.forEach((n) => {
    n.el.addEventListener("pointerenter", () => traceNode(n));
    n.el.addEventListener("pointerleave", () => {
      if (!dragging) {
        traceNode(null);
      }
    });
    n.el.addEventListener("focus", () => traceNode(n));
    n.el.addEventListener("blur", () => traceNode(null));
    n.el.addEventListener("click", () => traceNode(n));
    n.el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        traceNode(traced === n ? null : n);
      }
    });
  });

  // Drag nodes around; the rest of the network follows.
  if (finePointer) {
    const toSvg = (event) => {
      const rect = svg.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * W,
        y: ((event.clientY - rect.top) / rect.height) * H,
      };
    };
    nodes.forEach((n) => {
      n.el.addEventListener("pointerdown", (event) => {
        dragging = n;
        n.fixed = true;
        n.el.setPointerCapture(event.pointerId);
        alpha = Math.max(alpha, 0.5);
        wake();
      });
    });
    svg.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      const p = toSvg(event);
      dragging.x = clamp(p.x, dragging.r + 14, W - dragging.r - 14);
      dragging.y = clamp(p.y, dragging.r + 14, H - dragging.r - 34);
      alpha = Math.max(alpha, 0.3);
    });
    const drop = () => {
      if (!dragging) {
        return;
      }
      dragging.fixed = false;
      dragging = null;
      placeLabels();
    };
    svg.addEventListener("pointerup", drop);
    svg.addEventListener("pointercancel", drop);
  }

  // When the signal first reaches the graph, it assembles itself from scratch.
  let assembled = false;
  story.onLit((node) => {
    if (node === panel && !assembled && live && ready) {
      assembled = true;
      scatter();
      assembling = true;
      alpha = 1;
      wake();
    }
  });

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        layout();
        wake();
      }
    },
    { rootMargin: "120px" }
  ).observe(svg);

  new ResizeObserver(() => {
    if (ready && size()) {
      placeLabels();
      render(performance.now());
    }
  }).observe(svg);

  layout();
};

/* ---------- Layer 4: a tiny neural network ---------- */

// A plain multilayer perceptron: tanh hidden layers, a sigmoid output,
// binary cross-entropy, and the Adam optimiser. No libraries.
const createNetwork = (sizes) => {
  const layers = [];
  for (let l = 1; l < sizes.length; l += 1) {
    const nIn = sizes[l - 1];
    const nOut = sizes[l];
    const n = nIn * nOut;
    layers.push({
      nIn,
      nOut,
      w: new Float64Array(n),
      b: new Float64Array(nOut),
      gw: new Float64Array(n),
      gb: new Float64Array(nOut),
      mw: new Float64Array(n),
      vw: new Float64Array(n),
      mb: new Float64Array(nOut),
      vb: new Float64Array(nOut),
      out: new Float64Array(nOut),
      delta: new Float64Array(nOut),
    });
  }
  const input = new Float64Array(2);
  let step = 0;

  const reset = () => {
    step = 0;
    layers.forEach((L) => {
      const scale = Math.sqrt(2 / (L.nIn + L.nOut)) * 1.5;
      for (let i = 0; i < L.w.length; i += 1) {
        L.w[i] = (Math.random() * 2 - 1) * scale;
      }
      [L.b, L.mw, L.vw, L.mb, L.vb].forEach((a) => a.fill(0));
    });
  };

  const predict = (x, y) => {
    input[0] = x;
    input[1] = y;
    let prev = input;
    for (let l = 0; l < layers.length; l += 1) {
      const L = layers[l];
      const last = l === layers.length - 1;
      for (let o = 0; o < L.nOut; o += 1) {
        let z = L.b[o];
        const row = o * L.nIn;
        for (let i = 0; i < L.nIn; i += 1) {
          z += L.w[row + i] * prev[i];
        }
        L.out[o] = last ? 1 / (1 + Math.exp(-z)) : Math.tanh(z);
      }
      prev = L.out;
    }
    return layers[layers.length - 1].out[0];
  };

  const adam = (param, grad, m, v, n, lr, c1, c2) => {
    for (let i = 0; i < param.length; i += 1) {
      const g = grad[i] / n;
      m[i] = 0.9 * m[i] + 0.1 * g;
      v[i] = 0.999 * v[i] + 0.001 * g * g;
      param[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + 1e-8);
    }
  };

  const train = (points, lr = 0.03) => {
    if (!points.length) {
      return { loss: 0, acc: 0 };
    }
    layers.forEach((L) => {
      L.gw.fill(0);
      L.gb.fill(0);
    });
    let loss = 0;
    let correct = 0;
    for (const p of points) {
      const out = predict(p.x, p.y);
      loss -= p.c ? Math.log(out + 1e-9) : Math.log(1 - out + 1e-9);
      if ((out > 0.5 ? 1 : 0) === p.c) {
        correct += 1;
      }
      // Backpropagate this point's error through every layer.
      for (let l = layers.length - 1; l >= 0; l -= 1) {
        const L = layers[l];
        const prev = l === 0 ? input : layers[l - 1].out;
        if (l === layers.length - 1) {
          L.delta[0] = out - p.c;
        } else {
          const N = layers[l + 1];
          for (let o = 0; o < L.nOut; o += 1) {
            let s = 0;
            for (let k = 0; k < N.nOut; k += 1) {
              s += N.w[k * N.nIn + o] * N.delta[k];
            }
            L.delta[o] = s * (1 - L.out[o] * L.out[o]);
          }
        }
        for (let o = 0; o < L.nOut; o += 1) {
          L.gb[o] += L.delta[o];
          const row = o * L.nIn;
          for (let i = 0; i < L.nIn; i += 1) {
            L.gw[row + i] += L.delta[o] * prev[i];
          }
        }
      }
    }
    step += 1;
    const c1 = 1 - Math.pow(0.9, step);
    const c2 = 1 - Math.pow(0.999, step);
    layers.forEach((L) => {
      adam(L.w, L.gw, L.mw, L.vw, points.length, lr, c1, c2);
      adam(L.b, L.gb, L.mb, L.vb, points.length, lr, c1, c2);
    });
    return { loss: loss / points.length, acc: correct / points.length };
  };

  reset();
  return {
    predict,
    train,
    reset,
    get step() {
      return step;
    },
  };
};

const gaussian = () => {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};

const PATTERNS = {
  ring: () => {
    const pts = [];
    for (let i = 0; i < 40; i += 1) {
      const a = Math.random() * TAU;
      const r = Math.random() * 0.32;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, c: 0 });
    }
    for (let i = 0; i < 60; i += 1) {
      const a = Math.random() * TAU;
      const r = 0.6 + Math.random() * 0.28;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, c: 1 });
    }
    return pts;
  },
  xor: () => {
    const pts = [];
    [
      [-0.5, -0.5, 0],
      [0.5, 0.5, 0],
      [-0.5, 0.5, 1],
      [0.5, -0.5, 1],
    ].forEach(([cx, cy, c]) => {
      for (let i = 0; i < 22; i += 1) {
        pts.push({
          x: clamp(cx + gaussian() * 0.16, -0.95, 0.95),
          y: clamp(cy + gaussian() * 0.16, -0.95, 0.95),
          c,
        });
      }
    });
    return pts;
  },
  moons: () => {
    const pts = [];
    for (let i = 0; i < 50; i += 1) {
      const a = Math.random() * Math.PI;
      pts.push({ x: Math.cos(a) * 0.6 - 0.25 + gaussian() * 0.05, y: Math.sin(a) * 0.6 - 0.15 + gaussian() * 0.05, c: 0 });
      pts.push({ x: 0.25 - Math.cos(a) * 0.6 + gaussian() * 0.05, y: 0.15 - Math.sin(a) * 0.6 + gaussian() * 0.05, c: 1 });
    }
    return pts;
  },
  spiral: () => {
    const pts = [];
    for (let i = 0; i < 60; i += 1) {
      const t = i / 60;
      const r = 0.1 + t * 0.8;
      [0, 1].forEach((c) => {
        const a = t * 3.2 * Math.PI + c * Math.PI;
        pts.push({ x: Math.cos(a) * r + gaussian() * 0.02, y: Math.sin(a) * r + gaussian() * 0.02, c });
      });
    }
    return pts;
  },
};

const LAB_COLORS = [
  [94, 234, 212],
  [255, 176, 84],
];

const setupLab = (lab) => {
  const stats = { added: 0, bestAcc: 0 };
  const canvas = lab && lab.querySelector(".lab-canvas");
  if (!canvas) {
    return stats;
  }
  const ctx = canvas.getContext("2d");
  const hint = lab.querySelector(".lab-hint");
  const out = {
    epoch: lab.querySelector('[data-stat="epoch"]'),
    loss: lab.querySelector('[data-stat="loss"]'),
    acc: lab.querySelector('[data-stat="acc"]'),
  };
  const swatches = [...lab.querySelectorAll("[data-class]")];
  const patternNames = Object.keys(PATTERNS);
  let patternIndex = 0;
  let points = PATTERNS.ring();
  let paint = 0;
  let loss = 0;
  let acc = 0;
  let touched = false;
  let frames = 0;
  let visible = false;
  let running = false;
  const net = createNetwork([2, 10, 10, 1]);

  const fieldCanvas = document.createElement("canvas");
  const fieldCtx = fieldCanvas.getContext("2d");
  let image = null;
  let width = 0;
  let height = 0;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = 72;
    const rows = Math.max(24, Math.round((cols * height) / Math.max(1, width)));
    fieldCanvas.width = cols;
    fieldCanvas.height = rows;
    image = fieldCtx.createImageData(cols, rows);
  };

  // Paint what the network currently believes, then the points it learns from.
  const draw = () => {
    if (!image || !width) {
      return;
    }
    const cols = fieldCanvas.width;
    const rows = fieldCanvas.height;
    const data = image.data;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const p = net.predict(((c + 0.5) / cols) * 2 - 1, 1 - ((r + 0.5) / rows) * 2);
        const confidence = Math.abs(p - 0.5) * 2;
        const shade = 0.08 + confidence * 0.2;
        const edge = confidence < 0.1 ? 1 - confidence / 0.1 : 0;
        const i = (r * cols + c) * 4;
        for (let k = 0; k < 3; k += 1) {
          const colour = lerp(LAB_COLORS[0][k], LAB_COLORS[1][k], p);
          const base = lerp([4, 6, 11][k], colour, shade);
          data[i + k] = lerp(base, 255, edge * 0.55);
        }
        data[i + 3] = 255;
      }
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas, 0, 0, width, height);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    for (const p of points) {
      const x = ((p.x + 1) / 2) * width;
      const y = ((1 - p.y) / 2) * height;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fillStyle = rgb(LAB_COLORS[p.c]);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(4,6,11,0.9)";
      ctx.stroke();
    }
  };

  const writeStats = () => {
    out.epoch.textContent = net.step.toLocaleString("en-AU");
    out.loss.textContent = points.length ? loss.toFixed(3) : "–";
    out.acc.textContent = points.length ? `${Math.round(acc * 100)}%` : "–";
  };

  const frame = () => {
    if (!visible) {
      running = false;
      return;
    }
    for (let i = 0; i < 4; i += 1) {
      const result = net.train(points);
      loss = result.loss;
      acc = result.acc;
    }
    if (touched) {
      stats.bestAcc = Math.max(stats.bestAcc, acc);
    }
    draw();
    frames += 1;
    if (frames % 6 === 0) {
      writeStats();
    }
    window.requestAnimationFrame(frame);
  };

  const wake = () => {
    if (!running && visible) {
      running = true;
      window.requestAnimationFrame(frame);
    }
  };

  // A click (not a touch-scroll) drops a point; shift-click uses the other colour.
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    points.push({ x, y, c: event.shiftKey ? 1 - paint : paint });
    if (points.length > 320) {
      points.shift();
    }
    stats.added += 1;
    touched = true;
    hint.classList.add("is-hidden");
    wake();
  });

  swatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      paint = Number(swatch.dataset.class);
      swatches.forEach((s) => s.setAttribute("aria-pressed", String(s === swatch)));
    });
  });

  lab.querySelectorAll("[data-lab]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.lab;
      if (action === "pattern") {
        patternIndex = (patternIndex + 1) % patternNames.length;
        points = PATTERNS[patternNames[patternIndex]]();
        net.reset();
      } else if (action === "reset") {
        net.reset();
      } else if (action === "clear") {
        points = [];
        touched = true;
      }
      writeStats();
      draw();
    });
  });

  new ResizeObserver(() => {
    resize();
    draw();
  }).observe(canvas);

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        wake();
      }
    },
    { rootMargin: "80px" }
  ).observe(canvas);

  resize();
  draw();
  return stats;
};

/* ---------- Layer 5: the output ---------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The message box in the output layer. With data-endpoint set, it posts to the
// contact Worker (contact-worker/), which sends the email through Resend.
// Without one, it opens the visitor's email app with the message ready to go.
const setupContactForm = (form, onSent) => {
  if (!form) {
    return;
  }
  const status = form.querySelector(".signal-status");
  const send = form.querySelector(".signal-send");
  const sendLabel = form.querySelector(".signal-send-label");
  const { message, name, email, website } = form.elements;
  let startedAt = 0;

  form.addEventListener("focusin", () => {
    if (!startedAt) {
      startedAt = performance.now();
    }
  });

  const say = (text, tone = "") => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = message.value.trim();
    const from = email.value.trim();
    const who = name.value.trim();

    if (!text) {
      say("Write a message first.", "error");
      message.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(from)) {
      say("Add your email so I can reply.", "error");
      email.focus();
      return;
    }

    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      const subject = `Portfolio message from ${who || from}`;
      const body = `${text}\n\n— ${who ? `${who} ` : ""}(${from})`;
      window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      say("Opening your email app with the message ready to send.", "ok");
      return;
    }

    form.classList.add("is-sending");
    send.disabled = true;
    sendLabel.textContent = "Sending";
    say("Sending…");
    try {
      // The Worker quietly drops anything sent within 2.5 s of first touching the
      // form (bots are that fast). Wait out the difference so a quick human is
      // never mistaken for one.
      const waited = startedAt ? performance.now() - startedAt : Infinity;
      if (waited < 2600) {
        await new Promise((resolve) => window.setTimeout(resolve, 2600 - waited));
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: who,
          email: from,
          message: text,
          website: website.value,
          elapsed: Math.round(performance.now() - (startedAt || 0)),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "The message couldn't be sent right now.");
      }
      form.reset();
      form.classList.add("is-sent");
      say(`Signal received. Thanks, I’ll get back to you at ${from}.`, "ok");
      onSent(send);
    } catch (error) {
      // fetch() throws a TypeError when the network or server can't be reached.
      const reason = error instanceof TypeError ? "Couldn't reach the mail server." : error.message;
      say(`${reason} You can also email ${EMAIL} directly.`, "error");
    } finally {
      form.classList.remove("is-sending");
      send.disabled = false;
      sendLabel.textContent = "Send";
    }
  });
};

const setupOutput = (story, labStats) => {
  const button = document.querySelector("[data-copy]");
  const hint = document.querySelector("[data-copy-hint]");
  const statsEl = document.querySelector("[data-stats]");
  let resetTimer = 0;

  if (button) {
    button.addEventListener("click", async () => {
      const email = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(email);
        button.classList.add("is-copied");
        hint.textContent = "Copied";
      } catch {
        window.location.href = `mailto:${email}`;
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        button.classList.remove("is-copied");
        hint.textContent = "Copy";
      }, 2600);
    });
  }

  // A sent message bursts out of the send button like the signal leaving the network.
  setupContactForm(document.querySelector(".signal-form"), (sendButton) => {
    story.stats.sent = true;
    if (story.field && live) {
      const rect = sendButton.getBoundingClientRect();
      story.field.burst(rect.left + rect.width / 2, rect.top + rect.height / 2 + window.scrollY, PALETTES.output.a2);
    }
  });

  const plural = (n, word) => `${n.toLocaleString("en-AU")} ${word}${n === 1 ? "" : "s"}`;

  // A receipt of the reader's own trip through the network.
  const renderStats = () => {
    const { distance, activeMs, maxLit } = story.stats;
    const metres = (distance * 0.0002646).toFixed(1);
    const minutes = Math.floor(activeMs / 60000);
    const seconds = Math.round((activeMs % 60000) / 1000);
    const time = minutes ? `${minutes} min ${seconds} s` : `${seconds} s`;
    let text =
      `You followed the signal <strong>${metres} metres</strong> down the page, ` +
      `lit <strong>${plural(maxLit, "connection")}</strong>, and spent <strong>${time}</strong> with it.`;
    if (labStats.added > 0) {
      text +=
        ` You also fed my network <strong>${plural(labStats.added, "point")}</strong>` +
        ` and trained it to <strong>${Math.round(labStats.bestAcc * 100)}% accuracy</strong>.`;
    }
    if (story.stats.sent) {
      text += " And you sent a signal of your own.";
    }
    statsEl.innerHTML = `${text} Thanks for reading.`;
  };

  let ticking = 0;
  story.onLit((el, node) => {
    if (el === statsEl && !ticking) {
      ticking = window.setInterval(() => {
        if (statsEl.classList.contains("is-lit")) {
          renderStats();
        }
      }, 1000);
    }
    if (el.classList.contains("output-node") && story.field && live) {
      const rect = el.getBoundingClientRect();
      const palette = PALETTES.output;
      story.field.burst(rect.left + rect.width / 2, node.top + 30, palette.a1);
    }
    if (el === statsEl) {
      renderStats();
    }
  });
};

/* ---------- Start ---------- */

const init = () => {
  updateClocks();
  window.setInterval(updateClocks, 15000);

  const intro = setupIntro();
  const story = setupStory();
  setupTerminal(document.querySelector(".terminal"), story);
  setupBuilds();
  setupGraph(document.querySelector(".graph-panel"), story);
  const labStats = setupLab(document.querySelector(".lab"));
  setupOutput(story, labStats);

  const measure = () => {
    if (intro) {
      intro.measure();
    }
    story.measure();
  };
  measure();
  story.jumpToHash();

  let measureQueued = false;
  const queueMeasure = () => {
    if (measureQueued) {
      return;
    }
    measureQueued = true;
    window.requestAnimationFrame(() => {
      measureQueued = false;
      measure();
    });
  };
  new ResizeObserver(queueMeasure).observe(document.querySelector(".story-root"));
  window.addEventListener("resize", queueMeasure);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(queueMeasure);
  }

  let lastY = window.scrollY;
  let lastNow = performance.now();

  const render = (now, still) => {
    const y = window.scrollY;
    story.stats.distance += Math.abs(y - lastY);
    lastY = y;
    const dt = Math.min(100, now - lastNow);
    lastNow = now;
    if (document.visibilityState === "visible") {
      story.stats.activeMs += dt;
    }

    // Read layout first, then write.
    let neuron = null;
    let introP = 1;
    if (intro && y < intro.end) {
      const point = intro.neuronPoint();
      introP = intro.update(y, now);
      neuron = {
        x: point.x,
        y: point.y,
        reach: 90 + introP * 260,
        strength: 0.5 * (1 - smoothstep(0.92, 1, introP)),
      };
    }

    const pulseY = story.update(y, now);
    if (story.field) {
      story.field.draw({
        scrollY: y,
        pulseY,
        time: now,
        palette: story.paletteAt(pulseY),
        edges: story.edges,
        nodes: story.nodes,
        neuron,
        still,
      });
    }
  };

  if (!live) {
    // Reduced motion: no animation loop, just redraw when the reader scrolls.
    document.querySelectorAll("[data-node]").forEach((el) => el.classList.add("is-lit"));
    let queued = false;
    const redraw = () => {
      if (queued) {
        return;
      }
      queued = true;
      window.requestAnimationFrame((now) => {
        queued = false;
        render(now, true);
      });
    };
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("resize", redraw);
    redraw();
    return;
  }

  // In the cold open, a paused scroll glides to the nearest fully written line.
  let settleTimer = 0;
  let touching = false;
  const settleIntro = () => {
    if (!intro || touching || story.anim) {
      return;
    }
    const y = window.scrollY;
    const holds = intro.holds();
    if (y > holds[holds.length - 1][1]) {
      return;
    }
    if (holds.some(([a, b]) => y >= a - 2 && y <= b + 2)) {
      return;
    }
    let best = null;
    holds.forEach(([a, b]) => {
      [a + 4, b - 4].forEach((target) => {
        const distance = Math.abs(target - y);
        if (!best || distance < best.distance) {
          best = { target, distance };
        }
      });
    });
    if (best) {
      story.animateTo(best.target, 650);
    }
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!story.anim) {
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(settleIntro, 220);
      }
    },
    { passive: true }
  );
  window.addEventListener("touchstart", () => (touching = true), { passive: true });
  window.addEventListener(
    "touchend",
    () => {
      touching = false;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleIntro, 320);
    },
    { passive: true }
  );

  const frame = (now) => {
    render(now, false);
    window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(frame);
};

init();

const yearNode = document.getElementById("current-year");
if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}
