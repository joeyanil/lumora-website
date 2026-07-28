/* ==========================================================================
   LUMORA — shared interaction layer
   Vanilla JS only — no build step, works identically on every page.
   ========================================================================== */
(function () {
  "use strict";
  const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Anti-clickjacking (defense-in-depth) ----------
     The real protection is the frame-ancestors CSP directive and the
     X-Frame-Options header set at the host level (see SECURITY.md / the
     _headers, vercel.json, .htaccess, and nginx.conf files). This is a
     belt-and-suspenders fallback for any proxy or misconfigured host that
     drops those headers. */
  try {
    if (window.top !== window.self) {
      window.top.location = window.self.location.href;
    }
  } catch (e) {
    // Cross-origin framing blocked reading window.top — hide the page
    // instead of risking a broken redirect loop.
    document.documentElement.style.display = "none";
  }

  /* ---------- Nav: solid on scroll ---------- */
  const nav = document.getElementById("nav");
  if (nav) {
    const setSolid = () => nav.classList.toggle("scrolled", scrollY > 24);
    setSolid();
    addEventListener("scroll", setSolid, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  const burger = document.getElementById("burger");
  if (burger) {
    burger.addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", open);
    });
    document.querySelectorAll("#mnav a").forEach((a) =>
      a.addEventListener("click", () => document.body.classList.remove("menu-open"))
    );
  }

  /* ---------- Active nav link ---------- */
  (function markActive() {
    const path = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    document.querySelectorAll("#nav .nav-links a[href], #mnav a[href]").forEach((a) => {
      const href = a.getAttribute("href").replace(/index\.html$/, "").replace(/\/$/, "") || "/";
      if (href === path && href !== "/") a.classList.add("active");
      if (href === "/" && path === "/") a.classList.add("active");
    });
  })();

  /* ---------- Scroll reveals ---------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("in"));
  }

  /* ---------- Animated stat counters ---------- */
  if ("IntersectionObserver" in window) {
    const cio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return;
          cio.unobserve(e.target);
          const el = e.target,
            end = +el.dataset.count;
          if (prefersReduced) {
            el.textContent = String(end);
            return;
          }
          const t0 = performance.now();
          (function f(t) {
            const p = Math.min((t - t0) / 900, 1);
            el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(f);
          })(t0);
        }),
      { threshold: 0.6 }
    );
    document.querySelectorAll("[data-count]").forEach((el) => cio.observe(el));
  }

  /* ---------- UTC system clock (hero status panel) ---------- */
  const utc = document.getElementById("utc");
  if (utc) {
    const tick = () => (utc.textContent = new Date().toISOString().slice(11, 19) + " UTC");
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Rising light motes (hero canvas) ---------- */
  (function motes() {
    const cv = document.getElementById("motes");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const DPR = Math.min(devicePixelRatio || 1, 2);
    let W, H, ps = [];
    function size() {
      W = cv.width = cv.clientWidth * DPR;
      H = cv.height = cv.clientHeight * DPR;
    }
    function seed() {
      ps = Array.from({ length: 60 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: (Math.random() * 1.4 + 0.5) * DPR,
        v: (Math.random() * 0.3 + 0.1) * DPR,
        o: Math.random() * 0.4 + 0.12,
        tw: Math.random() * 6.28,
      }));
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.y -= p.v;
        if (p.y < -4) {
          p.y = H + 4;
          p.x = Math.random() * W;
        }
        const a = p.o * (0.7 + 0.3 * Math.sin(t / 900 + p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = `rgba(232,180,90,${a})`;
        ctx.fill();
      }
      if (!prefersReduced) requestAnimationFrame(draw);
    }
    size();
    seed();
    draw(0);
    if (!prefersReduced) requestAnimationFrame(draw);
    addEventListener("resize", () => {
      size();
      seed();
    });
  })();

  /* ---------- Lumi product typing demo ---------- */
  (function lumiType() {
    const el = document.getElementById("lumiType");
    if (!el) return;
    const lines = [
      "Draft this term's progress reports.",
      "Flag students who need extra support.",
      "Summarise today's attendance anomalies.",
      "Translate the parent notice to Amharic.",
    ];
    if (prefersReduced) {
      el.textContent = lines[0];
      return;
    }
    let i = 0, c = 0, del = false;
    (function step() {
      const s = lines[i];
      el.textContent = s.slice(0, c);
      if (!del) {
        c++;
        if (c > s.length) {
          del = true;
          return setTimeout(step, 2200);
        }
      } else {
        c--;
        if (c === 0) {
          del = false;
          i = (i + 1) % lines.length;
          return setTimeout(step, 420);
        }
      }
      setTimeout(step, del ? 20 : 46 + Math.random() * 40);
    })();
  })();

  /* ---------- Projects filter (projects.html) ---------- */
  (function projectFilter() {
    const bar = document.querySelector(".projects-toolbar");
    if (!bar) return;
    const cards = document.querySelectorAll(".proj-card");
    const empty = document.querySelector(".proj-empty");
    function applyFilter(cat, btn) {
      bar.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("is-active"));
      if (btn) btn.classList.add("is-active");
      let visible = 0;
      cards.forEach((card) => {
        const show = cat === "all" || card.dataset.category === cat;
        card.classList.toggle("is-hidden", !show);
        if (show) visible++;
      });
      if (empty) empty.classList.toggle("is-hidden", visible !== 0);
    }
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      applyFilter(btn.dataset.filter, btn);
    });
    // Arriving via /research.html#education-ai style link: pre-apply that filter.
    const hash = location.hash.replace("#", "");
    if (hash) {
      const btn = bar.querySelector(`.filter-btn[data-filter="${hash}"]`);
      if (btn) applyFilter(hash, btn);
    }
  })();

  /* ---------- Thinking orb — small canvas loading indicator ---------- */
  function paintOrb(canvas) {
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(devicePixelRatio || 1, 2);
    const size = 16 * DPR;
    canvas.width = size;
    canvas.height = size;
    const dots = 8;
    let raf;
    function frame(t) {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cy = size / 2, r = size / 2 - 2 * DPR;
      for (let i = 0; i < dots; i++) {
        const ang = (i / dots) * Math.PI * 2 + t / 480;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const a = 0.25 + 0.75 * ((Math.sin(ang - t / 480) + 1) / 2);
        ctx.beginPath();
        ctx.arc(x, y, 1.3 * DPR, 0, 6.283);
        ctx.fillStyle = `rgba(229,166,59,${a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    if (!prefersReduced) raf = requestAnimationFrame(frame);
    else {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2 * DPR, 0, 6.283);
      ctx.strokeStyle = "rgba(229,166,59,.8)";
      ctx.lineWidth = 1.5 * DPR;
      ctx.stroke();
    }
    return () => raf && cancelAnimationFrame(raf);
  }

  /* ---------- Contact form ---------- */
  (function contactForm() {
    const form = document.getElementById("contactForm");
    if (!form) return;
    const status = document.getElementById("formStatus");
    const submitBtn = form.querySelector("[type=submit]");
    const orbCanvas = form.querySelector(".orb");
    const loadedAt = Date.now();
    let lastSentAt = 0;

    // Strip ASCII control characters (CR, LF, NUL, etc). Belt-and-suspenders
    // against mail-header injection: encodeURIComponent() already neutralises
    // these for the mailto: URI, but a value that can never contain a raw
    // newline in the first place is safer under any future refactor.
    function sanitize(str, maxLen) {
      return str.replace(/[\x00-\x1F\x7F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
    }

    function showError(field, msg) {
      const wrap = field.closest(".field");
      wrap.classList.add("invalid");
      wrap.querySelector(".err").textContent = msg;
    }
    function clearError(field) {
      const wrap = field.closest(".field");
      wrap.classList.remove("invalid");
    }

    function validate() {
      let ok = true;
      const name = form.name, email = form.email, message = form.message;

      [name, email, message].forEach(clearError);

      if (sanitize(name.value, 120).length < 2) {
        showError(name, "Please enter your name (2+ characters).");
        ok = false;
      }
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      const emailVal = sanitize(email.value, 254);
      if (!emailRe.test(emailVal)) {
        showError(email, "Please enter a valid email address.");
        ok = false;
      }
      if (sanitize(message.value, 5000).length < 10) {
        showError(message, "Message should be at least 10 characters.");
        ok = false;
      }
      return ok;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      status.className = "form-status";

      // Honeypot: a hidden field only a bot would fill in. Drop silently.
      if (form.company && form.company.value.trim() !== "") {
        form.reset();
        return;
      }
      // Timing check: a real visitor can't read the form and fill it in
      // under ~2.5s. Treat near-instant submissions as automated.
      if (Date.now() - loadedAt < 2500) {
        form.reset();
        return;
      }
      // Resubmit cooldown: stop a stuck key or script from firing repeat
      // mailto: navigations.
      if (Date.now() - lastSentAt < 10000) return;

      if (!validate()) return;

      submitBtn.disabled = true;
      let stopOrb = null;
      if (orbCanvas) stopOrb = paintOrb(orbCanvas);
      submitBtn.querySelector(".btn-label").textContent = "Sending…";

      const name = sanitize(form.name.value, 120);
      const email = sanitize(form.email.value, 254);
      const topic = form.topic.value; // fixed <select> enum — not free text
      const message = sanitize(form.message.value, 5000);

      // No backend is connected in this static build (see BUILD_NOTES.md).
      // We open the visitor's mail client pre-filled to dev.lumora@gmail.com
      // so the message reaches Lumora today. When this ships on Next.js +
      // Supabase, swap this block for the Server Action described in the
      // architecture doc (§6 Contact / §11 env vars) — the form markup,
      // validation, and honeypot field already match that spec. Validate
      // and sanitise again server-side; never trust client-side checks.
      const subject = encodeURIComponent(`[Lumora contact] ${topic} — ${name}`);
      const body = encodeURIComponent(`${message}\n\n—\n${name}\n${email}`);
      const mailto = `mailto:dev.lumora@gmail.com?subject=${subject}&body=${body}`;

      setTimeout(() => {
        if (stopOrb) stopOrb();
        submitBtn.disabled = false;
        submitBtn.querySelector(".btn-label").textContent = "Send message";
        lastSentAt = Date.now();
        window.location.href = mailto;
        status.classList.add("show", "ok");
        status.textContent =
          "Your email app should now open with this message ready to send to dev.lumora@gmail.com. If it didn't, email us directly.";
        form.reset();
      }, 650);
    });
  })();
})();
