// Govee H703B DIY-scene ("a3") stream — reverse-engineered from BLE captures.
//
// One scene is a single logical payload split across 20-byte BLE writes:
//   header (9): 01 <packetCount> 03 <dir> <speed> <bright> <bgR> <bgG> <bgB>
//   count  (1): number of color GROUPS
//   groups:     per group -> <numSegs> <R> <G> <B> <segIdx0> <segIdx1> ...
//
// header byte[1] is the number of packets in this stream (min 2). The payload
// is chunked 17 bytes per packet: first packet index 0x00, last 0xff, middles
// 0x01, 0x02, ... After the stream, a commit packet (COMMIT) applies it.

export interface SegEntry {
  seg: number;
  r: number;
  g: number;
  b: number;
}

export interface SceneOpts {
  dir?: number; // effect/direction byte (0x13 = Gradient; static with explicit colors)
  speed?: number;
  bright?: number;
  bg?: [number, number, number]; // color for unset segments (near-off: 1,1,1)
}

export const COMMIT = [0x33, 0x05, 0x0a, 0x20, 0x03];

// Returns "leading" byte arrays (<=19 bytes each, no checksum); the BLE layer
// appends the XOR checksum when sending.
export function buildSceneLeadings(entries: SegEntry[], opts: SceneOpts = {}): number[][] {
  const dir = opts.dir ?? 0x13;
  const speed = opts.speed ?? 0x32;
  const bright = opts.bright ?? 0x64;
  const [bgR, bgG, bgB] = opts.bg ?? [1, 1, 1];

  // Group segments by identical color (preserving first-seen order).
  const groups = new Map<string, { r: number; g: number; b: number; segs: number[] }>();
  for (const e of entries) {
    const key = `${e.r & 0xff},${e.g & 0xff},${e.b & 0xff}`;
    let grp = groups.get(key);
    if (!grp) {
      grp = { r: e.r & 0xff, g: e.g & 0xff, b: e.b & 0xff, segs: [] };
      groups.set(key, grp);
    }
    grp.segs.push(e.seg & 0xff);
  }

  // header byte[1] is patched with the real packet count below.
  const payload = [0x01, 0x02, 0x03, dir, speed, bright, bgR & 0xff, bgG & 0xff, bgB & 0xff, groups.size];
  for (const grp of groups.values()) {
    payload.push(grp.segs.length & 0xff, grp.r, grp.g, grp.b, ...grp.segs);
  }

  const total = Math.max(2, Math.ceil(payload.length / 17));
  payload[1] = total & 0xff; // packet count

  const packets: number[][] = [];
  for (let i = 0; i < total; i++) {
    const chunk = payload.slice(i * 17, i * 17 + 17);
    while (chunk.length < 17) chunk.push(0);
    const index = i === total - 1 ? 0xff : i;
    packets.push([0xa3, index, ...chunk]);
  }
  return packets;
}
