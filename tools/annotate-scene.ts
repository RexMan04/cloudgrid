// Annotated dump of a captured 0x02 scene: the raw a3 wire packets (with the XOR
// checksum the device receives) plus the reassembled payload split into the parts
// we HAVE decoded (header, palette) and the parts we have NOT (the global-param
// preamble and the per-particle program). For collaborative reverse-engineering.
//
// Run: bun tools/annotate-scene.ts <sceneLabelSubstring>
(globalThis as any).window = globalThis;
const core = await Bun.file(new URL("../web/cloudgrid-core.js", import.meta.url)).text();
(0, eval)(core);
const CG = (globalThis as any).CG;

const scenesText = await Bun.file(new URL("../web/captured-scenes.js", import.meta.url)).text();
const scenes = JSON.parse(scenesText.slice(scenesText.indexOf("["), scenesText.lastIndexOf("]") + 1));
const want = (process.argv[2] || "Blue-purple").toLowerCase();
const sc = scenes.find((s: any) => s.label.toLowerCase().includes(want));
if (!sc) { console.error("no scene matching", want, "— have:", scenes.map((s: any) => s.label).join(", ")); process.exit(1); }

const hx = (n: number) => (n & 0xff).toString(16).padStart(2, "0");
const meta = CG.decodeParametricScene(sc.pkts);

console.log(`SCENE: ${sc.label}   (type=${meta.type} speed=${meta.speed} bright=${meta.bright} bg=${meta.bg.map(hx).join("")})`);
console.log(`palette: ${meta.palette.map((r: number[]) => "#" + r.map(hx).join("")).join("  ")}`);

console.log(`\n--- RAW a3 WIRE PACKETS (20 bytes each: a3, index, 17 payload, XOR checksum) ---`);
for (const p of sc.pkts) {
  const full = CG.buildPacket(p); // adds the checksum byte
  console.log("  " + Array.from(full).map((b) => hx(b as number)).join(" "));
}

// Reassemble flat payload.
const payload: number[] = [];
for (const p of sc.pkts) for (let i = 2; i < p.length; i++) payload.push(p[i] & 0xff);

const palCount = payload[20];
const palEnd = 21 + palCount * 3;
console.log(`\n--- REASSEMBLED PAYLOAD (${payload.length} bytes) ---`);
const label = (i: number) => {
  if (i <= 8) return ["start=01", "pktCount", "fmt=02", "type", "speed", "bright", "bgR", "bgG", "bgB"][i];
  if (i >= 9 && i <= 19) return "preamble[" + (i - 9) + "]  ??";
  if (i === 20) return "paletteCount=" + palCount;
  if (i >= 21 && i < palEnd) { const k = i - 21; return "palette[" + Math.floor(k / 3) + "]." + "RGB"[k % 3]; }
  return "PROGRAM[" + (i - palEnd) + "]  ?? (per-particle / unknown)";
};
for (let i = 0; i < payload.length; i++) {
  const tag = i < palEnd ? "" : (payload[i] === 0 ? "" : "");
  console.log(`  [${String(i).padStart(3)}] 0x${hx(payload[i])} ${String(payload[i]).padStart(3)}   ${label(i)}${tag}`);
}
