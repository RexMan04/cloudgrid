import { create } from "zustand";
import { GoveeDevice } from "./govee/ble";
import type { SegEntry } from "./govee/a3";
import { type Section, totalSegments, logicalToPhysical } from "./layout";

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const DEFAULT_SECTIONS: Section[] = [
  { length: 44, reversed: false },
  { length: 44, reversed: false },
];

const resizeColors = (prev: (string | null)[], total: number): (string | null)[] =>
  Array.from({ length: total }, (_, i) => prev[i] ?? null);

interface State {
  device: GoveeDevice | null;
  connected: boolean;
  status: string;
  busy: boolean;

  sections: Section[];
  columns: number;
  colors: (string | null)[]; // logical order, length = totalSegments(sections)
  selected: string;
  erasing: boolean;

  connect: () => Promise<void>;
  disconnect: () => void;
  setSelected: (c: string) => void;
  setErasing: (v: boolean) => void;
  setColumns: (n: number) => void;

  addSection: () => void;
  removeSection: (i: number) => void;
  setSectionLength: (i: number, len: number) => void;
  toggleReverse: (i: number) => void;

  applyCell: (logicalIndex: number) => void;
  clear: () => void;
  fillAll: () => void;
  push: () => Promise<void>;
}

// Only one scene push runs at a time; coalesce concurrent requests.
let pushing = false;
let pendingPush = false;

export const useStore = create<State>((set, get) => {
  const setSections = (sections: Section[]) =>
    set({ sections, colors: resizeColors(get().colors, totalSegments(sections)) });

  return {
    device: null,
    connected: false,
    status: "not connected",
    busy: false,

    sections: DEFAULT_SECTIONS,
    columns: 11,
    colors: Array(totalSegments(DEFAULT_SECTIONS)).fill(null),
    selected: "#ff0000",
    erasing: false,

    connect: async () => {
      const dev = new GoveeDevice();
      dev.onDisconnect = () => set({ connected: false, status: "disconnected" });
      set({ status: "connecting…" });
      try {
        await dev.connect();
        set({ device: dev, connected: true, status: `connected: ${dev.name}` });
        await dev.powerOn();
      } catch (e) {
        set({ status: `connect failed: ${(e as Error).message}` });
      }
    },
    disconnect: () => {
      get().device?.disconnect();
      set({ connected: false, status: "disconnected" });
    },

    setSelected: (c) => set({ selected: c, erasing: false }),
    setErasing: (v) => set({ erasing: v }),
    setColumns: (n) => set({ columns: Math.max(1, Math.min(48, n)) }),

    addSection: () => setSections([...get().sections, { length: 44, reversed: false }]),
    removeSection: (i) => {
      if (get().sections.length <= 1) return;
      setSections(get().sections.filter((_, idx) => idx !== i));
    },
    setSectionLength: (i, len) => {
      const clamped = Math.max(1, Math.min(45, len || 1));
      setSections(get().sections.map((s, idx) => (idx === i ? { ...s, length: clamped } : s)));
    },
    toggleReverse: (i) => {
      set({ sections: get().sections.map((s, idx) => (idx === i ? { ...s, reversed: !s.reversed } : s)) });
      void get().push(); // re-map immediately so the calibration is visible
    },

    applyCell: (logicalIndex) => {
      const colors = get().colors.slice();
      colors[logicalIndex] = get().erasing ? null : get().selected;
      set({ colors });
    },
    clear: () => {
      set({ colors: Array(totalSegments(get().sections)).fill(null) });
      void get().push();
    },
    fillAll: () => {
      set({ colors: Array(totalSegments(get().sections)).fill(get().selected) });
      void get().push();
    },

    push: async () => {
      const { device } = get();
      if (!device?.connected) return;
      if (pushing) { pendingPush = true; return; }
      pushing = true;
      set({ busy: true });
      try {
        do {
          pendingPush = false;
          const { colors, sections } = get();
          const entries: SegEntry[] = [];
          colors.forEach((c, p) => {
            if (c) {
              const [r, g, b] = hexToRgb(c);
              entries.push({ seg: logicalToPhysical(p, sections), r, g, b });
            }
          });
          await device.setScene(entries);
          set({ status: `pushed ${entries.length} lit segment(s)` });
        } while (pendingPush);
      } catch (e) {
        set({ status: `push failed: ${(e as Error).message}` });
      } finally {
        pushing = false;
        set({ busy: false });
      }
    },
  };
});
