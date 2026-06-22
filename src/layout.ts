// Physical-layout calibration: the light strip is a chain of sections (each a
// run of segments from one controller, cut to any length up to 45). Some
// sections may be mounted in reverse. The grid shows the design you *want*;
// this layer maps each logical position to the physical segment index to send.

export interface Section {
  length: number; // number of segments in this section (1..45)
  reversed: boolean; // true if this section is wired/mounted in reverse
}

export const totalSegments = (sections: Section[]): number =>
  sections.reduce((acc, s) => acc + s.length, 0);

/** Start index (in the logical/physical chain) of each section. */
export function sectionOffsets(sections: Section[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of sections) {
    offsets.push(acc);
    acc += s.length;
  }
  return offsets;
}

/**
 * Map a logical position (grid display order, 0..total-1) to the physical
 * segment index to send over BLE. Sections occupy contiguous physical ranges
 * in chain order; a reversed section flips order within its own range.
 */
export function logicalToPhysical(p: number, sections: Section[]): number {
  let offset = 0;
  for (const s of sections) {
    if (p < offset + s.length) {
      const local = p - offset;
      return offset + (s.reversed ? s.length - 1 - local : local);
    }
    offset += s.length;
  }
  return p; // out of range — pass through
}
