import { create } from "zustand";
import { persist } from "zustand/middleware";
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

const newSection = (): Section => ({ length: 44, reversed: false, serpentine: false });
const DEFAULT_SECTIONS: Section[] = [newSection(), newSection()];

const resizeColors = (prev: (string | null)[], total: number): (string | null)[] =>
  Array.from({ length: total }, (_, i) => prev[i] ?? null);

export interface SavedScene {
  name: string;
  colors: (string | null)[];
}

interface State {
  device: GoveeDevice | null;
  connected: boolean;
  status: string;
  busy: boolean;

  sections: Section[];
  rows: number; // LEDs per run = grid height (un-transposed)
  transpose: boolean; // flip the editor view so runs show as rows
  colors: (string | null)[];
  selected: string;
  erasing: boolean;
  scenes: SavedScene[];

  connect: () => Promise<void>;
  disconnect: () => void;
  setSelected: (c: string) => void;
  setErasing: (v: boolean) => void;
  setRows: (n: number) => void;
  toggleTranspose: () => void;

  addSection: () => void;
  removeSection: (i: number) => void;
  setSectionLength: (i: number, len: number) => void;
  toggleReverse: (i: number) => void;
  toggleSerpentine: (i: number) => void;

  applyCell: (logicalIndex: number) => void;
  applyDesign: (colors: (string | null)[]) => void;
  clear: () => void;
  fillAll: () => void;
  push: () => Promise<void>;

  saveScene: (name: string) => void;
  loadScene: (i: number) => void;
  deleteScene: (i: number) => void;
  exportScenes: () => void;
  importScenes: (json: string) => void;
}

// Only one scene push runs at a time; coalesce concurrent requests.
let pushing = false;
let pendingPush = false;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const setSections = (sections: Section[]) =>
        set({ sections, colors: resizeColors(get().colors, totalSegments(sections)) });

      return {
        device: null,
        connected: false,
        status: "not connected",
        busy: false,

        sections: DEFAULT_SECTIONS,
        rows: 11,
        transpose: false,
        colors: Array(totalSegments(DEFAULT_SECTIONS)).fill(null),
        selected: "#ff0000",
        erasing: false,
        scenes: [],

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
        setRows: (n) => {
          set({ rows: Math.max(1, Math.min(45, n || 1)) });
          void get().push();
        },
        toggleTranspose: () => set({ transpose: !get().transpose }), // view-only



        addSection: () => {
          if (get().sections.length >= 2) return;
          setSections([...get().sections, newSection()]);
        },
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
          void get().push();
        },
        toggleSerpentine: (i) => {
          set({ sections: get().sections.map((s, idx) => (idx === i ? { ...s, serpentine: !s.serpentine } : s)) });
          void get().push();
        },

        applyCell: (logicalIndex) => {
          const colors = get().colors.slice();
          colors[logicalIndex] = get().erasing ? null : get().selected;
          set({ colors });
        },
        applyDesign: (next) => {
          set({ colors: resizeColors(next, totalSegments(get().sections)) });
          void get().push();
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
              const { colors, sections, rows } = get();
              const entries: SegEntry[] = [];
              colors.forEach((c, p) => {
                if (c) {
                  const [r, g, b] = hexToRgb(c);
                  entries.push({ seg: logicalToPhysical(p, sections, rows), r, g, b });
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

        saveScene: (name) => {
          const scene: SavedScene = { name, colors: [...get().colors] };
          set({ scenes: [...get().scenes.filter((s) => s.name !== name), scene] });
        },
        loadScene: (i) => {
          const scene = get().scenes[i];
          if (!scene) return;
          set({ colors: resizeColors(scene.colors, totalSegments(get().sections)) });
          void get().push();
        },
        deleteScene: (i) => set({ scenes: get().scenes.filter((_, idx) => idx !== i) }),
        exportScenes: () => {
          const data = JSON.stringify({ app: "cloudgrid", scenes: get().scenes }, null, 2);
          const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = "cloudgrid-scenes.json";
          a.click();
          URL.revokeObjectURL(url);
        },
        importScenes: (json) => {
          try {
            const parsed = JSON.parse(json);
            const incoming: SavedScene[] = Array.isArray(parsed) ? parsed : parsed.scenes;
            if (!Array.isArray(incoming)) return;
            const byName = new Map(get().scenes.map((s) => [s.name, s]));
            for (const s of incoming) if (s?.name && Array.isArray(s.colors)) byName.set(s.name, s);
            set({ scenes: [...byName.values()] });
          } catch {
            set({ status: "import failed: invalid file" });
          }
        },
      };
    },
    {
      name: "cloudgrid",
      partialize: (s) => ({
        sections: s.sections,
        rows: s.rows,
        transpose: s.transpose,
        selected: s.selected,
        scenes: s.scenes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.colors = Array(totalSegments(state.sections)).fill(null);
      },
    },
  ),
);
