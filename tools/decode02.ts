// Analysis scratch: reassemble each captured 0x02 scene's payload and print it
// with the known header decoded, so the body's record structure becomes visible.
// Cross-reference against the visual descriptions to crack the format.
//
// Run: bun tools/decode02.ts [sceneLabelSubstring]
const scenesText = await Bun.file(new URL("../web/captured-scenes.js", import.meta.url)).text();
const arr = JSON.parse(scenesText.slice(scenesText.indexOf("["), scenesText.lastIndexOf("]") + 1));

const DESC: Record<string, string> = {
  "Universe": "s6: space, blue/purple dots",
  "Amber glow": "s7: glowing yellow+orange gradient, dots slowly shifting yellow/orange hue",
  "Blue-purple spin": "s8: blue and purple dots going clockwise",
  "Blue/white/pink": "s9: blue, white, some pink",
  "Green-purple spin": "s10: green/purple/blue dots clockwise, some dots off",
  "Blue-green gradient": "s11: blue/green/off gradients",
  "Wave": "s12: wave",
};

const hx = (n: number) => (n & 0xff).toString(16).padStart(2, "0");
const filter = process.argv[2];

for (const sc of arr) {
  if (filter && !sc.label.toLowerCase().includes(filter.toLowerCase())) continue;
  // Reassemble flat payload (drop [0xa3, index] on each chunk).
  const payload: number[] = [];
  for (const p of sc.pkts) for (let i = 2; i < p.length; i++) payload.push(p[i] & 0xff);

  console.log("\n" + "=".repeat(78));
  console.log(`${sc.label}  (${DESC[sc.label] || "?"})`);
  console.log(`  pkts=${sc.pkts.length}  payloadLen=${payload.length}`);
  console.log(`  HEADER: marker=${payload[0]} pktCount=${payload[1]} fmt=0x${hx(payload[2])} ` +
    `type=${payload[3]} speed=${payload[4]} bright=${payload[5]} bg=(${payload[6]},${payload[7]},${payload[8]})`);
  const body = payload.slice(9);
  console.log(`  BODY (from offset 9), ${body.length} bytes:`);
  // print 19 bytes per row with byte offset (relative to body start)
  for (let i = 0; i < body.length; i += 19) {
    const row = body.slice(i, i + 19);
    const hex = row.map(hx).join(" ");
    const dec = row.map((n) => String(n).padStart(3)).join(" ");
    console.log(`   @${String(i).padStart(3)}  ${hex}`);
    console.log(`         ${dec}`);
  }
}
