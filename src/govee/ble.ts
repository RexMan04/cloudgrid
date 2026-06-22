// Web Bluetooth wrapper for a Govee RGBIC device (tested on H703B).
// Holds the GATT connection, sends a 2s keep-alive so the device doesn't drop
// the link, and exposes high-level color/scene commands.

import { buildPacket } from "./packet";
import { buildSceneLeadings, COMMIT, type SegEntry, type SceneOpts } from "./a3";

const SERVICE = "00010203-0405-0607-0809-0a0b0c0d1910";
const WRITE_CHAR = "00010203-0405-0607-0809-0a0b0c0d2b11";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GoveeDevice {
  device: BluetoothDevice | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  // Web Bluetooth allows only one GATT operation at a time; serialize every
  // write through this chain so keep-alives and scene packets never collide.
  private chain: Promise<unknown> = Promise.resolve();
  onDisconnect?: () => void;

  get connected() {
    return !!this.writeChar;
  }
  get name() {
    return this.device?.name ?? "(unknown)";
  }

  async connect(): Promise<void> {
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
      this.onDisconnect?.();
    });

    // BLE on Windows often fails the first connect; retry a few times.
    let server: BluetoothRemoteGATTServer | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        server = await this.device.gatt!.connect();
        break;
      } catch (e) {
        if (attempt === 4) throw e;
        await sleep(600);
      }
    }
    const svc = await server!.getPrimaryService(SERVICE);
    this.writeChar = await svc.getCharacteristic(WRITE_CHAR);
    this.startKeepAlive();
  }

  disconnect(): void {
    this.stopKeepAlive();
    this.device?.gatt?.disconnect();
    this.writeChar = null;
  }

  /** Send one packet from its leading bytes (checksum is appended here). */
  send(leading: number[]): Promise<void> {
    const run = this.chain.then(() => this.rawWrite(leading));
    // Keep the chain alive even if one write rejects, so later writes still run.
    this.chain = run.catch(() => {});
    return run;
  }

  private async rawWrite(leading: number[]): Promise<void> {
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

  /** Set the whole strand to one color. */
  async setAll(r: number, g: number, b: number) {
    await this.send([0x33, 0x05, 0x0d, r, g, b]);
  }

  /** Apply a per-segment color scene (the core per-dot capability). */
  async setScene(entries: SegEntry[], opts?: SceneOpts) {
    for (const leading of buildSceneLeadings(entries, opts)) {
      await this.send(leading);
      await sleep(10);
    }
    await this.send(COMMIT);
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    this.keepAlive = setInterval(() => {
      this.send([0xaa, 0x01]).catch(() => {});
    }, 2000);
  }
  private stopKeepAlive() {
    if (this.keepAlive) {
      clearInterval(this.keepAlive);
      this.keepAlive = null;
    }
  }
}
