// CloudGrid core — Govee H703B BLE protocol + image sampler.
// Self-contained, no build step: the packet encoder, BLE device wrapper, and
// image/video sampler that let the UI drive real hardware in Chrome/Edge/Brave
// (Web Bluetooth). Reverse-engineering tools that informed it live in tools/.
(function () {
  "use strict";

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
    const dir = opts.dir != null ? opts.dir : 0x13;
    // dir 0x13 is the static/hold scene. The firmware still slowly "flows" a
    // DIY scene at the header's speed, so force speed 0 for static designs (and
    // for live-animation frames, which are static scenes the browser swaps) to
    // keep them frozen. Motion effects (other dir bytes) keep their speed.
    const speed = dir === 0x13 ? 0 : opts.speed != null ? opts.speed : 0x32;
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
    }
    get connected() {
      return !!this.writeChar;
    }
    get name() {
      return (this.device && this.device.name) || "(unknown)";
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
      device.addEventListener("gattserverdisconnected", () => {
        this.stopKeepAlive();
        this.writeChar = null;
        if (this.onDisconnect) this.onDisconnect(this._wantDisconnect);
        this._autoReconnect();
      });
      await this._openGatt();
    }
    async _openGatt() {
      let server;
      // BLE on Windows often fails the first connect; retry a few times.
      for (let attempt = 1; attempt <= 4; attempt++) {
        try { server = await this.device.gatt.connect(); break; }
        catch (e) { if (attempt === 4) throw e; await sleep(600); }
      }
      const svc = await server.getPrimaryService(SERVICE);
      this.writeChar = await svc.getCharacteristic(WRITE_CHAR);
      this.startKeepAlive();
    }
    // After an unexpected drop, keep retrying GATT (backoff) until it comes back
    // or the user disconnects on purpose.
    async _autoReconnect() {
      if (this._reconnecting || this._wantDisconnect) return;
      this._reconnecting = true;
      for (let n = 1; n <= 30 && !this._wantDisconnect; n++) {
        await sleep(Math.min(8000, 1000 * n));
        if (this._wantDisconnect) break;
        try {
          await this._openGatt();
          this._reconnecting = false;
          if (this.onReconnect) this.onReconnect();
          return;
        } catch (e) { /* still down; keep trying */ }
      }
      this._reconnecting = false;
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
      if (this.writeChar.writeValueWithoutResponse) {
        await this.writeChar.writeValueWithoutResponse(pkt);
      } else {
        await this.writeChar.writeValue(pkt);
      }
    }
    async powerOn() {
      await this.send([0x33, 0x01, 0x01]);
    }
    async powerOff() {
      await this.send([0x33, 0x01, 0x00]);
    }
    async setAll(r, g, b) {
      await this.send([0x33, 0x05, 0x0d, r, g, b]);
    }
    async setScene(entries, opts) {
      const leadings = buildSceneLeadings(entries, opts);
      for (const leading of leadings) {
        await this.send(leading);
        await sleep(10);
      }
      await this.send(COMMIT);
    }
    startKeepAlive() {
      this.stopKeepAlive();
      this.keepAlive = setInterval(() => {
        this.send([0xaa, 0x01]).catch(() => {});
      }, 2000);
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
  // base × value reproduces the original color, so it's a lossless re-split.
  function decomposeColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    const m = Math.max(r, g, b);
    if (m === 0) return { base: "#000000", value: 0 };
    const s = 255 / m;
    const h2 = (x) => Math.min(255, Math.round(x * s)).toString(16).padStart(2, "0");
    return { base: "#" + h2(r) + h2(g) + h2(b), value: m / 255 };
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
    hexToRgb, hslHex, dim, lerpHex, decomposeColor,
    totalSegments, gridWidth, gridDims, visualToLogical, localPhysical, logicalToPhysical, sectionOfLogical,
    nearestPalette, snapColors, shapeCells,
  };
})();
