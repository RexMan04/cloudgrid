import { create } from "zustand";
import { GoveeDevice } from "./govee/ble";
import type { SegEntry } from "./govee/a3";

export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const DEFAULT_SEGS = 88;

interface State {
  device: GoveeDevice | null;
  connected: boolean;
  status: string;
  busy: boolean;

  segCount: number;
  columns: number;
  colors: (string | null)[]; // hex per segment, or null = off
  selected: string;
  erasing: boolean;

  connect: () => Promise<void>;
  disconnect: () => void;
  setSelected: (c: string) => void;
  setErasing: (v: boolean) => void;
  setSegCount: (n: number) => void;
  setColumns: (n: number) => void;
  applyCell: (i: number) => void;
  clear: () => void;
  fillAll: () => void;
  push: () => Promise<void>;
}

// Only one scene push runs at a time. If another is requested while one is in
// flight, coalesce into a single trailing push that re-reads the latest colors.
let pushing = false;
let pendingPush = false;

export const useStore = create<State>((set, get) => {
  return {
    device: null,
    connected: false,
    status: "not connected",
    busy: false,

    segCount: DEFAULT_SEGS,
    columns: 11,
    colors: Array(DEFAULT_SEGS).fill(null),
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
    setSegCount: (n) => {
      const count = Math.max(1, Math.min(264, n));
      const prev = get().colors;
      set({ segCount: count, colors: Array.from({ length: count }, (_, i) => prev[i] ?? null) });
    },
    setColumns: (n) => set({ columns: Math.max(1, Math.min(48, n)) }),

    applyCell: (i) => {
      // Update local state only; the grid pushes once when the gesture ends.
      const colors = get().colors.slice();
      colors[i] = get().erasing ? null : get().selected;
      set({ colors });
    },
    clear: () => {
      set({ colors: Array(get().segCount).fill(null) });
      void get().push();
    },
    fillAll: () => {
      set({ colors: Array(get().segCount).fill(get().selected) });
      void get().push();
    },

    push: async () => {
      const { device } = get();
      if (!device?.connected) return;
      if (pushing) { pendingPush = true; return; } // coalesce — never overlap scenes
      pushing = true;
      set({ busy: true });
      try {
        do {
          pendingPush = false;
          const entries: SegEntry[] = [];
          get().colors.forEach((c, i) => {
            if (c) {
              const [r, g, b] = hexToRgb(c);
              entries.push({ seg: i, r, g, b });
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
