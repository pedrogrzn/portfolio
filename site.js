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
      if (visible && !document.hidden && !reduceMotion) raf = requestAnimationFrame(frame);
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
  }

  /* ── Dock: highlight the section in view ────────── */
  const dockLinks = [...document.querySelectorAll(".dock a")];
  const dockTargets = dockLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const markDock = () => {
    const line = window.innerHeight * 0.4;
    let best = null;
    let bestTop = -Infinity;
    dockTargets.forEach((section) => {
      const top = section.getBoundingClientRect().top;
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
  const topo = document.querySelector("[data-topo]");
  if (topo) {
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
  }

  /* ── ECG demo: simulated trace and beat detection ─ */
  const ecg = document.querySelector("[data-ecg]");
  if (ecg) {
    const cv = ecg.querySelector("[data-ecg-canvas]");
    const ctx = cv.getContext("2d");
    const rateInput = ecg.querySelector("[data-ecg-rate]");
    const rateOut = ecg.querySelector("[data-ecg-rate-out]");
    const runButton = ecg.querySelector("[data-ecg-run]");
    const beatsOut = ecg.querySelector("[data-ecg-beats]");
    const bpmOut = ecg.querySelector("[data-ecg-bpm]");
    const flag = ecg.querySelector("[data-ecg-flag]");
    const seconds = 8;   // window shown
    const fs = 250;      // samples per second
    let width = 0;
    let height = 0;
    let samples = [];
    let peaks = [];
    let found = [];
    let scan = -1;       // scan position in samples, -1 = idle
    let state = "idle";
    let raf = null;

    const bump = (u, centre, spread) => Math.exp(-((u - centre) ** 2) / (2 * spread * spread));
    // One heartbeat over u in [0, 1): P wave, QRS complex, T wave.
    const beat = (u) =>
      0.12 * bump(u, 0.2, 0.035) - 0.16 * bump(u, 0.37, 0.012) + 1.0 * bump(u, 0.4, 0.014) -
      0.24 * bump(u, 0.435, 0.014) + 0.26 * bump(u, 0.64, 0.05);

    // Build the signal with a little rate jitter and noise, then find R peaks:
    // local maxima above a threshold, with a refractory period.
    const build = () => {
      const bpm = Number(rateInput.value);
      const period = 60 / bpm;
      const n = seconds * fs;
      const starts = [];
      for (let t = 0.15; t < seconds; t += period * (1 + (Math.random() - 0.5) * 0.06)) starts.push(t);
      samples = new Array(n);
      for (let i = 0; i < n; i += 1) {
        const s = i / fs;
        let v = 0;
        for (const start of starts) {
          const u = (s - start) / period;
          if (u >= 0 && u < 1) v += beat(u);
        }
        samples[i] = v + Math.sin(s * 2 * Math.PI * 0.3) * 0.03 + (Math.random() - 0.5) * 0.025;
      }
      peaks = [];
      const refractory = Math.round(0.25 * fs);
      for (let i = 1; i < n - 1; i += 1) {
        if (samples[i] > 0.6 && samples[i] >= samples[i - 1] && samples[i] > samples[i + 1]) {
          if (!peaks.length || i - peaks[peaks.length - 1] > refractory) peaks.push(i);
        }
      }
    };

    const setFlag = (kind) => {
      state = kind;
      flag.className = "ecg-flag" + (kind === "ok" ? " ok" : kind === "hi" || kind === "lo" ? " warn" : "");
      flag.textContent = pick(flag, kind);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const grid = cssVar("--rule");
      const accent = cssVar("--accent");
      const ink = cssVar("--ink");
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      for (let x = 0; x <= width; x += width / (seconds * 5)) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y <= height; y += height / 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      const px = (i) => (i / samples.length) * width;
      const py = (v) => height * 0.68 - v * height * 0.5;
      const stroke = (upTo, color, lineWidth) => {
        ctx.beginPath();
        for (let i = 0; i <= upTo; i += 1) {
          if (i === 0) ctx.moveTo(px(i), py(samples[i])); else ctx.lineTo(px(i), py(samples[i]));
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };
      stroke(samples.length - 1, ink, 1.4);
      if (scan >= 0) {
        stroke(Math.min(Math.floor(scan), samples.length - 1), accent, 1.8);
        ctx.fillStyle = accent;
        ctx.fillRect(px(scan), 0, 1.5, height);
      }
      found.forEach((i) => {
        ctx.beginPath();
        ctx.arc(px(i), py(samples[i]), 4.5, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
      });
    };

    const finish = () => {
      scan = samples.length - 1;
      found = peaks.slice();
      const gaps = [];
      for (let i = 1; i < found.length; i += 1) gaps.push((found[i] - found[i - 1]) / fs);
      const bpm = gaps.length ? 60 / (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
      beatsOut.textContent = String(found.length);
      bpmOut.textContent = bpm ? `${Math.round(bpm)} bpm` : "—";
      setFlag(bpm > 100 ? "hi" : bpm && bpm < 60 ? "lo" : "ok");
      runButton.disabled = false;
      draw();
    };

    const run = () => {
      cancelAnimationFrame(raf);
      build();
      found = [];
      beatsOut.textContent = "0";
      bpmOut.textContent = "—";
      setFlag("idle");
      if (reduceMotion) { finish(); return; }
      runButton.disabled = true;
      scan = 0;
      const speed = samples.length / 2200; // about 2.2 s for the whole window
      let last = performance.now();
      const step = (now) => {
        scan = Math.min(samples.length - 1, scan + (now - last) * speed);
        last = now;
        const idx = Math.floor(scan);
        while (found.length < peaks.length && peaks[found.length] <= idx) {
          found.push(peaks[found.length]);
          beatsOut.textContent = String(found.length);
        }
        draw();
        if (idx >= samples.length - 1) finish();
        else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      runButton.disabled = false;
      scan = -1;
      found = [];
      beatsOut.textContent = "—";
      bpmOut.textContent = "—";
      build();
      setFlag("idle");
      draw();
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = cv.clientWidth;
      height = cv.clientHeight;
      cv.width = Math.round(width * ratio);
      cv.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };

    rateInput.addEventListener("input", () => { rateOut.textContent = rateInput.value; reset(); });
    runButton.addEventListener("click", run);
    window.addEventListener("resize", resize);
    onLang.push(() => setFlag(state));
    onTheme.push(draw);
    build();
    setFlag("idle");
    resize();
  }

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
      if (kind === "go") document.querySelector(arg)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
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
