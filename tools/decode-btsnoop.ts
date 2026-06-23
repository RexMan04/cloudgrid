// Govee BLE capture decoder.
//
// Parses an Android `btsnoop_hci.log` (the standard BTSnoop format), pulls out
// every ATT Write to a BLE characteristic, isolates the 20-byte Govee control
// packets, and answers the one question that gates the whole reverse-
// engineering effort: are the payloads PLAINTEXT (0x33-family + valid XOR
// checksum) or ENCRYPTED (high-entropy, checksum never validates)?
//
// Usage:  bun run decode  <path-to-btsnoop_hci.log>
//   e.g.  bun tools/decode-btsnoop.ts ./btsnoop_hci.log
//
// What it does NOT do: defragment multi-packet ACL streams. Govee's 20-byte
// control writes fit in a single ACL packet, so that's fine for control-command
// analysis. The longer 0xa3 scene uploads may span packets; those are flagged
// but not reassembled here.
import { readBtsnoop, hex } from "./btsnoop.ts";

const GOVEE_WRITE_CHAR_HANDLE_HINT =
  "Govee write characteristic UUID: 00010203-0405-0607-0809-0a0b0c0d2b11";

// ---- Govee packet analysis ----------------------------------------------

function xorChecksumValid(b: Uint8Array): boolean {
  if (b.length !== 20) return false;
  let c = 0;
  for (let i = 0; i < 19; i++) c ^= b[i];
  return c === b[19];
}

function uniqueByteRatio(b: Uint8Array): number {
  return new Set(b).size / b.length;
}

const PREFIX_NAMES: Record<number, string> = {
  0x33: "control (0x33)",
  0xaa: "keep-alive/query (0xaa)",
  0xa3: "multi-packet scene/DIY (0xa3)",
  0xa5: "multi-packet (0xa5)",
  0xab: "keep-alive-ack (0xab)",
};

function classify(b: Uint8Array): string {
  return PREFIX_NAMES[b[0]] ?? `unknown prefix 0x${b[0]?.toString(16)}`;
}

// ---- Main ---------------------------------------------------------------
const path = process.argv[2];
if (!path) {
  console.error("Usage: bun run decode <path-to-btsnoop_hci.log>");
  console.error(GOVEE_WRITE_CHAR_HANDLE_HINT);
  process.exit(1);
}

const file = Bun.file(path);
if (!(await file.exists())) {
  console.error(`File not found: ${path}`);
  process.exit(1);
}

const buf = new Uint8Array(await file.arrayBuffer());
const writes = readBtsnoop(buf);

console.log(`\nParsed ${writes.length} ATT write(s) from ${path}\n`);

// Govee control writes are 20 bytes. Show every write, but analyze the 20-byters.
const govee = writes.filter((w) => w.value.length === 20);
const other = writes.filter((w) => w.value.length !== 20);

let validChecksums = 0;
let knownPrefixes = 0;

console.log("─".repeat(78));
let prevTs: bigint | null = null;
for (const w of writes) {
  // Separate bursts: a gap >250ms usually means a new user action (e.g. a
  // fresh "apply this DIY scene" upload). Makes multi-packet streams legible.
  if (prevTs !== null) {
    const gapMs = Number(w.tsMicros - prevTs) / 1000;
    if (gapMs > 250) console.log(`        ── ${gapMs.toFixed(0)}ms gap — likely a new action ──`);
  }
  prevTs = w.tsMicros;

  const b = w.value;
  const is20 = b.length === 20;
  const okSum = is20 && xorChecksumValid(b);
  if (okSum) validChecksums++;
  const known = is20 && b[0] in PREFIX_NAMES;
  if (known) knownPrefixes++;

  const tag = is20
    ? `${classify(b)}${okSum ? "  ✓xor" : "  ✗xor"}`
    : `len=${b.length} (not a 20-byte control packet)`;
  console.log(`#${String(w.recordIndex).padStart(5)} ${w.direction}  ${tag}`);
  console.log(`        ${hex(b)}`);
}
console.log("─".repeat(78));

// ---- Verdict ------------------------------------------------------------
console.log(`\nSUMMARY`);
console.log(`  Total ATT writes:        ${writes.length}`);
console.log(`  20-byte control packets: ${govee.length}`);
console.log(`  Other-length writes:     ${other.length}`);
if (govee.length > 0) {
  const pctSum = Math.round((validChecksums / govee.length) * 100);
  const pctPrefix = Math.round((knownPrefixes / govee.length) * 100);
  const avgUnique =
    govee.reduce((s, w) => s + uniqueByteRatio(w.value), 0) / govee.length;
  console.log(`  Valid XOR checksum:      ${validChecksums}/${govee.length} (${pctSum}%)`);
  console.log(`  Known Govee prefix:      ${knownPrefixes}/${govee.length} (${pctPrefix}%)`);
  console.log(`  Avg unique-byte ratio:   ${avgUnique.toFixed(2)} (lower = more structured)`);

  console.log(`\nENCRYPTION VERDICT:`);
  if (pctSum >= 60 || pctPrefix >= 60) {
    console.log(
      `  ✓ LIKELY PLAINTEXT. Most packets validate the Govee XOR checksum and/or` +
        ` use known 0x33-family prefixes. You can synthesize and send packets` +
        ` directly. This is the good outcome — the per-dot dream is on the table.`,
    );
  } else if (avgUnique > 0.85 && pctSum < 20) {
    console.log(
      `  ✗ LIKELY ENCRYPTED. Payloads look high-entropy and the XOR checksum almost` +
        ` never validates, which is the signature of AES-wrapped packets. Replay` +
        ` may still work, but synthesizing new per-dot frames needs the key/cipher` +
        ` first. Much harder.`,
    );
  } else {
    console.log(
      `  ? INCONCLUSIVE. Mixed signal. Re-capture with cleaner, discrete actions` +
        ` (one change at a time) and send me the log — I'll dig into the bytes.`,
    );
  }
} else {
  console.log(
    `\n  No 20-byte control writes found. Either the H703B talks to the app over` +
      ` WiFi/cloud (not BLE) for these actions, or the capture missed the GATT` +
      ` writes. ${GOVEE_WRITE_CHAR_HANDLE_HINT}`,
  );
}
console.log("");
