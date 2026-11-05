"use strict";
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
const EMAIL = "riley.pigneguy@gmail.com";

// A local clock is a small reminder that there is a person behind the work.
const perthClock = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Perth",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function updateClock() {
  document.querySelectorAll("[data-perth-time]").forEach((el) => {
    el.textContent = perthClock.format(new Date()) + " AWST";
  });
}
updateClock();
setInterval(updateClock, 60000);
document
  .querySelectorAll("[data-year]")
  .forEach((el) => (el.textContent = new Date().getFullYear()));

// Animate the entrance only. The document stays readable if scripts are unavailable.
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!motion.matches)
          entry.target.animate(
            [
              { opacity: 0, transform: "translateY(18px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" },
          );
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.06 },
  );
  document
    .querySelectorAll("[data-reveal]")
    .forEach((el) => observer.observe(el));
}

// Fetch and decode each project's screenshots before the visitor selects them.
// Observe the project wrapper because closed <details> hide the gallery itself.
const decodedSources = new WeakMap();
const imageLoads = new WeakMap();
const galleryPreloads = new WeakMap();
function prepareScreenshot(image) {
  if (
    image.complete &&
    image.naturalWidth &&
    decodedSources.get(image) === image.currentSrc
  )
    return Promise.resolve();
  if (!imageLoads.has(image)) {
    image.loading = "eager";
    const ready = image
      .decode()
      .then(() => {
        decodedSources.set(image, image.currentSrc);
      })
      .finally(() => {
        imageLoads.delete(image);
      });
    imageLoads.set(image, ready);
  }
  return imageLoads.get(image);
}
const galleryObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            galleryPreloads.get(entry.target)();
            galleryObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "600px 0px" },
      )
    : null;

document.querySelectorAll("[data-gallery]").forEach((gallery) => {
  const images = [...gallery.querySelectorAll("img")];
  const buttons = [...gallery.querySelectorAll("[data-slide]")];
  const project = gallery.closest(".project, .archive-project");
  const status = document.createElement("p");
  status.className = "gallery-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  gallery.append(status);
  let selection = 0;
  let loadingNotice;

  const preload = () =>
    images.forEach((image) => {
      image.fetchPriority = image.hidden ? "low" : "auto";
      prepareScreenshot(image).catch(() => {});
    });
  galleryPreloads.set(project, preload);
  if (galleryObserver) galleryObserver.observe(project);
  else preload();
  project.addEventListener("pointerenter", preload, { once: true });
  project.addEventListener("focusin", preload, { once: true });

  buttons.forEach((button) =>
    button.addEventListener("click", async () => {
      const request = ++selection;
      const selected = Number(button.dataset.slide);
      clearTimeout(loadingNotice);
      status.hidden = true;
      gallery.setAttribute("aria-busy", "true");
      loadingNotice = setTimeout(() => {
        status.textContent = "Loading screenshot…";
        status.hidden = false;
      }, 150);
      try {
        // Keep the previous screenshot visible until the new one is decoded.
        // The selection guard prevents a slower earlier click replacing a newer one.
        await prepareScreenshot(images[selected]);
        if (request !== selection) return;
        images.forEach((image, index) => {
          image.hidden = index !== selected;
        });
        buttons.forEach((item, index) => {
          item.setAttribute("aria-pressed", String(index === selected));
        });
        status.hidden = true;
        if (!motion.matches)
          images[selected].animate([{ opacity: 0.8 }, { opacity: 1 }], {
            duration: 140,
          });
      } catch {
        if (request !== selection) return;
        status.textContent = "Couldn’t load this screenshot. Try again.";
        status.hidden = false;
      } finally {
        if (request === selection) {
          clearTimeout(loadingNotice);
          gallery.setAttribute("aria-busy", "false");
        }
      }
    }),
  );
});

// A native dialog handles Escape and focus trapping; the iframe is loaded on demand.
const dialog = document.querySelector(".live-dialog");
const frame = dialog.querySelector("[data-preview-frame]");
document.querySelector("[data-live-preview]").addEventListener("click", () => {
  frame.src = "https://michaelpigneguy.com/";
  dialog.showModal();
  document.body.classList.add("dialog-open");
});
dialog
  .querySelector(".dialog-close")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  }
});
dialog.addEventListener("close", () => {
  frame.removeAttribute("src");
  document.body.classList.remove("dialog-open");
});

const copy = document.querySelector("[data-copy]");
const copyHint = copy.querySelector("[data-copy-hint]");
let copyTimer;
copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(EMAIL);
    copyHint.textContent = "Copied. Say hello!";
    document.querySelector(".copy-status").textContent =
      "Email address copied to clipboard.";
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyHint.textContent = "Copy email address";
    }, 2600);
  } catch {
    window.location.href = "mailto:" + EMAIL;
  }
});

const form = document.querySelector(".contact-form");
const status = form.querySelector(".form-status");
const send = form.querySelector(".send-button");
const sendLabel = form.querySelector("[data-send-label]");
const fields = form.elements;
let startedAt = 0;
form.addEventListener("focusin", () => {
  if (!startedAt) startedAt = performance.now();
});
const say = (text, tone = "") => {
  status.textContent = text;
  status.dataset.tone = tone;
};
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (send.disabled) return;
  const message = fields.message.value.trim(),
    email = fields.email.value.trim(),
    name = fields.name.value.trim();
  fields.email.removeAttribute("aria-invalid");
  fields.message.removeAttribute("aria-invalid");
  if (!message) {
    fields.message.setAttribute("aria-invalid", "true");
    say("Write a message first.", "error");
    fields.message.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email.setAttribute("aria-invalid", "true");
    say("Add a valid email so I can reply.", "error");
    fields.email.focus();
    return;
  }
  send.disabled = true;
  sendLabel.textContent = "Sending…";
  form.setAttribute("aria-busy", "true");
  say("Delivering your note…");
  try {
    const waited = startedAt ? performance.now() - startedAt : 0;
    if (waited < 2600)
      await new Promise((resolve) => setTimeout(resolve, 2600 - waited));
    const response = await fetch(form.dataset.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        message,
        website: fields.website.value,
        elapsed: Math.max(
          2600,
          Math.round(performance.now() - (startedAt || 0)),
        ),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok)
      throw new Error(
        result.error || "Your message could not be sent right now.",
      );
    form.reset();
    startedAt = 0;
    say(`Note received. I’ll get back to you at ${email}.`, "ok");
  } catch (error) {
    say(
      `${error instanceof TypeError || error.name === "TimeoutError" ? "Couldn’t reach the email service." : error.message} You can also email ${EMAIL} directly.`,
      "error",
    );
  } finally {
    send.disabled = false;
    sendLabel.textContent = "Send message";
    form.removeAttribute("aria-busy");
  }
});
