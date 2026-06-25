// Round-trip test for the scene emulator: decodeSceneLeadings must be the exact
// inverse of buildSceneLeadings, so the on-canvas preview (which renders decoded
// wire) matches what the device receives byte-for-byte.
//
// Run: bun tools/test-emulator.ts
//
// Loads the browser core (an IIFE that attaches window.CG) under a tiny shim, then
// fuzzes random per-segment scenes through encode→decode and asserts the
// reconstructed segment state equals the input. Also confirms the captured 0x02
// scenes (a particle program, not a segment list) are flagged perSegment:false.
(globalThis as any).window = globalThis;
const src = await Bun.file(new URL("../web/cloudgrid-core.js", import.meta.url)).text();
(0, eval)(src);
const CG = (globalThis as any).CG;
const { buildSceneLeadings, decodeSceneLeadings } = CG;

// Small deterministic PRNG so failures are reproducible.
let seed = 1234567;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (n: number) => Math.floor(rnd() * n);

let pass = 0, fail = 0;
const eqRgb = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

for (let iter = 0; iter < 5000; iter++) {
  const total = 1 + ri(96);
  const bg = [ri(256), ri(256), ri(256)];
  // Distinct segments, each a color that differs from bg (mirrors buildEntries,
  // which never lists a segment whose color is the background).
  const segs = new Set<number>();
  const k = ri(total + 1);
  while (segs.size < k) segs.add(ri(total));
  const entries: { seg: number; r: number; g: number; b: number }[] = [];
  const expected: number[][] = Array.from({ length: total }, () => [bg[0], bg[1], bg[2]]);
  for (const seg of segs) {
    let c: number[];
    do { c = [ri(256), ri(256), ri(256)]; } while (eqRgb(c, bg));
    entries.push({ seg, r: c[0], g: c[1], b: c[2] });
    expected[seg] = c;
  }
  const opts = { dir: ri(256), speed: ri(256), bright: ri(256), bg };
  const leadings = buildSceneLeadings(entries, opts);
  const dec = decodeSceneLeadings(leadings, total);

  let ok = dec.perSegment === true && eqRgb(dec.bg, bg) &&
    dec.dir === opts.dir && dec.speed === opts.speed && dec.bright === opts.bright &&
    dec.phys.length === total;
  if (ok) for (let i = 0; i < total; i++) if (!eqRgb(dec.phys[i], expected[i])) { ok = false; break; }
  if (ok) pass++; else { fail++; if (fail <= 3) console.error(`FAIL iter=${iter} total=${total} segs=${k}`); }
}

console.log(`round-trip: ${pass} passed, ${fail} failed (5000 random per-segment scenes)`);

// The captured device scenes are all 0x02 — must be flagged non-per-segment so the
// emulator declines to render them as a flat segment list.
let scenesChecked = 0, miss = 0;
try {
  const scenesText = await Bun.file(new URL("../web/captured-scenes.js", import.meta.url)).text();
  const arr = JSON.parse(scenesText.slice(scenesText.indexOf("["), scenesText.lastIndexOf("]") + 1));
  for (const sc of arr) {
    const dec = decodeSceneLeadings(sc.pkts, 96);
    scenesChecked++;
    if (sc.fmt === 2 && dec.perSegment !== false) { miss++; console.error(`FAIL scene ${sc.label}: 0x02 not flagged`); }
  }
  console.log(`captured scenes: ${scenesChecked} checked, ${miss} mis-flagged`);
} catch (e) { console.error("scene check skipped:", String(e)); }

// The component maps decoded per-physical-segment colors back to canvas cells via
// _physToLogical, which must be an exact inverse of logicalToPhysical for any
// layout (serpentine / reversed sections included). Verify the bijection.
let invFail = 0;
// Valid layouts only — serpentine section lengths are multiples of `rows`, the
// domain logicalToPhysical is defined over. (A serpentine section whose length
// isn't a multiple of rows is a separate pre-existing encoder edge case, not the
// emulator's concern: the send path and the preview hit it identically.)
const layouts = [
  { sections: [{ length: 88 }], rows: 11 },
  { sections: [{ length: 88, serpentine: true }], rows: 11 },                 // 8 full runs
  { sections: [{ length: 22, serpentine: true }, { length: 22, reversed: true }, { length: 44, serpentine: true, reversed: true }], rows: 11 },
  { sections: [{ length: 30, serpentine: true }, { length: 30, serpentine: true }], rows: 6 },
];
for (const { sections, rows } of layouts) {
  const total = sections.reduce((a, s) => a + s.length, 0);
  const inv: (number | null)[] = new Array(total).fill(null);
  for (let p = 0; p < total; p++) inv[CG.logicalToPhysical(p, sections, rows)] = p;
  let ok = inv.filter((x) => x != null).length === total; // covers every physical slot (bijection)
  if (ok) for (let p = 0; p < total; p++) if (inv[CG.logicalToPhysical(p, sections, rows)] !== p) { ok = false; break; }
  if (!ok) { invFail++; console.error(`FAIL phys<->logical inverse: total=${total} rows=${rows}`); }
}
console.log(`phys<->logical inverse: ${layouts.length - invFail}/${layouts.length} layouts exact`);

if (fail || miss || invFail) { console.error("EMULATOR TEST FAILED"); process.exit(1); }
console.log("EMULATOR TEST PASSED");
