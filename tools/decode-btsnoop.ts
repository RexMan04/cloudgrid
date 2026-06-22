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

const GOVEE_WRITE_CHAR_HANDLE_HINT =
  "Govee write characteristic UUID: 00010203-0405-0607-0809-0a0b0c0d2b11";

// ---- BTSnoop file format ------------------------------------------------
// 8-byte magic "btsnoop\0", uint32 version (=1), uint32 datalink type.
// Datalink 1002 = "HCI UART (H4)" (what Android writes). Each record:
//   uint32 originalLength
//   uint32 includedLength
//   uint32 packetFlags      (bit0: 1=received/host-controller, 0=sent)
//   uint32 cumulativeDrops
//   int64  timestampMicros  (microseconds since 0000-01-01)
//   <includedLength bytes of packet data>
// All multi-byte fields are BIG-ENDIAN.

interface AttWrite {
  recordIndex: number;
  direction: "sent" | "recv";
  handle: number; // ATT attribute handle
  opcode: number; // ATT opcode (0x52 write cmd, 0x12 write req)
  value: Uint8Array;
  tsMicros: bigint; // BTSnoop timestamp, microseconds since year 0
}

function readBtsnoop(buf: Uint8Array): AttWrite[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const magic = new TextDecoder().decode(buf.subarray(0, 8));
  if (!magic.startsWith("btsnoop")) {
    throw new Error(
      `Not a BTSnoop file (magic was ${JSON.stringify(magic)}). ` +
        `Make sure you exported the raw btsnoop_hci.log, not a pcap/Wireshark export.`,
    );
  }
  const datalink = dv.getUint32(12, false);
  // 1001 = HCI Classic (unencapsulated), 1002 = HCI UART (H4). Android = 1002.
  const isH4 = datalink === 1002;

  const writes: AttWrite[] = [];
  let off = 16;
  let rec = 0;

  while (off + 24 <= buf.length) {
    const includedLen = dv.getUint32(off + 4, false);
    const flags = dv.getUint32(off + 8, false);
    const tsMicros = dv.getBigInt64(off + 16, false);
    off += 24; // skip the 24-byte record header
    if (off + includedLen > buf.length) break;

    const pkt = buf.subarray(off, off + includedLen);
    off += includedLen;
    rec++;

    const direction = flags & 0x1 ? "recv" : "sent";
    const w = parseHciAclAtt(pkt, isH4);
    if (w) writes.push({ ...w, recordIndex: rec, direction, tsMicros });
  }

  return writes;
}

// Parse one HCI packet -> ACL -> L2CAP -> ATT write, if present.
function parseHciAclAtt(
  pkt: Uint8Array,
  isH4: boolean,
): Omit<AttWrite, "recordIndex" | "direction" | "tsMicros"> | null {
  let p = 0;
  if (isH4) {
    // H4 type byte: 0x01 cmd, 0x02 ACL, 0x03 SCO, 0x04 event.
    const type = pkt[p++];
    if (type !== 0x02) return null; // only ACL carries ATT
  }
  if (p + 4 > pkt.length) return null;

  // ACL header: handle+flags (2, LE), total data length (2, LE)
  // (we don't need the handle/flags beyond knowing it's ACL)
  p += 2;
  const aclLen = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  if (p + aclLen > pkt.length) return null;

  // L2CAP header: length (2, LE), CID (2, LE)
  if (p + 4 > pkt.length) return null;
  p += 2; // l2cap length
  const cid = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  if (cid !== 0x0004) return null; // 0x0004 = ATT channel

  // ATT PDU
  if (p >= pkt.length) return null;
  const opcode = pkt[p++];
  // 0x52 = Write Command, 0x12 = Write Request
  if (opcode !== 0x52 && opcode !== 0x12) return null;
  if (p + 2 > pkt.length) return null;
  const handle = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  const value = pkt.subarray(p);
  if (value.length === 0) return null;
  return { handle, opcode, value: new Uint8Array(value) };
}

// ---- Govee packet analysis ----------------------------------------------
function hex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join(" ");
}

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
