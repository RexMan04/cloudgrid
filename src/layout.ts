// Physical-layout calibration. The install is a 2D grid that is `rows` tall;
// the strip runs column by column (each column is a run of `rows` segments) and
// snakes, so alternate columns are wired in reverse. The on-screen grid shows
// the design you want; this layer maps each logical cell to the physical
// segment index to send, per section (a run from one controller output).

export interface Section {
  length: number; // segments in this section (1..45)
  reversed: boolean; // section mounted/wired backwards
  serpentine: boolean; // strip zigzags (alternate columns flipped)
}

export const totalSegments = (sections: Section[]): number =>
  sections.reduce((acc, s) => acc + s.length, 0);

export function sectionOffsets(sections: Section[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of sections) {
    offsets.push(acc);
    acc += s.length;
  }
  return offsets;
}

/** Grid width (columns) for a given segment total and row count. */
export const gridWidth = (total: number, rows: number): number =>
  Math.max(1, Math.ceil(total / Math.max(1, rows)));

/** Display dimensions, optionally transposed (runs shown as rows vs columns). */
export const gridDims = (width: number, rows: number, transpose: boolean) =>
  transpose ? { w: rows, h: width } : { w: width, h: rows };

export interface Orient {
  transpose: boolean;
  flipH: boolean;
  flipV: boolean;
}

/**
 * Map a visual cell (vx, vy) to a logical index. transpose/flipH/flipV together
 * cover all 8 orientations so the on-screen grid can be aligned to the physical
 * ceiling (which edge is the back wall, which side is the left wall).
 */
export function visualToLogical(vx: number, vy: number, width: number, rows: number, o: Orient): number {
  const { w, h } = gridDims(width, rows, o.transpose);
  const x = o.flipH ? w - 1 - vx : vx;
  const y = o.flipV ? h - 1 - vy : vy;
  const col = o.transpose ? y : x;
  const row = o.transpose ? x : y;
  return col * rows + row;
}

/** Map a position within a section (logical) to its physical position. */
export function localPhysical(p: number, s: Section, rows: number): number {
  if (s.serpentine && rows > 0) {
    const run = Math.floor(p / rows);
    const pos = p % rows;
    if (run % 2 === 1) p = run * rows + (rows - 1 - pos);
  }
  if (s.reversed) p = s.length - 1 - p;
  return p;
}

/** Map a global logical position to the physical segment index to send. */
export function logicalToPhysical(p: number, sections: Section[], rows: number): number {
  let offset = 0;
  for (const s of sections) {
    if (p < offset + s.length) {
      return offset + localPhysical(p - offset, s, rows);
    }
    offset += s.length;
  }
  return p;
}

/** Which section a logical position belongs to. */
export function sectionOfLogical(p: number, sections: Section[]): number {
  let offset = 0;
  for (let i = 0; i < sections.length; i++) {
    if (p < offset + sections[i].length) return i;
    offset += sections[i].length;
  }
  return Math.max(0, sections.length - 1);
}
