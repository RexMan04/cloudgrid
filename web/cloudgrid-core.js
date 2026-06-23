// CloudGrid core — Govee H703B BLE protocol + image sampler.
// Ported from the original CloudGrid source (src/govee/*, src/sampler.ts) so the
// redesigned UI controls real hardware in Chrome/Edge/Brave (Web Bluetooth).
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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  class GoveeDevice {
    constructor() {
      this.device = null;
      this.writeChar = null;
      this.keepAlive = null;
      this.chain = Promise.resolve();
      this.onDisconnect = null;
    }
    get connected() {
      return !!this.writeChar;
    }
    get name() {
      return (this.device && this.device.name) || "(unknown)";
    }
    async connect() {
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth unavailable. Use Chrome/Edge (or enable the flag in Brave).");
      }
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE],
      });
      this.device.addEventListener("gattserverdisconnected", () => {
        this.stopKeepAlive();
        this.writeChar = null;
        if (this.onDisconnect) this.onDisconnect();
      });

      let server;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          server = await this.device.gatt.connect();
          break;
        } catch (e) {
          if (attempt === 4) throw e;
          await sleep(600);
        }
      }
      const svc = await server.getPrimaryService(SERVICE);
      this.writeChar = await svc.getCharacteristic(WRITE_CHAR);
      this.startKeepAlive();
    }
    disconnect() {
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

  window.CG = { GoveeDevice, buildSceneLeadings, buildPacket, COMMIT, sampleSource };
})();
