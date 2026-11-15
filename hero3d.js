/* Hero in 3D: the name as an object in a quiet scene, with a data flow behind
   and around it: thin lines at different depths that drift, narrow as they
   pass through the name, and carry small packets of light. The camera drifts
   with the cursor and travels into the name on scroll. Falls back to the
   flat hero (dot field + HTML name) when WebGL is unavailable. */
(() => {
  const hero = document.querySelector(".hero");
  const nameEl = document.querySelector("[data-name]");
  if (!hero || !nameEl) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return;

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  (async () => {
    let THREE;
    try {
      THREE = await import("three");
      await document.fonts.ready;
    } catch (e) {
      return; // offline or CDN blocked: keep the flat hero
    }

    const canvas = document.createElement("canvas");
    canvas.className = "stage";
    canvas.setAttribute("aria-hidden", "true");
    hero.prepend(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    const BASE_Z = 8;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, 0, BASE_Z);

    // Far backdrop with a soft glow.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 512;
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(44, 24), new THREE.MeshBasicMaterial({ map: glowTex, depthWrite: false }));
    backdrop.position.set(0, 0.6, -8);
    scene.add(backdrop);

    // The name, drawn to a texture that matches the HTML layout exactly.
    const textCanvas = document.createElement("canvas");
    // WebGL2 textures are allocated once at a fixed size, so when the canvas
    // size changes (window resize) the texture has to be recreated.
    const makeTextTex = () => {
      const tex = new THREE.CanvasTexture(textCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    };
    let textTex = makeTextTex();
    const textMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        map: { value: textTex }, opacity: { value: 0 }, accent: { value: new THREE.Color() },
        cursor: { value: new THREE.Vector2(-9, -9) }, sizePx: { value: new THREE.Vector2(1, 1) }, on: { value: 0 },
      },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform sampler2D map; uniform float opacity; uniform vec3 accent; uniform vec2 cursor; uniform vec2 sizePx; uniform float on;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.02) discard;
          float d = length((vUv - cursor) * sizePx);
          float g = pow(clamp(1.0 - d / 260.0, 0.0, 1.0), 1.15) * on;
          gl_FragColor = vec4(mix(c.rgb, accent, g), c.a * opacity);
          #include <colorspace_fragment>
        }`,
    });
    const text = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), textMat);
    text.renderOrder = 2;
    scene.add(text);

    /* ── Data flow ─────────────────────────────────── */
    const rand = (() => { let s = 20261115; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const LINES = 22;
    const SEG = 180;
    const PACKETS = 2;
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = dotCanvas.height = 64;
    {
      const g = dotCanvas.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    const dotTex = new THREE.CanvasTexture(dotCanvas);
    const lines = [];
    for (let i = 0; i < LINES; i += 1) {
      const z = -4 + rand() * 5.2;                 // mostly behind the name, a few in front
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
      const front = z > 0.2;
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, vertexColors: true });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = front ? 3 : 1;
      line.frustumCulled = false;
      scene.add(line);
      lines.push({
        geo, mat, z,
        lane: (rand() - 0.5) * 2,                  // -1..1 vertical lane
        amp: 0.06 + rand() * 0.22,
        k: 0.35 + rand() * 0.7,
        k2: 0.9 + rand() * 1.2,
        ph: rand() * Math.PI * 2,
        sp: (0.12 + rand() * 0.28) * (rand() < 0.5 ? 1 : -1),
        alpha: front ? 0.07 + rand() * 0.06 : 0.1 + rand() * 0.2,
        packets: Array.from({ length: PACKETS }, () => ({ u: rand(), v: 0.035 + rand() * 0.05 })),
      });
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(LINES * PACKETS * 3), 3));
    const pMat = new THREE.PointsMaterial({ size: 0.075, map: dotTex, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true });
    const packets = new THREE.Points(pGeo, pMat);
    packets.renderOrder = 4;
    packets.frustumCulled = false;
    scene.add(packets);

    /* ── Data pulses on click ──────────────────────────
       Each pulse starts on a thread near the cursor and travels along it to
       the edge: a bright core with a soft halo, followed by a short trail of
       0s and 1s, while the thread lights up behind it. */
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = 256;
    atlasCanvas.height = 64;
    {
      const g = atlasCanvas.getContext("2d");
      g.fillStyle = "#fff";
      g.font = `600 46px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("0", 32, 34);
      g.fillText("1", 96, 34);
      const dot = (cx, r0, r1, stops) => {
        const gr = g.createRadialGradient(cx, 32, r0, cx, 32, r1);
        stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`));
        g.fillStyle = gr;
        g.fillRect(cx - 32, 0, 64, 64);
      };
      dot(160, 0, 30, [[0, 1], [0.3, 1], [0.6, 0.35], [1, 0]]);      // core
      dot(224, 0, 32, [[0, 0.55], [0.35, 0.22], [1, 0]]);            // halo
    }
    const POOL = 480;
    const bitGeo = new THREE.BufferGeometry();
    const bitPos = new Float32Array(POOL * 3).fill(1e5);
    const bitAlpha = new Float32Array(POOL);
    const bitGlyph = new Float32Array(POOL);
    const bitSize = new Float32Array(POOL);
    bitGeo.setAttribute("position", new THREE.BufferAttribute(bitPos, 3));
    bitGeo.setAttribute("alpha", new THREE.BufferAttribute(bitAlpha, 1));
    bitGeo.setAttribute("glyph", new THREE.BufferAttribute(bitGlyph, 1));
    bitGeo.setAttribute("psize", new THREE.BufferAttribute(bitSize, 1));
    const bitMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { atlas: { value: new THREE.CanvasTexture(atlasCanvas) }, color: { value: new THREE.Color() }, glint: { value: new THREE.Color() }, scale: { value: 1 } },
      vertexShader: `
        attribute float alpha; attribute float glyph; attribute float psize; uniform float scale;
        varying float vA; varying float vG;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
          vA = alpha; vG = glyph;
        }`,
      fragmentShader: `
        uniform sampler2D atlas; uniform vec3 color; uniform vec3 glint; varying float vA; varying float vG;
        void main() {
          float a = texture2D(atlas, vec2((gl_PointCoord.x + vG) * 0.25, 1.0 - gl_PointCoord.y)).a * vA;
          if (a < 0.01) discard;
          vec3 c = vG > 2.5 ? glint : color;
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    const bitPoints = new THREE.Points(bitGeo, bitMat);
    bitPoints.renderOrder = 5;
    bitPoints.frustumCulled = false;
    scene.add(bitPoints);
    const pulses = [];   // { L, x, dir, v, delay, glyphs }
    const TRAIL = 5;
    const GAP = 0.11;

    let H = 0;
    let wpp = 0;          // world units per CSS pixel at z = 0
    let narrow = false;
    const band = { x: 0, y: 0, halfW: 3, halfH: 0.8, spread: 2.6 };

    // y of a flow line at x, time t: lanes spread out at the edges and gather
    // into the band of the name as they pass through it.
    const flowY = (L, x, t) => {
      const d = (x - band.x) / (band.halfW * 1.25);
      const pinch = Math.exp(-d * d);
      const lane = L.lane * (band.spread * (1 - pinch) + band.halfH * 0.9 * pinch);
      const wave = Math.sin(x * L.k + L.ph + t * L.sp) * L.amp + Math.sin(x * L.k2 - t * L.sp * 0.7 + L.ph * 2) * L.amp * 0.35;
      return band.y + lane + wave * (1 - pinch * 0.55);
    };
    const spanAt = (z) => (BASE_Z - z) * tanHalf * camera.aspect * 1.25;

    // Cursor, projected onto each line's depth plane.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const cursor = { x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0 };
    const hitAt = (z) => {
      const o = ray.ray.origin;
      const d = ray.ray.direction;
      const k = (z - o.z) / d.z;
      return { x: o.x + d.x * k, y: o.y + d.y * k };
    };
    const bend = (L, x, y, hit) => {
      if (cursor.on < 0.01) return y;
      const R = 0.95 * (BASE_Z - L.z) / BASE_Z;
      const dx = x - hit.x;
      const dy = y - hit.y;
      const f = Math.exp(-(dx * dx + dy * dy) / (R * R));
      // tanh keeps the push continuous across the cursor, so lines part smoothly.
      return y + Math.tanh(dy / (0.35 * R)) * f * R * 0.55 * cursor.on;
    };

    const tint = { base: new THREE.Color(), glow: new THREE.Color() };
    const updateFlow = (t, intro) => {
      cursor.x += (cursor.tx - cursor.x) * 0.18;
      cursor.y += (cursor.ty - cursor.y) * 0.18;
      cursor.on += (cursor.ton - cursor.on) * 0.08;
      ndc.set(cursor.x, -cursor.y);
      ray.setFromCamera(ndc, camera);
      lines.forEach((L) => {
        const X = spanAt(L.z);
        L.hit = hitAt(L.z);
        const arr = L.geo.attributes.position.array;
        const col = L.geo.attributes.color.array;
        const Rg = 1.6 * (BASE_Z - L.z) / BASE_Z;
        let near = 0;
        for (let s = 0; s < SEG; s += 1) {
          const x = -X + (2 * X * s) / (SEG - 1);
          const y = bend(L, x, flowY(L, x, t), L.hit);
          arr[s * 3] = x;
          arr[s * 3 + 1] = y;
          arr[s * 3 + 2] = L.z;
          const dx = x - L.hit.x;
          const dy = y - L.hit.y;
          let g = Math.exp(-(dx * dx + dy * dy) / (Rg * Rg)) * cursor.on;
          if (g > near) near = g;
          if (L.live) {
            for (const P of pulses) {
              if (P.L !== L || P.delay > 0) continue;
              const behind = (P.x - x) * P.dir;            // distance behind the head
              const lit = behind < 0 ? Math.max(0, 1 + behind / 0.12) : Math.max(0, 1 - behind / 1.6) ** 1.6;
              if (lit * 0.55 > g) g = lit * 0.55;
            }
          }
          col[s * 3] = tint.base.r + (tint.glow.r - tint.base.r) * g;
          col[s * 3 + 1] = tint.base.g + (tint.glow.g - tint.base.g) * g;
          col[s * 3 + 2] = tint.base.b + (tint.glow.b - tint.base.b) * g;
        }
        L.geo.attributes.position.needsUpdate = true;
        L.geo.attributes.color.needsUpdate = true;
        L.boost = (L.boost || 0) * 0.965;
        L.mat.opacity = Math.min(0.95, (L.alpha + L.boost * 0.6 + near * 0.45) * intro);
      });
      const pa = pGeo.attributes.position.array;
      let n = 0;
      lines.forEach((L) => {
        const X = spanAt(L.z);
        L.packets.forEach((P) => {
          const u = (((P.u + t * P.v * Math.sign(L.sp)) % 1) + 1) % 1;
          const x = -X + 2 * X * u;
          pa[n++] = x;
          pa[n++] = bend(L, x, flowY(L, x, t), L.hit);
          pa[n++] = L.z;
        });
      });
      pGeo.attributes.position.needsUpdate = true;
      // Pulses: accelerate along their thread and leave at the edge.
      const dt = Math.min(0.05, t - (updateFlow.last ?? t));
      updateFlow.last = t;
      lines.forEach((L) => { L.live = false; });
      let n2 = 0;
      const put = (x, y, z, a, glyph, size) => {
        if (n2 >= POOL) return;
        bitPos[n2 * 3] = x; bitPos[n2 * 3 + 1] = y; bitPos[n2 * 3 + 2] = z;
        bitAlpha[n2] = a; bitGlyph[n2] = glyph; bitSize[n2] = size;
        n2 += 1;
      };
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const P = pulses[i];
        if (P.delay > 0) { P.delay -= dt; continue; }
        P.age += dt;
        P.v = Math.min(P.v + dt * 2.6, 5.5);
        P.x += P.dir * P.v * dt;
        const X = spanAt(P.L.z);
        if (Math.abs(P.x) > X + 1) { pulses.splice(i, 1); continue; }
        P.L.live = true;
        P.L.boost = Math.max(P.L.boost || 0, 0.35);
        const fadeIn = Math.min(1, P.age * 8);
        const yAt = (x) => bend(P.L, x, flowY(P.L, x, t), P.L.hit);
        const hy = yAt(P.x);
        const flick = 0.6 + Math.sin(t * 23 + P.seed) * 0.4;       // shimmer of the glint
        put(P.x, hy, P.L.z, 0.12 * fadeIn * flick, 3, 0.2);         // faint warm glint
        put(P.x, hy, P.L.z, fadeIn, 2, 0.06);                      // one small dot
      }
      for (let j = n2; j < POOL; j += 1) { bitPos[j * 3 + 1] = 1e5; bitAlpha[j] = 0; }
      bitGeo.attributes.position.needsUpdate = true;
      bitGeo.attributes.alpha.needsUpdate = true;
      bitGeo.attributes.glyph.needsUpdate = true;
      bitGeo.attributes.psize.needsUpdate = true;
      pMat.opacity = 0.85 * intro;
    };

    const paintGlow = () => {
      const g = glowCanvas.getContext("2d");
      g.fillStyle = css("--bg");
      g.fillRect(0, 0, 512, 512);
      const grad = g.createRadialGradient(256, 236, 10, 256, 256, 280);
      const dark = document.documentElement.dataset.theme === "dark";
      grad.addColorStop(0, dark ? "rgba(255,255,255,0.045)" : "rgba(35,80,245,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 512, 512);
      glowTex.needsUpdate = true;
    };

    const paintText = () => {
      const hr = hero.getBoundingClientRect();
      const r = nameEl.getBoundingClientRect();
      if (!r.width) return;
      const cs = getComputedStyle(nameEl);
      const size = parseFloat(cs.fontSize);
      const k = Math.min(3, 4096 / r.width);
      textCanvas.width = Math.ceil(r.width * k);
      textCanvas.height = Math.ceil(r.height * k);
      const g = textCanvas.getContext("2d");
      g.clearRect(0, 0, textCanvas.width, textCanvas.height);
      g.font = `${cs.fontWeight} ${size * k}px ${cs.fontFamily}`;
      g.letterSpacing = `${-0.045 * size * k}px`;
      g.textBaseline = "middle";
      const lns = [];
      nameEl.querySelectorAll(".w").forEach((w) => {
        const b = w.getBoundingClientRect();
        let line = lns.find((l) => Math.abs(l.top - b.top) < size * 0.3);
        if (!line) { line = { top: b.top, bottom: b.bottom, left: b.left, right: b.right, words: [] }; lns.push(line); }
        line.left = Math.min(line.left, b.left);
        line.right = Math.max(line.right, b.right);
        line.words.push(w.textContent.replace(/\.$/, ""));
      });
      const last = lns[lns.length - 1];
      lns.forEach((l) => {
        const str = l.words.join(" ");
        const dot = l === last ? "." : "";
        const wStr = g.measureText(str).width;
        const wDot = dot ? g.measureText(dot).width : 0;
        const cx = ((l.left + l.right) / 2 - r.left) * k;
        const cy = ((l.top + l.bottom) / 2 - r.top) * k;
        const x0 = cx - (wStr + wDot) / 2;
        g.textAlign = "left";
        g.fillStyle = css("--ink");
        g.fillText(str, x0, cy);
        if (dot) { g.fillStyle = css("--accent"); g.fillText(dot, x0 + wStr, cy); }
      });
      if (textTex.image.width !== textTex.userData.w || textTex.image.height !== textTex.userData.h) {
        if (textTex.userData.w) {
          textTex.dispose();
          textTex = makeTextTex();
          textMat.uniforms.map.value = textTex;
        }
        textTex.userData.w = textCanvas.width;
        textTex.userData.h = textCanvas.height;
      }
      textTex.needsUpdate = true;
      text.scale.set(r.width * wpp, r.height * wpp, 1);
      textMat.uniforms.sizePx.value.set(r.width, r.height);
      text.position.set((r.left + r.width / 2 - hr.left - W / 2) * wpp, -(r.top + r.height / 2 - hr.top - H / 2) * wpp, 0);
      band.x = text.position.x;
      band.y = text.position.y;
      band.halfW = (r.width * wpp) / 2;
      band.halfH = (r.height * wpp) / 2;
      band.spread = band.halfH * (narrow ? 3.2 : 2.8);
    };

    const paintTheme = () => {
      renderer.setClearColor(css("--bg"), 1);
      const dark = document.documentElement.dataset.theme === "dark";
      // Neutral threads that turn blue around the cursor.
      tint.base.set(dark ? "#e8ebf2" : "#5b6378");
      tint.glow.set(dark ? "#6f93ff" : "#2350f5");
      textMat.uniforms.accent.value.set(css("--accent"));
      pMat.color.set(dark ? "#ffffff" : css("--accent"));
      bitMat.uniforms.color.value.set(dark ? "#b9c7f0" : "#3b5bd6");
      bitMat.uniforms.glint.value.set(dark ? "#ffd27a" : "#f2b640");
      paintGlow();
      paintText();
    };

    const resize = () => {
      W = hero.clientWidth;
      H = hero.clientHeight;
      narrow = W < 700;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      wpp = (2 * BASE_Z * tanHalf) / H;
      bitMat.uniforms.scale.value = (H * renderer.getPixelRatio() * 0.5) / tanHalf;
      paintText();
    };

    let kick = () => {};
    const sendBits = (clientX, clientY) => {
      const b = canvas.getBoundingClientRect();
      ndc.set(((clientX - b.left) / b.width) * 2 - 1, -(((clientY - b.top) / b.height) * 2 - 1));
      ray.setFromCamera(ndc, camera);
      const t = (performance.now() - t0) / 1000;
      // Threads that pass close to the click, at their own depth.
      const RADIUS = 0.75;
      const near = lines
        .map((L) => { const h = hitAt(L.z); return { L, h, d: Math.abs(flowY(L, h.x, t) - h.y) / ((BASE_Z - L.z) / BASE_Z) }; })
        .filter((n) => n.d < RADIUS * 1.6)
        .sort((a, c) => a.d - c.d)
        .slice(0, 9);
      if (!near.length) near.push(...lines.map((L) => { const h = hitAt(L.z); return { L, h, d: Math.abs(flowY(L, h.x, t) - h.y) }; }).sort((a, c) => a.d - c.d).slice(0, 4));
      const dir = ndc.x < 0 ? 1 : -1;                    // all travel to the far side
      near.forEach(({ L, h }, rank) => {
        L.boost = 1;
        const starts = rank < 4 ? 3 : 2;
        for (let k = 0; k < starts; k += 1) {
          pulses.push({
            L, dir, x: h.x + (Math.random() - 0.5) * RADIUS * 1.8, v: 0.8 + Math.random() * 0.6, age: 0,
            delay: rank * 0.04 + k * 0.12 + Math.random() * 0.08, seed: Math.random() * 10,
          });
        }
      });
      if (pulses.length > 60) pulses.splice(0, pulses.length - 60);
      kick();
    };
    hero.addEventListener("click", (e) => {
      if (reduceMotion || e.target.closest("a, button")) return;
      sendBits(e.clientX, e.clientY);
    });
    // Input
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
      const b = canvas.getBoundingClientRect();
      cursor.tx = ((e.clientX - b.left) / b.width) * 2 - 1;
      cursor.ty = ((e.clientY - b.top) / b.height) * 2 - 1;
      if (cursor.ton === 0) { cursor.x = cursor.tx; cursor.y = cursor.ty; }
      cursor.ton = e.clientY < b.bottom ? 1 : 0;
      kick();
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", () => { cursor.ton = 0; });

    let p = 0;
    const t0 = performance.now();
    let raf = null;
    const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

    const frame = (now) => {
      raf = null;
      const t = reduceMotion ? 0 : (now - t0) / 1000;
      const intro = reduceMotion ? 1 : ease(t / 1.6);
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const fly = ease(p);
      camera.position.set(0, -fly * 0.4, BASE_Z + (1 - intro) * 2 - fly * 4.8);
      camera.lookAt(0, -fly * 0.7, 0);
      updateFlow(t, intro);
      textMat.uniforms.opacity.value = intro;
      // Cursor position on the name plane, in the texture's uv space.
      const nh = hitAt(0);
      textMat.uniforms.cursor.value.set((nh.x - text.position.x) / text.scale.x + 0.5, (nh.y - text.position.y) / text.scale.y + 0.5);
      textMat.uniforms.on.value = cursor.on;
      renderer.render(scene, camera);
      if (!reduceMotion && !document.hidden && p < 1.15) raf = requestAnimationFrame(frame);
    };
    kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    window.addEventListener("scroll", () => {
      p = Math.min(1.2, Math.max(0, window.scrollY / window.innerHeight));
      kick();
    }, { passive: true });
    window.addEventListener("resize", () => { resize(); kick(); });
    document.addEventListener("visibilitychange", kick);
    new MutationObserver(() => { paintTheme(); kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    resize();
    paintTheme();
    document.documentElement.classList.add("gl");
    p = Math.min(1.2, Math.max(0, window.scrollY / window.innerHeight));
    kick();
  })();
})();
