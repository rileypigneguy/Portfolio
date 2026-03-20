const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

const setupRevealObserver = () => {
  const revealItems = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.2,
      rootMargin: "0px 0px -48px 0px",
    }
  );

  revealItems.forEach((item) => observer.observe(item));
};

const setupCarousel = (card) => {
  const slides = [...card.querySelectorAll(".carousel-slide")];
  const dots = [...card.querySelectorAll(".carousel-dot")];

  if (slides.length < 2) {
    return;
  }

  let activeIndex = 0;
  let intervalId = null;

  const setActiveSlide = (nextIndex) => {
    activeIndex = nextIndex;

    slides.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === nextIndex);
    });

    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === nextIndex);
    });
  };

  const stopCarousel = (reset = false) => {
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }

    if (reset) {
      setActiveSlide(0);
    }
  };

  const startCarousel = () => {
    if (prefersReducedMotion || intervalId) {
      return;
    }

    intervalId = window.setInterval(() => {
      const nextIndex = (activeIndex + 1) % slides.length;
      setActiveSlide(nextIndex);
    }, 1200);
  };

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      stopCarousel(false);
      setActiveSlide(index);
    });
  });

  card.addEventListener("mouseenter", startCarousel);
  card.addEventListener("mouseleave", () => stopCarousel(true));
  card.addEventListener("focusin", startCarousel);
  card.addEventListener("focusout", (event) => {
    if (!card.contains(event.relatedTarget)) {
      stopCarousel(true);
    }
  });
};

document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
setupRevealObserver();

const yearNode = document.getElementById("current-year");
if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}
