// Multi-light layout tests: deviceLayout + splitScenes (web/cloudgrid-core.js).
//
// Run: bun tools/test-layout.ts
//
// 1. Single light (every section dev 0, or no dev at all): splitScenes must be
//    byte-identical to the original one-scene encoder (reimplemented below as
//    the oracle), so adding the second light changes nothing for the first.
// 2. Two lights: each scene numbers its segments from 0, owns exactly its own
//    segments, and encode→decode→reassemble reproduces the global frame,
//    including an interleaved (dev0, dev1, dev0) section order.
(globalThis as any).window = globalThis;
const src = await Bun.file(new URL("../web/cloudgrid-core.js", import.meta.url)).text();
(0, eval)(src);
const CG = (globalThis as any).CG;
const { deviceLayout, splitScenes, buildSceneLeadings, decodeSceneLeadings, totalSegments } = CG;

let seed = 987654321;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (n: number) => Math.floor(rnd() * n);
let pass = 0, fail = 0;
const check = (ok: boolean, msg: string) => { if (ok) pass++; else { fail++; console.log("FAIL:", msg); } };

// The pre-multi-light encoder, verbatim in shape: one histogram over the whole
// run, most-common color is bg (first-seen wins ties), list the rest ascending.
function legacyScene(phys: (number[] | null)[]) {
  const OFF = [1, 1, 1];
  const key = (rgb: number[] | null) => (rgb ? rgb[0] + "," + rgb[1] + "," + rgb[2] : "off");
  const count = new Map<string, number>();
  for (let g = 0; g < phys.length; g++) { const k = key(phys[g]); count.set(k, (count.get(k) || 0) + 1); }
  let bgKey = "off", bgN = -1;
  for (const [k, n] of count) { if (n > bgN) { bgN = n; bgKey = k; } }
  const bg = bgKey === "off" ? OFF : bgKey.split(",").map(Number);
  const entries: any[] = [];
  for (let g = 0; g < phys.length; g++) {
    if (key(phys[g]) === bgKey) continue;
    const rgb = phys[g] || OFF;
    entries.push({ seg: g, r: rgb[0], g: rgb[1], b: rgb[2] });
  }
  return { entries, bg };
}
const palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [1, 1, 1]];
const randomPhys = (total: number) => Array.from({ length: total }, () => (rnd() < 0.3 ? null : palette[ri(palette.length)]));
const bytes = (entries: any[], bg: number[]) => JSON.stringify(buildSceneLeadings(entries, { dir: 0x13, speed: 0, bg }));

// --- 1. single light: byte identity (ISC-40), layout identity (ISC-24) ---
for (let iter = 0; iter < 2000; iter++) {
  const sections = [{ length: 1 + ri(45), reversed: false, serpentine: false }, ...(rnd() < 0.5 ? [{ length: 1 + ri(45), reversed: false, serpentine: false, dev: 0 }] : [])];
  const total = totalSegments(sections);
  const phys = randomPhys(total);
  const scenes = splitScenes(phys, sections);
  const legacy = legacyScene(phys);
  check(scenes.length === 1 && scenes[0].dev === 0, "single light yields exactly one scene");
  check(bytes(scenes[0].entries, scenes[0].bg) === bytes(legacy.entries, legacy.bg), "single-light bytes identical to legacy encoder");
  const lay = deviceLayout(sections);
  check(lay.owner.every((o: any, i: number) => o.dev === 0 && o.idx === i), "single-light layout is identity");
}

// --- 2. two lights: local indexing + round trip (ISC-24, ISC-31, ISC-34) ---
for (let iter = 0; iter < 2000; iter++) {
  const n = 2 + ri(3);
  const sections = Array.from({ length: n }, (_, i) => ({ length: 1 + ri(45), reversed: false, serpentine: false, dev: iter % 3 === 0 ? i % 2 : (i < n / 2 ? 0 : 1) }));
  const total = totalSegments(sections);
  const lay = deviceLayout(sections);
  // per-device local idx is contiguous from 0 in global order
  const seen: Record<number, number> = {};
  let ok = true;
  for (const o of lay.owner) { const want = seen[o.dev] || 0; if (o.idx !== want) ok = false; seen[o.dev] = want + 1; }
  check(ok, "local idx contiguous per device");
  check(Object.keys(seen).every((d) => seen[+d] === lay.totals[+d]), "totals match owner walk");
  const phys = randomPhys(total);
  const scenes = splitScenes(phys, sections);
  check(scenes.length === lay.devs.length, "one scene per device in use");
  // reassemble: decode each scene in its own space, place by owner
  const back: (number[] | null)[] = new Array(total).fill(null);
  const dec: Record<number, any> = {};
  for (const sc of scenes) {
    check(sc.entries.every((e: any) => e.seg >= 0 && e.seg < sc.total), "entry seg within device range");
    dec[sc.dev] = decodeSceneLeadings(buildSceneLeadings(sc.entries, { dir: 0x13, speed: 0, bg: sc.bg }), sc.total);
  }
  for (let g = 0; g < total; g++) { const o = lay.owner[g]; back[g] = dec[o.dev].phys[o.idx]; }
  const same = phys.every((c, g) => { const want = c || [1, 1, 1]; const got = back[g]; return got && got[0] === want[0] && got[1] === want[1] && got[2] === want[2]; });
  check(same, "two-light encode→decode→reassemble reproduces the frame");
}
console.log(`layout tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
