// Govee H703B DIY-scene ("a3") stream — reverse-engineered from a BLE capture.
//
// A scene is one logical payload split across 20-byte BLE writes:
//   header (9 bytes): 01 02 03 <dir> <speed> <bright> <bgR> <bgG> <bgB>
//   count  (1 byte):  number of colored-segment entries
//   entries (5 bytes each): 01 <R> <G> <B> <segmentIndex>
//
// The payload is chunked 17 bytes per packet. The first packet is index 0x00,
// the last is 0xff, any middles are 0x01, 0x02, ... After the stream, a commit
// packet (COMMIT) tells the device to apply it.

export interface SegEntry {
  seg: number;
  r: number;
  g: number;
  b: number;
}

export interface SceneOpts {
  dir?: number; // effect/direction byte (0x13 observed; behaves static with explicit colors)
  speed?: number;
  bright?: number;
  bg?: [number, number, number]; // background color for unset segments (near-off: 1,1,1)
}

export const COMMIT = [0x33, 0x05, 0x0a, 0x20, 0x03];

// Returns an array of "leading" byte arrays (<=19 bytes each, no checksum yet);
// the BLE layer appends the checksum when sending.
export function buildSceneLeadings(entries: SegEntry[], opts: SceneOpts = {}): number[][] {
  const dir = opts.dir ?? 0x13;
  const speed = opts.speed ?? 0x32;
  const bright = opts.bright ?? 0x64;
  const [bgR, bgG, bgB] = opts.bg ?? [1, 1, 1];

  const payload = [0x01, 0x02, 0x03, dir, speed, bright, bgR, bgG, bgB, entries.length];
  for (const e of entries) payload.push(0x01, e.r & 0xff, e.g & 0xff, e.b & 0xff, e.seg & 0xff);

  const total = Math.max(2, Math.ceil(payload.length / 17));
  const packets: number[][] = [];
  for (let i = 0; i < total; i++) {
    const chunk = payload.slice(i * 17, i * 17 + 17);
    while (chunk.length < 17) chunk.push(0);
    const index = i === total - 1 ? 0xff : i;
    packets.push([0xa3, index, ...chunk]);
  }
  return packets;
}
