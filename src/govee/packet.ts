// A Govee BLE control packet is 20 bytes: up to 19 payload bytes, zero-padded,
// followed by an XOR checksum of the first 19 bytes.
export function buildPacket(leading: number[]): Uint8Array {
  const b = new Uint8Array(20);
  b.set(leading.slice(0, 19));
  let c = 0;
  for (let i = 0; i < 19; i++) c ^= b[i];
  b[19] = c;
  return b;
}

export const hex = (b: ArrayLike<number>) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
