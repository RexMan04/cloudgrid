// Reassemble Govee 0xa3 DIY scene streams from a btsnoop capture and print the
// continuous payload so the per-segment color encoding is legible.
//
// Run: bun tools/a3.ts captures/capture3.log
import { readBtsnoop, hex } from "./btsnoop.ts";

const path = process.argv[2];
if (!path) { console.error("usage: bun tools/a3.ts <btsnoop.log>"); process.exit(1); }

// Ordered ATT-write payloads (the raw Govee packets) from the shared parser.
const writes: Uint8Array[] = readBtsnoop(new Uint8Array(await Bun.file(path).arrayBuffer())).map((w) => w.value);

// Group a3 streams: a3 00 starts one, a3 ff ends it.
const groups: Uint8Array[][] = [];
let cur: Uint8Array[] | null = null;
for (const v of writes) {
  if (v[0] !== 0xa3) continue;
  if (v[1] === 0x00) { if (cur) groups.push(cur); cur = []; }
  if (cur) cur.push(v);
  if (v[1] === 0xff && cur) { groups.push(cur); cur = null; }
}
if (cur) groups.push(cur);

for (let i = 0; i < groups.length; i++) {
  const g = groups[i];
  const payload: number[] = [];
  for (const v of g) for (let k = 2; k <= 18; k++) payload.push(v[k]);
  // Trim trailing zero padding, but never past the 10-byte header+count — an
  // empty scene has count=0 (a legitimate zero byte at index 9) that must
  // survive, or `count` parses as undefined.
  let end = payload.length;
  while (end > 10 && payload[end - 1] === 0) end--;
  const p = payload.slice(0, end);

  const header = p.slice(0, 9);
  const count = p[9];
  const rest = p.slice(10);

  console.log(`\n── Stream ${i + 1}  (${g.length} packets) ─────────────────`);
  console.log(`  header : ${hex(header)}   (dir=${header[3].toString(16)}, speed=${header[4]}, bright=${header[5]}, bg=${hex(header.slice(6))})`);
  console.log(`  count  : ${count}`);
  console.log(`  rest   : ${hex(rest)}`);
  // Try parsing as fixed-size entries for a few candidate sizes.
  for (const sz of [4, 5]) {
    if (rest.length >= count * sz && count > 0) {
      const entries = [];
      for (let e = 0; e < count; e++) {
        const ent = rest.slice(e * sz, e * sz + sz);
        entries.push(`[${hex(ent)}]`);
      }
      console.log(`  as ${sz}-byte entries: ${entries.join(" ")}`);
    }
  }
}
