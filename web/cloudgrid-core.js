// CloudGrid core — Govee H703B BLE protocol + image sampler.
// Self-contained, no build step: the packet encoder, BLE device wrapper, and
// image/video sampler that let the UI drive real hardware in Chrome/Edge/Brave
// (Web Bluetooth). Reverse-engineering tools that informed it live in tools/.
(function () {
  "use strict";

  // ---- BLE diagnostics log -------------------------------------------------
  // A timestamped ring buffer of BLE events so connection problems (disconnect
  // storms, slow/failed scene writes, GATT errors) are visible after the fact.
  // Export the readable text via CG.bleLog() or the "Copy BLE log" button.
  const BLE_LOG = [];
  const BLE_LOG_MAX = 1200;
  let bleT0 = Date.now();
  function bleLogEvent(type, detail) {
    const e = { t: Date.now() - bleT0, type };
    if (detail) Object.assign(e, detail);
    BLE_LOG.push(e);
    if (BLE_LOG.length > BLE_LOG_MAX) BLE_LOG.shift();
    // Mirror the notable events to the console so they're watchable live.
    if (type === "attach" || type === "disconnect" || type.indexOf("error") >= 0 ||
        type === "reconnect-ok" || type === "reconnect-giveup") {
      try { console.log("[BLE +" + e.t + "ms] " + type, detail || ""); } catch (x) {}
    }
  }
  function bleLogText() {
    const lines = BLE_LOG.map((e) => {
      const { t, type } = e;
      const kv = Object.keys(e).filter((k) => k !== "t" && k !== "type").map((k) => k + "=" + e[k]).join(" ");
      return ("+" + t + "ms").padEnd(11) + String(type).padEnd(16) + kv;
    });
    return "CloudGrid BLE log — " + BLE_LOG.length + " events over " + Math.round((Date.now() - bleT0) / 1000) + "s\n" + lines.join("\n");
  }
  function bleLogClear() { BLE_LOG.length = 0; bleT0 = Date.now(); }

  // Rolling Bluetooth throughput, so the animation loop can pace itself to what
  // the link can actually display, and so the achievable frame rate is
  // inspectable (CG.bleRate()) for planning. Each scene write's wall time is
  // sampled. The cost is dominated by the per-packet inter-write sleep (see
  // setScene), so write time scales with packet count, not raw BLE bandwidth:
  // an 88-segment full-color frame is ~9 packets ≈ 110ms; a 3-packet scroll
  // frame ≈ 37ms. Measured ceiling: a full-grid frame sustains ~3 writes/sec
  // before Windows BLE starts dropping the link, so the loop leaves idle time
  // between writes rather than pushing as fast as the writes return.
  const BLE_RATE = { last: 0, ema: 0, n: 0, lastPkts: 0 };
  function bleRateSample(ms, pkts) {
    BLE_RATE.last = ms; BLE_RATE.lastPkts = pkts;
    BLE_RATE.ema = BLE_RATE.n ? BLE_RATE.ema + (ms - BLE_RATE.ema) / Math.min(BLE_RATE.n + 1, 20) : ms;
    BLE_RATE.n++;
  }
  function bleRate() {
    const w = Math.round(BLE_RATE.ema) || 0;
    return {
      lastWriteMs: BLE_RATE.last, avgWriteMs: w, lastPkts: BLE_RATE.lastPkts, samples: BLE_RATE.n,
      // Ceiling if we pushed back-to-back (we don't — a stability gap is added on top).
      writeBoundFps: w ? Math.round((1000 / w) * 10) / 10 : 0,
    };
  }

  // ---- packet.ts -----------------------------------------------------------
  // A Govee BLE control packet is 20 bytes: up to 19 payload bytes, zero-padded,
  // then an XOR checksum of the first 19 bytes.
  function buildPacket(leading) {
    const b = new Uint8Array(20);
    b.set(leading.slice(0, 19));
    let c = 0;
    for (let i = 0; i < 19; i++) c ^= b[i];
    b[19] = c;
    return b;
  }

  // ---- a3.ts ---------------------------------------------------------------
  const COMMIT = [0x33, 0x05, 0x0a, 0x20, 0x03];

  function buildSceneLeadings(entries, opts) {
    opts = opts || {};
    // The wire format addresses segments and group sizes with single bytes, so a
    // scene can carry at most 255 lit segments. The H703B tops out at 90, so this
    // only guards future, larger controllers from silently wrapping to garbage.
    if (entries.length > 255) throw new Error("scene has " + entries.length + " lit segments; the 1-byte protocol caps at 255");
    const dir = opts.dir != null ? opts.dir : 0x13;
    // The caller controls speed. dir 0x13 holds the design static at speed 0 and
    // smoothly flows the dot colors (Gradient) at speed > 0; the UI passes 0 for
    // Static and for live-animation frames (which are static scenes it swaps),
    // and the slider value for Gradient and the motion effects.
    const speed = opts.speed != null ? opts.speed : 0x32;
    const bright = opts.bright != null ? opts.bright : 0x64;
    const bg = opts.bg || [1, 1, 1];

    // Group segments by identical color (preserving first-seen order).
    const groups = new Map();
    for (const e of entries) {
      const key = (e.r & 0xff) + "," + (e.g & 0xff) + "," + (e.b & 0xff);
      let grp = groups.get(key);
      if (!grp) {
        grp = { r: e.r & 0xff, g: e.g & 0xff, b: e.b & 0xff, segs: [] };
        groups.set(key, grp);
      }
      grp.segs.push(e.seg & 0xff);
    }

    const payload = [0x01, 0x02, 0x03, dir, speed, bright, bg[0] & 0xff, bg[1] & 0xff, bg[2] & 0xff, groups.size];
    for (const grp of groups.values()) {
      payload.push(grp.segs.length & 0xff, grp.r, grp.g, grp.b);
      for (const s of grp.segs) payload.push(s);
    }

    const total = Math.max(2, Math.ceil(payload.length / 17));
    payload[1] = total & 0xff; // packet count

    const packets = [];
    for (let i = 0; i < total; i++) {
      const chunk = payload.slice(i * 17, i * 17 + 17);
      while (chunk.length < 17) chunk.push(0);
      const index = i === total - 1 ? 0xff : i;
      packets.push([0xa3, index].concat(chunk));
    }
    return packets;
  }

  // ---- ble.ts --------------------------------------------------------------
  const SERVICE = "00010203-0405-0607-0809-0a0b0c0d1910";
  const WRITE_CHAR = "00010203-0405-0607-0809-0a0b0c0d2b11";
  const LAST_DEVICE_KEY = "cloudgrid-device-id";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class GoveeDevice {
    constructor() {
      this.device = null;
      this.writeChar = null;
      this.keepAlive = null;
      this.chain = Promise.resolve();
      this.onDisconnect = null; // called with (intentional) on any drop
      this.onReconnect = null; // called when an auto-reconnect succeeds
      this._wantDisconnect = false;
      this._reconnecting = false;
      this._sceneBusy = false; // true while a multi-packet setScene is in flight
      this._onGattDisconnect = null; // bound listener, removed before re-adding
    }
    get connected() {
      return !!this.writeChar;
    }
    get name() {
      return (this.device && this.device.name) || "(unknown)";
    }
    // Whether silent reconnect-on-load is even possible here. Brave and other
    // browsers lack getDevices(), so the UI can hint instead of failing silently.
    static autoReconnectSupported() {
      return !!(navigator.bluetooth && navigator.bluetooth.getDevices);
    }
    static hasKnownDevice() {
      try { return !!localStorage.getItem(LAST_DEVICE_KEY); } catch (e) { return false; }
    }
    // Pick a device via the browser chooser (requires a user gesture).
    async connect() {
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth unavailable. Use Chrome/Edge (or enable the flag in Brave).");
      }
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE],
      });
      await this._attach(device);
    }
    // Reconnect to the last granted device without showing the chooser (no user
    // gesture needed). Returns true if it connected, false if there's nothing to
    // reconnect to. Used to auto-connect on page load.
    async connectKnown() {
      if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
      let id = null;
      try { id = localStorage.getItem(LAST_DEVICE_KEY); } catch (e) {}
      if (!id) return false;
      let devices = [];
      try { devices = await navigator.bluetooth.getDevices(); } catch (e) { return false; }
      const device = devices.find((d) => d.id === id);
      if (!device) return false;
      await this._attach(device);
      return true;
    }
    async _attach(device) {
      this.device = device;
      this._wantDisconnect = false;
      try { localStorage.setItem(LAST_DEVICE_KEY, device.id); } catch (e) {}
      // getDevices() returns the same BluetoothDevice across reconnects, so drop
      // any handler from a prior _attach before adding one — otherwise listeners
      // (and their _autoReconnect calls) accumulate on the long-lived device.
      if (this._onGattDisconnect) device.removeEventListener("gattserverdisconnected", this._onGattDisconnect);
      this._onGattDisconnect = () => {
        bleLogEvent("disconnect", { intentional: this._wantDisconnect });
        this.stopKeepAlive();
        this.writeChar = null;
        if (this.onDisconnect) this.onDisconnect(this._wantDisconnect);
        this._autoReconnect();
      };
      device.addEventListener("gattserverdisconnected", this._onGattDisconnect);
      bleLogEvent("attach", { name: device.name || "?" });
      await this._openGatt();
    }
    async _openGatt() {
      let server;
      // BLE on Windows often fails the first connect; retry a few times.
      for (let attempt = 1; attempt <= 4; attempt++) {
        try { server = await this.device.gatt.connect(); break; }
        catch (e) { bleLogEvent("gatt-fail", { attempt, err: String((e && e.message) || e).slice(0, 80) }); if (attempt === 4) throw e; await sleep(600); }
      }
      const svc = await server.getPrimaryService(SERVICE);
      this.writeChar = await svc.getCharacteristic(WRITE_CHAR);
      bleLogEvent("gatt-open");
      this.startKeepAlive();
    }
    // After an unexpected drop, keep retrying GATT (backoff) until it comes back
    // or the user disconnects on purpose.
    async _autoReconnect() {
      if (this._reconnecting || this._wantDisconnect) return;
      this._reconnecting = true;
      for (let n = 1; n <= 30 && !this._wantDisconnect; n++) {
        bleLogEvent("reconnect-try", { n });
        await sleep(Math.min(8000, 1000 * n));
        if (this._wantDisconnect) break;
        try {
          await this._openGatt();
          this._reconnecting = false;
          bleLogEvent("reconnect-ok", { n });
          if (this.onReconnect) this.onReconnect();
          return;
        } catch (e) { /* still down; keep trying */ }
      }
      this._reconnecting = false;
      if (!this._wantDisconnect) bleLogEvent("reconnect-giveup");
    }
    disconnect() {
      this._wantDisconnect = true;
      this.stopKeepAlive();
      if (this.device && this.device.gatt) this.device.gatt.disconnect();
      this.writeChar = null;
    }
    send(leading) {
      const run = this.chain.then(() => this.rawWrite(leading));
      this.chain = run.catch(() => {});
      return run;
    }
    async rawWrite(leading) {
      if (!this.writeChar) throw new Error("not connected");
      const pkt = buildPacket(leading);
      try {
        if (this.writeChar.writeValueWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(pkt);
        } else {
          await this.writeChar.writeValue(pkt);
        }
      } catch (e) {
        bleLogEvent("write-error", { err: String((e && e.message) || e).slice(0, 80) });
        throw e;
      }
    }
    async powerOn() {
      await this.send([0x33, 0x01, 0x01]);
    }
    async powerOff() {
      await this.send([0x33, 0x01, 0x00]);
    }
    async setScene(entries, opts) {
      const leadings = buildSceneLeadings(entries, opts);
      const startT = Date.now();
      bleLogEvent("scene-start", { pkts: leadings.length, segs: entries.length });
      this._sceneBusy = true;
      try {
        for (const leading of leadings) {
          await this.send(leading);
          await sleep(10);
        }
        await this.send(COMMIT);
        const ms = Date.now() - startT;
        bleRateSample(ms, leadings.length);
        bleLogEvent("scene-end", { ms });
      } catch (e) {
        bleLogEvent("scene-error", { ms: Date.now() - startT, err: String((e && e.message) || e).slice(0, 80) });
        throw e;
      } finally {
        this._sceneBusy = false;
      }
    }
    // Replay a captured on-device-animation scene: send its a3 chunks verbatim
    // (the same leading bytes the official app sent), then the commit. The
    // controller animates it itself, so this gives smooth, persistent motion
    // with no per-frame streaming. `pkts` is an array of 19-byte leadings.
    async replayScene(pkts) {
      const startT = Date.now();
      bleLogEvent("scene-start", { pkts: pkts.length, segs: 0 });
      this._sceneBusy = true;
      try {
        for (const p of pkts) {
          await this.send(p);
          await sleep(10);
        }
        await this.send(COMMIT);
        const ms = Date.now() - startT;
        bleRateSample(ms, pkts.length);
        bleLogEvent("scene-end", { ms });
      } catch (e) {
        bleLogEvent("scene-error", { ms: Date.now() - startT, err: String((e && e.message) || e).slice(0, 80) });
        throw e;
      } finally {
        this._sceneBusy = false;
      }
    }
    startKeepAlive() {
      this.stopKeepAlive();
      // Every 5s, but never mid-scene: a keep-alive slotted between a multi-packet
      // setScene's chunks (they share this.chain) risks the controller
      // mis-assembling the scene, so skip the tick while a scene send is in flight.
      this.keepAlive = setInterval(() => {
        if (this._sceneBusy) { bleLogEvent("keepalive-skip"); return; }
        bleLogEvent("keepalive");
        this.send([0xaa, 0x01]).catch(() => {});
      }, 5000);
    }
    stopKeepAlive() {
      if (this.keepAlive) {
        clearInterval(this.keepAlive);
        this.keepAlive = null;
      }
    }
  }

  // ---- sampler.ts ----------------------------------------------------------
  // dims = { w, h, total, width, rows, orient, visualToLogical } supplied by caller.
  function rotate90(src, w, h) {
    const c = document.createElement("canvas");
    c.width = h;
    c.height = w;
    const ctx = c.getContext("2d");
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    return c;
  }

  function sampleSource(src, sw, sh, o) {
    const d = o.dims;
    const w = d.w, h = d.h, total = d.total, width = d.width, rows = d.rows, orient = d.orient;
    const visualToLogical = d.visualToLogical;

    let source = src;
    if (o.rotate) {
      source = rotate90(src, sw, sh);
      const t = sw; sw = sh; sh = t;
    }

    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    ctx.filter = "saturate(" + o.adjust.sat + "%) brightness(" + o.adjust.bright + "%) contrast(" + o.adjust.contrast + "%)";
    if (o.fit === "stretch") {
      ctx.drawImage(source, 0, 0, w, h);
    } else {
      const scale = o.fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    const data = ctx.getImageData(0, 0, w, h).data;
    const colors = new Array(total).fill(null);
    for (let vy = 0; vy < h; vy++) {
      for (let vx = 0; vx < w; vx++) {
        const logical = visualToLogical(vx, vy, width, rows, orient);
        if (logical >= total) continue;
        const i = (vy * w + vx) * 4;
        if (data[i + 3] < 16) continue;
        const hx = (x) => x.toString(16).padStart(2, "0");
        colors[logical] = "#" + hx(data[i]) + hx(data[i + 1]) + hx(data[i + 2]);
      }
    }
    return colors;
  }

  // ---- pure helpers (color / grid math / palette / shapes) -----------------
  // Extracted from the UI component so they can be unit-tested in isolation and
  // reused. The component keeps thin wrappers that delegate here, so its call
  // sites are unchanged. These are all pure: no DOM, no component state.
  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function hslHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h * 12) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * c).toString(16).padStart(2, "0"); };
    return "#" + f(0) + f(8) + f(4);
  }
  function dim(hex, t) {
    const [r, g, b] = hexToRgb(hex);
    return "#" + [r, g, b].map((x) => Math.round(x * t).toString(16).padStart(2, "0")).join("");
  }
  function lerpHex(a, b, t) {
    const x = hexToRgb(a), y = hexToRgb(b);
    const m = (i) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, "0");
    return "#" + m(0) + m(1) + m(2);
  }
  // Split a color into a full-value "base" hue + a 0..1 value (brightness):
  // scale the brightest channel up to 255 for the base, and report that channel
  // as the value. A dark/muddy pick (e.g. a dim brown-red) becomes a vivid base
  // color plus a low brightness, matching the app's color-plus-brightness model.
  // base × value reproduces the original color closely (within 8-bit rounding).
  function decomposeColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    const m = Math.max(r, g, b);
    if (m === 0) return { base: "#000000", value: 0 };
    const s = 255 / m;
    const h2 = (x) => Math.min(255, Math.round(x * s)).toString(16).padStart(2, "0");
    return { base: "#" + h2(r) + h2(g) + h2(b), value: m / 255 };
  }
  // RGB -> HSL (all 0..1).
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const dd = max - min;
      s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
      if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / dd + 2;
      else h = (r - g) / dd + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  // Rotate a color's hue by `delta` (0..1 around the wheel), keeping its
  // saturation and lightness. Used for the in-place Gradient color cycle: each
  // dot changes color where it sits, nothing moves.
  function hueRotate(hex, delta) {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    return hslHex((h + delta) % 1, s, l);
  }

  // Section/grid layout math. A "logical" index is position along the strip;
  // "visual" is on-screen (vx,vy); "physical" is the wired LED order.
  function totalSegments(sections) { return sections.reduce((a, s) => a + s.length, 0); }
  function gridWidth(total, rows) { return Math.max(1, Math.ceil(total / Math.max(1, rows))); }
  function gridDims(width, rows, transpose) { return transpose ? { w: rows, h: width } : { w: width, h: rows }; }
  function visualToLogical(vx, vy, width, rows, o) {
    const d = gridDims(width, rows, o.transpose);
    const x = o.flipH ? d.w - 1 - vx : vx;
    const y = o.flipV ? d.h - 1 - vy : vy;
    const col = o.transpose ? y : x;
    const row = o.transpose ? x : y;
    return col * rows + row;
  }
  function localPhysical(p, s, rows) {
    if (s.serpentine && rows > 0) {
      const run = Math.floor(p / rows); const pos = p % rows;
      if (run % 2 === 1) p = run * rows + (rows - 1 - pos);
    }
    if (s.reversed) p = s.length - 1 - p;
    return p;
  }
  function logicalToPhysical(p, sections, rows) {
    let offset = 0;
    for (const s of sections) {
      if (p < offset + s.length) return offset + localPhysical(p - offset, s, rows);
      offset += s.length;
    }
    return p;
  }
  function sectionOfLogical(p, sections) {
    let offset = 0;
    for (let i = 0; i < sections.length; i++) { if (p < offset + sections[i].length) return i; offset += sections[i].length; }
    return Math.max(0, sections.length - 1);
  }

  // Snap an arbitrary color to the nearest approved color. Distance uses the
  // "redmean" weighting so matches look right to the eye, not just numerically.
  // Pass null/empty palette to disable snapping (returns the input unchanged).
  function nearestPalette(hex, palette) {
    if (!palette || !palette.length) return hex;
    const [r, g, b] = hexToRgb(hex);
    let best = palette[0], bestD = Infinity;
    for (const p of palette) {
      const [pr, pg, pb] = hexToRgb(p);
      const rm = (r + pr) / 2, dr = r - pr, dg = g - pg, db = b - pb;
      const dist = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
      if (dist < bestD) { bestD = dist; best = p; }
    }
    return best;
  }
  function snapColors(colors, palette) {
    if (!palette || !palette.length) return colors;
    return colors.map((c) => (c ? nearestPalette(c, palette) : c));
  }

  // Visual cells covered by a line (Bresenham) or rectangle outline from a→b.
  function shapeCells(a, b, kind) {
    const out = [];
    if (kind === "line") {
      let x0 = a.vx, y0 = a.vy; const x1 = b.vx, y1 = b.vy;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
      for (;;) { out.push({ vx: x0, vy: y0 }); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    } else {
      const x0 = Math.min(a.vx, b.vx), x1 = Math.max(a.vx, b.vx), y0 = Math.min(a.vy, b.vy), y1 = Math.max(a.vy, b.vy);
      for (let x = x0; x <= x1; x++) { out.push({ vx: x, vy: y0 }); out.push({ vx: x, vy: y1 }); }
      for (let y = y0; y <= y1; y++) { out.push({ vx: x0, vy: y }); out.push({ vx: x1, vy: y }); }
    }
    return out;
  }

  window.CG = {
    GoveeDevice, buildSceneLeadings, buildPacket, COMMIT, sampleSource,
    hexToRgb, hslHex, dim, lerpHex, decomposeColor, hueRotate,
    totalSegments, gridWidth, gridDims, visualToLogical, localPhysical, logicalToPhysical, sectionOfLogical,
    nearestPalette, snapColors, shapeCells,
    bleLog: bleLogText, bleLogClear, bleLogEvent, bleRate,
  };
})();
