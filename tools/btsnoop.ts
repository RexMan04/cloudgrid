// Shared BTSnoop parsing for the Govee reverse-engineering tools.
//
// Parses an Android `btsnoop_hci.log` (the standard BTSnoop format), walks every
// record, and extracts the ordered list of ATT Write values (Write Command 0x52
// / Write Request 0x12) on the ATT channel — the layer Govee's control and
// DIY-scene packets ride on. `decode-btsnoop.ts` (per-packet classification) and
// `a3.ts` (multi-packet 0xa3 scene reassembly) both build on this one parser so
// they can't drift apart.
//
// File format (all multi-byte fields BIG-ENDIAN):
//   8-byte magic "btsnoop\0", uint32 version (=1), uint32 datalink type.
//   Datalink 1002 = HCI UART (H4), what Android writes; 1001 = HCI Classic.
//   Each record: uint32 originalLen, uint32 includedLen, uint32 flags
//     (bit0: 1=received), uint32 cumulativeDrops, int64 timestampMicros,
//     then <includedLen> bytes of packet data.

export interface AttWrite {
  recordIndex: number;
  direction: "sent" | "recv";
  handle: number; // ATT attribute handle
  opcode: number; // ATT opcode (0x52 write cmd, 0x12 write req)
  value: Uint8Array; // the ATT write payload (the Govee packet)
  tsMicros: bigint; // BTSnoop timestamp, microseconds since year 0
}

export function readBtsnoop(buf: Uint8Array): AttWrite[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  const magic = new TextDecoder().decode(buf.subarray(0, 8));
  if (!magic.startsWith("btsnoop")) {
    throw new Error(
      `Not a BTSnoop file (magic was ${JSON.stringify(magic)}). ` +
        `Make sure you exported the raw btsnoop_hci.log, not a pcap/Wireshark export.`,
    );
  }
  // 1001 = HCI Classic (unencapsulated), 1002 = HCI UART (H4). Android = 1002.
  const isH4 = dv.getUint32(12, false) === 1002;

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
): Pick<AttWrite, "handle" | "opcode" | "value"> | null {
  let p = 0;
  if (isH4) {
    // H4 type byte: 0x01 cmd, 0x02 ACL, 0x03 SCO, 0x04 event.
    const type = pkt[p++];
    if (type !== 0x02) return null; // only ACL carries ATT
  }
  if (p + 4 > pkt.length) return null;

  // ACL header: handle+flags (2, LE), total data length (2, LE).
  p += 2;
  const aclLen = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  if (p + aclLen > pkt.length) return null;

  // L2CAP header: length (2, LE), CID (2, LE).
  if (p + 4 > pkt.length) return null;
  p += 2; // l2cap length
  const cid = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  if (cid !== 0x0004) return null; // 0x0004 = ATT channel

  // ATT PDU.
  if (p >= pkt.length) return null;
  const opcode = pkt[p++];
  // 0x52 = Write Command, 0x12 = Write Request.
  if (opcode !== 0x52 && opcode !== 0x12) return null;
  if (p + 2 > pkt.length) return null;
  const handle = pkt[p] | (pkt[p + 1] << 8);
  p += 2;
  const value = pkt.subarray(p);
  if (value.length === 0) return null;
  return { handle, opcode, value: new Uint8Array(value) };
}

// Format bytes as space-separated lowercase hex. Accepts a number[] (slices of
// a reassembled payload) or a Uint8Array (a raw packet).
export function hex(b: number[] | Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join(" ");
}
