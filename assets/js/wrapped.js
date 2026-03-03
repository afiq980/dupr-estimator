/* wrapped.js — DUPR Wrapped video generator */
(function () {
  const W = 720;
  const H = 1280;
  const SLIDE_MS = 3500;
  const FADE_MS = 500;
  const FPS = 30;

  // ─── Slide list ──────────────────────────────────────────────────────────────
  function buildSlides(data) {
    const slides = [{ type: "intro" }];
    slides.push({ type: "matches" });
    if (data.overallRating != null) slides.push({ type: "overall" });
    if (data.earliestEst != null && data.latestEst != null) slides.push({ type: "trend" });
    if (data.bestEventName) slides.push({ type: "bestEvent" });
    if (data.bestTeammate) slides.push({ type: "bestTeammate" });
    if (data.hardestOpponent) slides.push({ type: "hardestOpponent" });
    if (data.easiestOpponent) slides.push({ type: "easiestOpponent" });
    slides.push({ type: "playStyle" });
    slides.push({ type: "outro" });
    return slides;
  }

  // ─── Drawing helpers ─────────────────────────────────────────────────────────
  function grad(ctx, ...stops) {
    const g = ctx.createLinearGradient(W * 0.15, 0, W * 0.85, H);
    stops.forEach(([p, c]) => g.addColorStop(p, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function txt(ctx, text, x, y, { size = 44, color = "#fff", align = "center", weight = "700", maxW = null } = {}) {
    ctx.save();
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    if (maxW) {
      wrapText(ctx, text, x, y, maxW, size * 1.45);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(" ");
    let line = "";
    let curY = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, curY);
        line = word;
        curY += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, curY);
  }

  function pill(ctx, label, x, y, { bg = "rgba(255,255,255,0.15)", color = "#fff", size = 30 } = {}) {
    ctx.save();
    ctx.font = `600 ${size}px -apple-system, sans-serif`;
    const w = ctx.measureText(label).width + size * 1.4;
    const h = size * 1.8;
    ctx.fillStyle = bg;
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  // ─── Slide renderers ─────────────────────────────────────────────────────────
  const RENDERERS = {
    intro(ctx, d) {
      grad(ctx, [0, "#0d001a"], [0.5, "#4c1d95"], [1, "#7c3aed"]);
      txt(ctx, "🏓", W / 2, H * 0.28, { size: 120, weight: "400" });
      txt(ctx, "DUPR", W / 2, H * 0.44, { size: 110, color: "#ede9fe" });
      txt(ctx, "WRAPPED", W / 2, H * 0.555, { size: 96, color: "#ffffff" });
      txt(ctx, d.userName, W / 2, H * 0.69, { size: 46, color: "#c4b5fd", weight: "500" });
      pill(ctx, "Unofficial fan tool", W / 2, H * 0.8, { size: 26, color: "#ddd6fe" });
    },

    matches(ctx, d) {
      grad(ctx, [0, "#0c1445"], [0.6, "#1d4ed8"], [1, "#2563eb"]);
      txt(ctx, "You played", W / 2, H * 0.34, { size: 46, color: "#bfdbfe", weight: "400" });
      txt(ctx, String(d.matchCount), W / 2, H * 0.495, { size: 176, color: "#ffffff" });
      const matchLabel = d.matchCount === 1 ? "match" : "matches";
      txt(ctx, d.earliestMatchDate ? `${matchLabel} since ${d.earliestMatchDate}` : matchLabel, W / 2, H * 0.63, { size: d.earliestMatchDate ? 38 : 48, color: "#bfdbfe", weight: "400" });
    },

    overall(ctx, d) {
      grad(ctx, [0, "#052e16"], [0.55, "#15803d"], [1, "#16a34a"]);
      txt(ctx, "Your estimated", W / 2, H * 0.33, { size: 44, color: "#bbf7d0", weight: "400" });
      txt(ctx, "DUPR", W / 2, H * 0.405, { size: 44, color: "#bbf7d0", weight: "400" });
      txt(ctx, d.overallRating.toFixed(3), W / 2, H * 0.545, { size: 152, color: "#ffffff" });
      pill(ctx, "all matches", W / 2, H * 0.68, { bg: "rgba(0,0,0,0.25)", color: "#86efac", size: 30 });
    },

    trend(ctx, d) {
      const improved = d.latestEst >= d.earliestEst;
      const startLabel = d.trendStartLabel || "Then (first 20%)";
      const endLabel = d.trendEndLabel || "Now (last 20%)";
      const footerLabel = d.trendFooterLabel || "last 20% vs first 20% of matches";
      const pillLabel = d.trendGroupPill || (d.trendGroupSize ? `${d.trendGroupSize} matches per group` : "");
      grad(ctx, improved ? [0, "#0f172a"] : [0, "#1c0505"], [0.5, improved ? "#0369a1" : "#991b1b"], [1, improved ? "#0284c7" : "#dc2626"]);
      txt(ctx, "Rating journey", W / 2, H * 0.26, { size: 48, color: improved ? "#bae6fd" : "#fecaca", weight: "400" });
      txt(ctx, startLabel, W / 2, H * 0.34, { size: 32, color: "rgba(255,255,255,0.6)", weight: "400" });
      txt(ctx, d.earliestEst.toFixed(3), W / 2, H * 0.42, { size: 90, color: "rgba(255,255,255,0.75)" });
      txt(ctx, "↓", W / 2, H * 0.535, { size: 110, color: improved ? "#4ade80" : "#f87171" });
      txt(ctx, endLabel, W / 2, H * 0.63, { size: 32, color: "rgba(255,255,255,0.6)", weight: "400" });
      txt(ctx, d.latestEst.toFixed(3), W / 2, H * 0.71, { size: 100, color: "#ffffff" });
      txt(ctx, footerLabel, W / 2, H * 0.8, { size: 34, color: "rgba(255,255,255,0.55)", weight: "400" });
      if (pillLabel) {
        pill(ctx, pillLabel, W / 2, H * 0.87, { bg: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", size: 26 });
      }
    },

    bestEvent(ctx, d) {
      grad(ctx, [0, "#1c1300"], [0.55, "#b45309"], [1, "#d97706"]);
      txt(ctx, "Best performance at", W / 2, H * 0.3, { size: 40, color: "#fde68a", weight: "400" });
      txt(ctx, d.bestEventName, W / 2, H * 0.47, { size: 54, color: "#ffffff", maxW: W * 0.82 });
      txt(ctx, d.bestEventRating.toFixed(3), W / 2, H * 0.645, { size: 120, color: "#fcd34d" });
      pill(ctx, "DUPR rating", W / 2, H * 0.755, { bg: "rgba(0,0,0,0.25)", color: "#fef3c7", size: 28 });
    },

    bestTeammate(ctx, d) {
      grad(ctx, [0, "#1a0020"], [0.55, "#86198f"], [1, "#a21caf"]);
      txt(ctx, "Best teammate", W / 2, H * 0.28, { size: 46, color: "#f0abfc", weight: "400" });
      txt(ctx, d.bestTeammate.name, W / 2, H * 0.445, { size: 62, color: "#ffffff", maxW: W * 0.82 });
      txt(ctx, d.bestTeammate.winPct.toFixed(1) + "%", W / 2, H * 0.595, { size: 130, color: "#e879f9" });
      txt(ctx, "win rate together", W / 2, H * 0.7, { size: 38, color: "#e879f9", weight: "400" });
      txt(ctx, `${d.bestTeammate.matches} matches`, W / 2, H * 0.775, { size: 34, color: "rgba(255,255,255,0.5)", weight: "400" });
    },

    hardestOpponent(ctx, d) {
      grad(ctx, [0, "#1a0000"], [0.55, "#991b1b"], [1, "#b91c1c"]);
      txt(ctx, "Your nemesis", W / 2, H * 0.28, { size: 48, color: "#fca5a5", weight: "400" });
      txt(ctx, d.hardestOpponent.name, W / 2, H * 0.445, { size: 62, color: "#ffffff", maxW: W * 0.82 });
      txt(ctx, d.hardestOpponent.lossPct.toFixed(1) + "%", W / 2, H * 0.595, { size: 130, color: "#f87171" });
      txt(ctx, "loss rate against them", W / 2, H * 0.7, { size: 38, color: "#f87171", weight: "400" });
      txt(ctx, `${d.hardestOpponent.matches} matches`, W / 2, H * 0.775, { size: 34, color: "rgba(255,255,255,0.5)", weight: "400" });
    },

    easiestOpponent(ctx, d) {
      grad(ctx, [0, "#001a0a"], [0.55, "#047857"], [1, "#059669"]);
      txt(ctx, "Easiest opponent", W / 2, H * 0.28, { size: 46, color: "#6ee7b7", weight: "400" });
      txt(ctx, d.easiestOpponent.name, W / 2, H * 0.445, { size: 62, color: "#ffffff", maxW: W * 0.82 });
      txt(ctx, d.easiestOpponent.lossPct.toFixed(1) + "%", W / 2, H * 0.595, { size: 130, color: "#34d399" });
      txt(ctx, "loss rate against them", W / 2, H * 0.7, { size: 38, color: "#34d399", weight: "400" });
      txt(ctx, `${d.easiestOpponent.matches} matches`, W / 2, H * 0.775, { size: 34, color: "rgba(255,255,255,0.5)", weight: "400" });
    },

    playStyle(ctx, d) {
      grad(ctx, [0, "#0f1b33"], [0.55, "#1e40af"], [1, "#2563eb"]);
      txt(ctx, "You play", W / 2, H * 0.32, { size: 46, color: "#bfdbfe", weight: "400" });
      const w = d.lowerVsHigherWord.toUpperCase();
      txt(ctx, w, W / 2, H * 0.46, { size: 96, color: "#60a5fa" });
      txt(ctx, "with lower-rated teammates", W / 2, H * 0.575, { size: 38, color: "#93c5fd", weight: "400", maxW: W * 0.78 });
      const closeLabel = d.closeVsAllWord === "better" ? "🎯 Close partners = better results" : d.closeVsAllWord === "worse" ? "⚡ Mixed ratings = better results" : "🔄 Partner rating doesn't matter much";
      pill(ctx, closeLabel, W / 2, H * 0.72, { bg: "rgba(255,255,255,0.12)", color: "#e0f2fe", size: 28 });
    },

    outro(ctx, d) {
      grad(ctx, [0, "#0d001a"], [0.5, "#4c1d95"], [1, "#7c3aed"]);
      txt(ctx, "🏓", W / 2, H * 0.3, { size: 110, weight: "400" });
      txt(ctx, "Keep playing,", W / 2, H * 0.48, { size: 52, color: "#ddd6fe", weight: "400" });
      txt(ctx, d.userName + "!", W / 2, H * 0.575, { size: 68, color: "#ffffff" });
      txt(ctx, "See you on the court.", W / 2, H * 0.71, { size: 36, color: "#a78bfa", weight: "400" });
      pill(ctx, "Unofficial DUPR fan tool", W / 2, H * 0.82, { bg: "rgba(255,255,255,0.1)", color: "#c4b5fd", size: 26 });
    },
  };

  // ─── Progress bar ─────────────────────────────────────────────────────────────
  function drawProgressBar(ctx, slideIdx, total, progress) {
    const barH = 5;
    const gap = 8;
    const totalW = W - 48;
    const segW = (totalW - gap * (total - 1)) / total;
    ctx.save();
    for (let i = 0; i < total; i++) {
      const x = 24 + i * (segW + gap);
      const y = 36;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.roundRect(x, y, segW, barH, 3);
      ctx.fill();
      let fill = 0;
      if (i < slideIdx) fill = 1;
      else if (i === slideIdx) fill = progress;
      if (fill > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.roundRect(x, y, segW * fill, barH, 3);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ─── Animation + recording ────────────────────────────────────────────────────
  const DEFAULT_WRAPPED_BTN = "🎬 Generate Wrapped";
  const READY_WRAPPED_BTN = "🎬 Download Wrapped";
  const PREPARING_WRAPPED_BTN = "🎬 Preparing Wrapped…";
  let foregroundSession = null;
  let backgroundSession = null;
  let wrappedCache = null; // { key, blob, filename }
  let webmMuxerModulePromise = null;
  let activeVideoUrl = null;

  function safeFilename(userName, ext = "webm") {
    const name = (userName || "player").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return `dupr-wrapped-${name || "player"}.${ext}`;
  }

  function extFromMime(mimeType) {
    return String(mimeType || "").includes("mp4") ? "mp4" : "webm";
  }

  function canRecordMp4() {
    return typeof MediaRecorder !== "undefined" && (
      MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E")
      || MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
      || MediaRecorder.isTypeSupported("video/mp4")
    );
  }

  function pickRecorderMimeType() {
    const preferred = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm",
    ];
    for (const mime of preferred) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return "";
  }

  function wrappedDataKey(data) {
    try {
      return JSON.stringify(data || {});
    } catch (_) {
      return String(Date.now());
    }
  }

  function setWrappedButtonLabel(text) {
    const btn = document.getElementById("wrappedBtn");
    if (!btn) return;
    btn.textContent = text;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function showCanvasOnly() {
    const canvas = document.getElementById("wrappedCanvas");
    const video = document.getElementById("wrappedVideo");
    if (canvas) canvas.style.display = "block";
    if (video) {
      video.style.display = "none";
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (activeVideoUrl) {
      URL.revokeObjectURL(activeVideoUrl);
      activeVideoUrl = null;
    }
  }

  function showWrappedVideo(blob, statusEl) {
    const modal = document.getElementById("wrappedModal");
    const canvas = document.getElementById("wrappedCanvas");
    const video = document.getElementById("wrappedVideo");
    if (!modal || !video) return;

    modal.style.display = "flex";
    if (canvas) canvas.style.display = "none";

    if (activeVideoUrl) URL.revokeObjectURL(activeVideoUrl);
    activeVideoUrl = URL.createObjectURL(blob);

    video.style.display = "block";
    video.src = activeVideoUrl;
    video.currentTime = 0;
    video.play().catch(() => {});
    if (statusEl) statusEl.textContent = "▶ Wrapped preview ready.";
  }

  function cancelSession(session) {
    if (!session) return;
    session.signal.cancelled = true;
    if (typeof session.cancel === "function") session.cancel();
    if (session.rafId) cancelAnimationFrame(session.rafId);
    if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop();
  }

  function renderFrameAtTime(ctx, slides, data, tMs) {
    const cycleDuration = SLIDE_MS + FADE_MS;
    const maxIdx = Math.max(0, slides.length - 1);
    const rawIdx = Math.floor(tMs / cycleDuration);
    const slideIdx = Math.min(maxIdx, rawIdx);
    const elapsed = tMs - rawIdx * cycleDuration;
    const progress = Math.min(elapsed / cycleDuration, 1);

    let alpha = 1;
    if (elapsed < FADE_MS) alpha = elapsed / FADE_MS;
    else if (elapsed > SLIDE_MS) alpha = 1 - (elapsed - SLIDE_MS) / FADE_MS;
    alpha = Math.min(1, Math.max(0, alpha));

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = alpha;
    RENDERERS[slides[slideIdx].type](ctx, data);
    ctx.globalAlpha = 1;
    drawProgressBar(ctx, slideIdx, slides.length, progress);
  }

  function getWebmMuxerModule() {
    if (!webmMuxerModulePromise) {
      webmMuxerModulePromise = import("https://esm.sh/webm-muxer@5.1.4");
    }
    return webmMuxerModulePromise;
  }

  async function renderToBlobFast(data, { canvas, statusEl, showModal, signal }) {
    const modal = document.getElementById("wrappedModal");
    const ctx = canvas.getContext("2d");
    if (!ctx || !window.VideoEncoder || !window.VideoFrame) return null;

    canvas.width = W;
    canvas.height = H;
    if (showModal && modal) modal.style.display = "flex";
    if (statusEl) statusEl.textContent = "⚡ Fast exporting in background…";

    const slides = buildSlides(data);
    const totalDurationMs = slides.length * (SLIDE_MS + FADE_MS);
    const frameCount = Math.max(1, Math.ceil((totalDurationMs / 1000) * FPS));

    let muxer;
    let encoder;
    try {
      const { Muxer, ArrayBufferTarget } = await getWebmMuxerModule();
      if (signal.cancelled) return null;

      const codecConfig = {
        codec: "vp09.00.10.08",
        width: W,
        height: H,
        framerate: FPS,
        bitrate: 4_500_000,
        latencyMode: "quality",
      };
      const support = await VideoEncoder.isConfigSupported(codecConfig);
      if (!support || !support.supported) return null;
      if (signal.cancelled) return null;

      const target = new ArrayBufferTarget();
      muxer = new Muxer({
        target,
        video: { codec: "V_VP9", width: W, height: H, frameRate: FPS },
      });

      encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: () => {},
      });
      encoder.configure(codecConfig);

      const frameDurationUs = Math.round(1_000_000 / FPS);
      for (let i = 0; i < frameCount; i++) {
        if (signal.cancelled) return null;
        const tMs = (i * 1000) / FPS;
        renderFrameAtTime(ctx, slides, data, tMs);
        const frame = new VideoFrame(canvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });
        encoder.encode(frame, { keyFrame: i % FPS === 0 });
        frame.close();

        if (i % 20 === 0) {
          if (statusEl && showModal) {
            const pct = Math.min(100, Math.round((i / frameCount) * 100));
            statusEl.textContent = `⚡ Fast exporting… ${pct}%`;
          }
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (signal.cancelled) return null;
      await encoder.flush();
      muxer.finalize();
      const out = target.buffer;
      if (!out || signal.cancelled) return null;
      return new Blob([out], { type: "video/webm" });
    } catch (_) {
      return null;
    } finally {
      try {
        if (encoder && encoder.state !== "closed") encoder.close();
      } catch (_) {}
    }
  }

  function renderToBlob(data, { canvas, statusEl, showModal, signal, onFrame }) {
    return new Promise((resolve) => {
      const modal = document.getElementById("wrappedModal");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      canvas.width = W;
      canvas.height = H;

      if (showModal && modal) modal.style.display = "flex";

      const slides = buildSlides(data);
      const cycleDuration = SLIDE_MS + FADE_MS;
      let slideIdx = 0;
      let slideStart = null;
      let rafId = null;
      let recorder = null;
      const chunks = [];
      let recording = false;
      let finished = false;

      function finish(blobOrNull) {
        if (finished) return;
        finished = true;
        if (rafId) cancelAnimationFrame(rafId);
        if (onFrame) onFrame({ rafId: null, recorder });
        resolve(blobOrNull);
      }

      try {
        const stream = canvas.captureStream(FPS);
        const mime = pickRecorderMimeType();
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => {
          if (signal.cancelled || chunks.length === 0) {
            finish(null);
            return;
          }
          finish(new Blob(chunks, { type: mime && mime.includes("mp4") ? "video/mp4" : "video/webm" }));
        };
        recorder.start();
        recording = true;
        if (statusEl) {
          statusEl.textContent = mime && mime.includes("mp4")
            ? "⏺ Recording MP4…"
            : "⏺ Recording…";
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = "Preview only (recording not supported in this browser).";
      }

      function animate(ts) {
        if (signal.cancelled) {
          if (recording && recorder && recorder.state !== "inactive") recorder.stop();
          else finish(null);
          return;
        }

        if (!slideStart) slideStart = ts;
        const elapsed = ts - slideStart;
        const progress = Math.min(elapsed / cycleDuration, 1);

        let alpha = 1;
        if (elapsed < FADE_MS) alpha = elapsed / FADE_MS;
        else if (elapsed > SLIDE_MS) alpha = 1 - (elapsed - SLIDE_MS) / FADE_MS;
        alpha = Math.min(1, Math.max(0, alpha));

        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = alpha;
        RENDERERS[slides[slideIdx].type](ctx, data);
        ctx.globalAlpha = 1;
        drawProgressBar(ctx, slideIdx, slides.length, progress);

        if (elapsed >= cycleDuration) {
          slideIdx += 1;
          slideStart = ts;
          if (slideIdx >= slides.length) {
            if (recording && recorder && recorder.state !== "inactive") recorder.stop();
            else finish(null);
            return;
          }
        }

        rafId = requestAnimationFrame(animate);
        if (onFrame) onFrame({ rafId, recorder });
      }

      rafId = requestAnimationFrame(animate);
      if (onFrame) onFrame({ rafId, recorder });
    });
  }

  function prepareWrappedInBackground(data) {
    if (!data) return;
    const key = wrappedDataKey(data);

    if (wrappedCache && wrappedCache.key === key) {
      setWrappedButtonLabel(READY_WRAPPED_BTN);
      return;
    }
    if (backgroundSession && backgroundSession.key === key) {
      setWrappedButtonLabel(PREPARING_WRAPPED_BTN);
      return;
    }

    cancelSession(backgroundSession);
    backgroundSession = null;
    wrappedCache = null;
    setWrappedButtonLabel(PREPARING_WRAPPED_BTN);

    const hiddenCanvas = document.createElement("canvas");
    const signal = { cancelled: false };
    const session = { key, signal, rafId: null, recorder: null };
    backgroundSession = session;

    const useMp4Path = canRecordMp4();
    const startPromise = useMp4Path
      ? Promise.resolve(null)
      : renderToBlobFast(data, {
          canvas: hiddenCanvas,
          statusEl: null,
          showModal: false,
          signal,
        });

    startPromise
      .then((fastBlob) => {
        if (signal.cancelled) return null;
        if (fastBlob) return fastBlob;
        return renderToBlob(data, {
          canvas: hiddenCanvas,
          statusEl: null,
          showModal: false,
          signal,
          onFrame: ({ rafId, recorder }) => {
            session.rafId = rafId;
            session.recorder = recorder;
          },
        });
      })
      .then((blob) => {
        if (signal.cancelled) return;
        backgroundSession = null;
        if (!blob) {
          setWrappedButtonLabel(DEFAULT_WRAPPED_BTN);
          return;
        }
        wrappedCache = { key, blob, filename: safeFilename(data.userName, extFromMime(blob.type)) };
        setWrappedButtonLabel(READY_WRAPPED_BTN);
      });
  }

  function startWrapped(data, options = {}) {
    if (!data) return;
    const mode = options.mode === "view" ? "view" : "download";
    const key = wrappedDataKey(data);
    const statusEl = document.getElementById("wrappedStatus");
    showCanvasOnly();

    if (wrappedCache && wrappedCache.key === key) {
      if (mode === "view") {
        showWrappedVideo(wrappedCache.blob, statusEl);
      } else {
        downloadBlob(wrappedCache.blob, wrappedCache.filename);
        if (statusEl) statusEl.textContent = "✅ Downloaded pre-generated Wrapped video.";
      }
      return;
    }

    cancelSession(backgroundSession);
    backgroundSession = null;
    cancelSession(foregroundSession);
    foregroundSession = null;

    const canvas = document.getElementById("wrappedCanvas");
    if (!canvas) return;
    const signal = { cancelled: false };
    const session = { signal, rafId: null, recorder: null };
    foregroundSession = session;
    setWrappedButtonLabel(PREPARING_WRAPPED_BTN);

    const useMp4Path = canRecordMp4();
    const startPromise = useMp4Path
      ? Promise.resolve(null)
      : renderToBlobFast(data, {
          canvas,
          statusEl,
          showModal: true,
          signal,
        });

    startPromise
      .then((fastBlob) => {
        if (signal.cancelled) return null;
        if (fastBlob) return fastBlob;
        return renderToBlob(data, {
          canvas,
          statusEl,
          showModal: true,
          signal,
          onFrame: ({ rafId, recorder }) => {
            session.rafId = rafId;
            session.recorder = recorder;
          },
        });
      })
      .then((blob) => {
        if (signal.cancelled) return;
        foregroundSession = null;
        if (!blob) return;
        wrappedCache = { key, blob, filename: safeFilename(data.userName, extFromMime(blob.type)) };
        if (mode === "view") {
          showWrappedVideo(blob, statusEl);
        } else {
          downloadBlob(blob, wrappedCache.filename);
          if (statusEl) statusEl.textContent = "✅ Video downloaded!";
        }
        setWrappedButtonLabel(READY_WRAPPED_BTN);
      });
  }

  function viewWrapped(data) {
    startWrapped(data, { mode: "view" });
  }

  function closeWrapped() {
    const modal = document.getElementById("wrappedModal");
    if (modal) modal.style.display = "none";
    cancelSession(foregroundSession);
    foregroundSession = null;
    showCanvasOnly();
  }

  window.startWrapped = startWrapped;
  window.viewWrapped = viewWrapped;
  window.closeWrapped = closeWrapped;
  window.prepareWrappedInBackground = prepareWrappedInBackground;
})();
