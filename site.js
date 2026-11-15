(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onLang = [];
  const isEs = () => root.lang === "es";
  // Read data-en / data-es, or data-<base>En / data-<base>Es.
  const pick = (el, base = "") =>
    el.dataset[base ? `${base}${isEs() ? "Es" : "En"}` : (isEs() ? "es" : "en")] || "";
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  /* ── Language ───────────────────────────────────── */
  const toggleLang = () => {
    root.lang = isEs() ? "en" : "es";
    try { localStorage.setItem("pg6-lang", root.lang); } catch (e) {}
    onLang.forEach((fn) => fn());
  };
  document.querySelectorAll("[data-lang-toggle]").forEach((b) => b.addEventListener("click", toggleLang));

  /* ── Theme ──────────────────────────────────────── */
  const onTheme = [];
  const themeMeta = document.querySelector("[data-theme-color]");
  const paintThemeMeta = () => { if (themeMeta) themeMeta.content = cssVar("--bg"); };
  const toggleTheme = () => {
    root.classList.add("theming");
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("pg6-theme", root.dataset.theme); } catch (e) {}
    paintThemeMeta();
    onTheme.forEach((fn) => fn());
    setTimeout(() => root.classList.remove("theming"), 350);
  };
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.addEventListener("click", toggleTheme));
  paintThemeMeta();

  /* ── Madrid clock ───────────────────────────────── */
  const clock = document.querySelector("[data-clock]");
  if (clock) {
    const format = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
    const tick = () => { clock.textContent = format.format(new Date()); };
    tick();
    setInterval(tick, 20000);
  }

  /* ── Hero name: letters lean towards the cursor ── */
  const name = document.querySelector("[data-name]");
  const letters = [];
  if (name) {
    let n = 0;
    name.querySelectorAll(".ln").forEach((line) => {
      [...line.childNodes].forEach((node) => {
        if (node.nodeType !== 3) {
          // Keep the full stop glued to the last word so it never wraps alone.
          letters.push(node);
          node.classList.add("ch");
          node.style.setProperty("--i", n++);
          const prev = node.previousSibling;
          if (prev && prev.classList?.contains("w")) prev.append(node);
          return;
        }
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((word) => {
          if (!word) return;
          if (/^\s+$/.test(word)) { frag.append(word); return; }
          const w = document.createElement("span");
          w.className = "w";
          w.setAttribute("aria-hidden", "true");
          [...word].forEach((c) => {
            const s = document.createElement("span");
            s.className = "ch";
            s.textContent = c;
            s.style.setProperty("--i", n++);
            letters.push(s);
            w.append(s);
          });
          frag.append(w);
        });
        node.replaceWith(frag);
      });
    });
  }

  /* ── Rotating focus word, typed ─────────────────── */
  const rot = document.querySelector("[data-rotate]");
  if (rot) {
    let words = [];
    let k = 0;
    let timer = null;
    const load = () => { words = pick(rot).split("|"); k = 0; rot.textContent = words[0]; };
    const type = (word, i, done) => {
      rot.textContent = word.slice(0, i);
      if (i < word.length) timer = setTimeout(() => type(word, i + 1, done), 45);
      else done();
    };
    const erase = (done) => {
      const t = rot.textContent;
      if (!t.length) { done(); return; }
      rot.textContent = t.slice(0, -1);
      timer = setTimeout(() => erase(done), 25);
    };
    const cycle = () => {
      timer = setTimeout(() => erase(() => {
        k = (k + 1) % words.length;
        type(words[k], 1, cycle);
      }), 2600);
    };
    load();
    if (!reduceMotion) cycle();
    onLang.push(() => { clearTimeout(timer); load(); if (!reduceMotion) cycle(); });
  }

  /* ── Hero field: a dot grid that answers the cursor ─ */
  const hero = document.querySelector(".hero");
  const field = document.querySelector("[data-field]");
  if (hero && field) {
    const ctx = field.getContext("2d");
    const gap = 26;
    let w = 0;
    let h = 0;
    let dots = [];
    let colors = {};
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: false };
    const ripples = [];
    let visible = true;
    let gone = false;
    let raf = null;
    let lastAuto = 0;

    const readColors = () => { colors = { dot: cssVar("--dot"), accent: cssVar("--accent") }; };
    const size = () => {
      const r = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth;
      h = hero.clientHeight;
      field.width = Math.round(w * r);
      field.height = Math.round(h * r);
      ctx.setTransform(r, 0, 0, r, 0, 0);
      dots = [];
      const ox = (w % gap) / 2;
      const oy = (h % gap) / 2;
      for (let y = oy; y <= h; y += gap) for (let x = ox; x <= w; x += gap) dots.push(x, y);
    };

    const frame = (now) => {
      raf = null;
      pointer.x += (pointer.tx - pointer.x) * 0.14;
      pointer.y += (pointer.ty - pointer.y) * 0.14;
      if (!reduceMotion && now - lastAuto > 3200 && !pointer.on) {
        lastAuto = now;
        ripples.push({ x: w * (0.15 + Math.random() * 0.7), y: h * (0.15 + Math.random() * 0.6), t: now, soft: true });
      }
      for (let i = ripples.length - 1; i >= 0; i -= 1) if (now - ripples[i].t > 2600) ripples.splice(i, 1);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = colors.dot;
      ctx.beginPath();
      const hot = [];
      for (let i = 0; i < dots.length; i += 2) {
        let x = dots[i];
        let y = dots[i + 1];
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        let e = pointer.on ? Math.exp(-d2 / (2 * 120 * 120)) : 0;
        if (e > 0.01) { const d = Math.sqrt(d2) || 1; x += (dx / d) * e * 9; y += (dy / d) * e * 9; }
        for (const r of ripples) {
          const age = (now - r.t) / 2600;
          const rad = age * Math.max(w, h) * 0.5;
          const rd = Math.hypot(dots[i] - r.x, dots[i + 1] - r.y) - rad;
          e += Math.exp(-(rd * rd) / (2 * 22 * 22)) * (1 - age) * (r.soft ? 0.55 : 0.9);
        }
        if (e > 0.06) hot.push(x, y, Math.min(e, 1));
        else { ctx.moveTo(x + 1.1, y); ctx.arc(x, y, 1.1, 0, Math.PI * 2); }
      }
      ctx.fill();
      ctx.fillStyle = colors.accent;
      for (let i = 0; i < hot.length; i += 3) {
        ctx.globalAlpha = 0.25 + hot[i + 2] * 0.75;
        ctx.beginPath();
        ctx.arc(hot[i], hot[i + 1], 1.1 + hot[i + 2] * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (visible && !gone && !document.hidden && !reduceMotion) raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const lean = () => {
      if (!letters.length) return;
      letters.forEach((el) => {
        if (!pointer.on) { el.style.setProperty("--p", 0); return; }
        const b = el.getBoundingClientRect();
        const hb = hero.getBoundingClientRect();
        const d = Math.hypot(b.left + b.width / 2 - hb.left - pointer.tx, b.top + b.height / 2 - hb.top - pointer.ty);
        el.style.setProperty("--p", Math.max(0, 1 - d / 240).toFixed(3));
      });
    };

    hero.addEventListener("pointermove", (e) => {
      const b = hero.getBoundingClientRect();
      pointer.tx = e.clientX - b.left;
      pointer.ty = e.clientY - b.top;
      if (!pointer.on) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
      pointer.on = e.pointerType === "mouse";
      if (pointer.on) lean();
      kick();
    });
    hero.addEventListener("pointerleave", () => { pointer.on = false; lean(); });
    hero.addEventListener("pointerdown", (e) => {
      if (e.target.closest("a, button")) return;
      const b = hero.getBoundingClientRect();
      ripples.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() });
      kick();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); }).observe(hero);
    }
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("resize", () => { size(); kick(); if (reduceMotion) frame(performance.now()); });
    onTheme.push(() => { readColors(); kick(); if (reduceMotion) frame(performance.now()); });
    readColors();
    size();
    if (reduceMotion) frame(performance.now()); else kick();

    // Depth: the hero stays pinned while the page slides over it, and its
    // layers fly towards the viewer at different speeds, blurring out.
    if (!reduceMotion) {
      root.classList.add("depth");
      let queued = false;
      const depth = () => {
        queued = false;
        const p = Math.min(1.2, Math.max(0, window.scrollY / window.innerHeight));
        hero.style.setProperty("--p", p.toFixed(4));
        const wasGone = gone;
        gone = p >= 1.05;
        hero.classList.toggle("gone", gone);
        if (wasGone && !gone) kick();
      };
      window.addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(depth); } }, { passive: true });
      window.addEventListener("resize", depth);
      depth();
    }
  }

  // The hero is sticky, so "#top" links scroll the window instead of the element.
  document.querySelectorAll('a[href="#top"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }));

  /* ── Dock: highlight the section in view ────────── */
  const dockLinks = [...document.querySelectorAll(".dock a")];
  const dockTargets = dockLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const markDock = () => {
    const line = window.innerHeight * 0.4;
    let best = null;
    let bestTop = -Infinity;
    dockTargets.forEach((section) => {
      const top = section.classList.contains("hero") ? -window.scrollY : section.getBoundingClientRect().top;
      if (top <= line && top > bestTop) { best = section; bestTop = top; }
    });
    dockLinks.forEach((link) => link.classList.toggle("on", !!best && link.getAttribute("href") === `#${best.id}`));
  };
  window.addEventListener("scroll", markDock, { passive: true });
  markDock();

  /* ── Reveal sections as they arrive ─────────────── */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll("main .sec-head, main .case, main .job, main .facts > div, main .about, main .idx, main .skills, main .mail")
      .forEach((el) => { el.classList.add("reveal"); io.observe(el); });
  }

  /* ── Tab groups (thesis stages, apps) ───────────── */
  const tabGroup = (tabs, panels) => {
    const show = (index) => {
      tabs.forEach((tab, i) => tab.setAttribute("aria-selected", String(i === index)));
      panels.forEach((panel, i) => { panel.hidden = i !== index; });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => show(i));
      tab.addEventListener("keydown", (event) => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(i); return; }
        if (!(event.key in keys)) return;
        event.preventDefault();
        const next = (i + keys[event.key] + tabs.length) % tabs.length;
        show(next);
        tabs[next].focus();
      });
    });
  };
  const track = document.querySelector("[data-track]");
  if (track) tabGroup([...track.querySelectorAll('[role="tab"]')], [...track.querySelectorAll(".track-note p")]);
  const apps = document.querySelector("[data-apps]");
  if (apps) tabGroup([...apps.querySelectorAll('[role="tab"]')], [...apps.querySelectorAll('[role="tabpanel"]')]);

  /* ── Network diagram ────────────────────────────── */
  document.querySelectorAll("[data-topo]").forEach((topo) => {
    const caption = topo.querySelector("[data-topo-caption]");
    const nodes = [...topo.querySelectorAll(".node")];
    const links = [...topo.querySelectorAll(".links path")];
    let active = null;
    const paint = () => { caption.textContent = pick(active || caption); };
    const choose = (node) => {
      active = active === node ? null : node;
      const id = active?.dataset.id;
      nodes.forEach((other) => other.classList.toggle("on", other === active));
      links.forEach((path) => path.classList.toggle("hot", !!id && (path.dataset.a === id || path.dataset.b === id)));
      paint();
    };
    nodes.forEach((node) => {
      node.addEventListener("click", () => choose(node));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(node); }
      });
    });
    onLang.push(paint);
    paint();
  });

  /* ── More projects: filters ─────────────────────── */
  const filterButtons = document.querySelectorAll("[data-filter]");
  const rows = document.querySelectorAll(".idx li");
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const wanted = button.dataset.filter;
      filterButtons.forEach((other) => other.classList.toggle("on", other === button));
      rows.forEach((row) => { row.hidden = !(wanted === "all" || row.dataset.cat === wanted); });
    });
  });

  /* ── Copy email ─────────────────────────────────── */
  const mail = document.querySelector("[data-copy]");
  const mailLabel = document.querySelector("[data-copy-label]");
  let copied = false;
  const paintMail = () => { if (mailLabel) mailLabel.textContent = pick(mailLabel, copied ? "ok" : ""); };
  const copyEmail = async () => {
    if (!mail) return;
    try {
      await navigator.clipboard.writeText(mail.dataset.copy);
      copied = true;
      paintMail();
      setTimeout(() => { copied = false; paintMail(); }, 1800);
    } catch (e) {
      window.location.href = `mailto:${mail.dataset.copy}`;
    }
  };
  mail?.addEventListener("click", copyEmail);
  onLang.push(paintMail);
  paintMail();

  /* ── Command menu (Ctrl K) ──────────────────────── */
  const palette = document.querySelector("[data-palette]");
  if (palette && typeof palette.showModal === "function") {
    const input = palette.querySelector("[data-palette-input]");
    const items = [...palette.querySelectorAll("[data-run]")];
    let selected = 0;
    const visibleItems = () => items.filter((item) => !item.hidden);
    const paintSel = () => {
      const list = visibleItems();
      selected = Math.max(0, Math.min(selected, list.length - 1));
      items.forEach((item) => item.classList.remove("sel"));
      list[selected]?.classList.add("sel");
      list[selected]?.scrollIntoView({ block: "nearest" });
    };
    const label = () => {
      items.forEach((item) => { item.textContent = pick(item); });
      input.placeholder = pick(input, "ph");
    };
    const filter = () => {
      const query = input.value.trim().toLowerCase();
      items.forEach((item) => { item.hidden = !!query && !item.textContent.toLowerCase().includes(query); });
      selected = 0;
      paintSel();
    };
    const open = () => {
      if (palette.open) return;
      label();
      input.value = "";
      filter();
      palette.showModal();
      input.focus();
    };
    const run = (item) => {
      if (!item) return;
      const [kind, ...rest] = item.dataset.run.split(":");
      const arg = rest.join(":");
      palette.close();
      if (kind === "go" && arg === "#top") window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      else if (kind === "go") document.querySelector(arg)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      else if (kind === "open") window.open(arg, "_blank", "noopener");
      else if (kind === "copy") copyEmail();
      else if (kind === "theme") toggleTheme();
      else if (kind === "lang") toggleLang();
    };
    document.querySelectorAll("[data-palette-open]").forEach((b) => b.addEventListener("click", open));
    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") { event.preventDefault(); selected += 1; paintSel(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); selected -= 1; paintSel(); }
      else if (event.key === "Enter") { event.preventDefault(); run(visibleItems()[selected]); }
    });
    items.forEach((item) => {
      item.addEventListener("click", () => run(item));
      item.addEventListener("pointermove", () => { selected = visibleItems().indexOf(item); paintSel(); });
    });
    palette.addEventListener("click", (event) => { if (event.target === palette) palette.close(); });
  }
})();
