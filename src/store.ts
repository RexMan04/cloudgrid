import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GoveeDevice } from "./govee/ble";
import type { SegEntry } from "./govee/a3";
import { type Section, totalSegments, logicalToPhysical, gridWidth, gridDims, visualToLogical } from "./layout";
import { ANIMATIONS } from "./animations";

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
  transpose: boolean; // swap the editor view axes (runs show as rows)
  flipH: boolean; // mirror the view left/right
  flipV: boolean; // mirror the view top/bottom
  colors: (string | null)[];
  selected: string;
  erasing: boolean;
  brightness: number; // 0-100, applied as RGB scaling on push
  effect: number; // a3 header effect byte (0x13 = static; others animate on-device)
  speed: number; // a3 header speed byte (also paces live animations)
  animationId: string | null; // active live animation (browser-streamed)
  scenes: SavedScene[];

  connect: () => Promise<void>;
  disconnect: () => void;
  setSelected: (c: string) => void;
  setErasing: (v: boolean) => void;
  setRows: (n: number) => void;
  setBrightness: (n: number) => void;
  setEffect: (n: number) => void;
  setSpeed: (n: number) => void;
  toggleTranspose: () => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;

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

  startAnimation: (id: string) => void;
  stopAnimation: () => void;

  saveScene: (name: string) => void;
  loadScene: (i: number) => void;
  deleteScene: (i: number) => void;
  exportScenes: () => void;
  importScenes: (json: string) => void;
}

// Only one scene push runs at a time; coalesce concurrent requests.
let pushing = false;
let pendingPush = false;

// Live-animation loop state (browser-streamed frames).
let animRunning = false;
let animFrame = 0;
const animSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialize whole scenes (animation frames + static pushes) so their packets
// never interleave on the wire. A generation counter lets a priority action
// (Clear) skip scenes that are queued but not yet started.
let sceneChain: Promise<unknown> = Promise.resolve();
let sceneGen = 0;
function queueScene(fn: () => Promise<void>): Promise<void> {
  const myGen = sceneGen;
  const run = sceneChain.then(() => (myGen === sceneGen ? fn() : undefined));
  sceneChain = run.catch(() => {});
  return run;
}

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
        flipH: false,
        flipV: false,
        colors: Array(totalSegments(DEFAULT_SECTIONS)).fill(null),
        selected: "#ff0000",
        erasing: false,
        brightness: 100,
        effect: 0x13,
        speed: 50,
        animationId: null,
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
        setBrightness: (n) => {
          set({ brightness: Math.max(0, Math.min(100, Math.round(n))) });
          void get().push();
        },
        setEffect: (n) => {
          set({ effect: n });
          void get().push();
        },
        setSpeed: (n) => {
          set({ speed: Math.max(1, Math.min(100, Math.round(n))) });
          void get().push();
        },
        toggleTranspose: () => set({ transpose: !get().transpose }), // view-only
        toggleFlipH: () => set({ flipH: !get().flipH }),
        toggleFlipV: () => set({ flipV: !get().flipV }),



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
          if (animRunning) { animRunning = false; set({ animationId: null }); }
          // An empty scene + a motion effect doesn't reliably go dark, so send
          // an explicit whole-strand off. Bump the generation so any queued
          // scene is skipped and the off goes out as soon as the wire is free.
          sceneGen++;
          const dev = get().device;
          if (dev?.connected) {
            set({ status: "cleared" });
            void queueScene(() => dev.setAll(0, 0, 0));
          }
        },
        fillAll: () => {
          set({ colors: Array(totalSegments(get().sections)).fill(get().selected) });
          void get().push();
        },

        push: async () => {
          const { device } = get();
          if (!device?.connected) return;
          // Any static push (effect change, paint, pattern, image...) ends a
          // running live animation rather than being ignored by it.
          if (animRunning) {
            animRunning = false;
            set({ animationId: null });
          }
          if (pushing) { pendingPush = true; return; }
          pushing = true;
          set({ busy: true });
          try {
            do {
              pendingPush = false;
              const { colors, sections, rows, brightness } = get();
              const scale = brightness / 100;
              const entries: SegEntry[] = [];
              colors.forEach((c, p) => {
                if (c) {
                  const [r, g, b] = hexToRgb(c);
                  entries.push({
                    seg: logicalToPhysical(p, sections, rows),
                    r: Math.round(r * scale),
                    g: Math.round(g * scale),
                    b: Math.round(b * scale),
                  });
                }
              });
              await queueScene(() => device.setScene(entries, { dir: get().effect, speed: get().speed }));
              set({ status: `pushed ${entries.length} lit segment(s)` });
            } while (pendingPush);
          } catch (e) {
            set({ status: `push failed: ${(e as Error).message}` });
          } finally {
            pushing = false;
            set({ busy: false });
          }
        },

        startAnimation: (id) => {
          set({ animationId: id });
          if (animRunning) return; // loop already running; it picks up the new id
          animRunning = true;
          animFrame = 0;
          const loop = async () => {
            while (animRunning) {
              const st = get();
              const anim = ANIMATIONS.find((a) => a.id === st.animationId);
              if (!st.device?.connected || !anim) break;

              const total = totalSegments(st.sections);
              const width = gridWidth(total, st.rows);
              const { w, h } = gridDims(width, st.rows, st.transpose);
              const orient = { transpose: st.transpose, flipH: st.flipH, flipV: st.flipV };
              const designAt = (vx: number, vy: number) =>
                st.colors[visualToLogical(vx, vy, width, st.rows, orient)] ?? null;
              const ctx = { w, h, frame: animFrame, selected: st.selected, designAt };

              const scale = st.brightness / 100;
              const entries: SegEntry[] = [];
              for (let vy = 0; vy < h; vy++) {
                for (let vx = 0; vx < w; vx++) {
                  const logical = visualToLogical(vx, vy, width, st.rows, orient);
                  if (logical >= total) continue;
                  const c = anim.fn(vx, vy, ctx);
                  if (!c) continue;
                  const [r, g, b] = hexToRgb(c);
                  entries.push({
                    seg: logicalToPhysical(logical, st.sections, st.rows),
                    r: Math.round(r * scale),
                    g: Math.round(g * scale),
                    b: Math.round(b * scale),
                  });
                }
              }
              try {
                await queueScene(() => st.device!.setScene(entries, { dir: 0x13, speed: st.speed }));
              } catch {
                /* frame dropped; keep going */
              }
              animFrame++;
              const interval = 400 - ((st.speed - 1) / 99) * 350; // speed -> frame gap
              await animSleep(Math.max(30, interval));
            }
            animRunning = false;
          };
          void loop();
        },
        stopAnimation: () => {
          animRunning = false;
          set({ animationId: null });
          void get().push(); // restore the static design
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
        flipH: s.flipH,
        flipV: s.flipV,
        selected: s.selected,
        brightness: s.brightness,
        effect: s.effect,
        speed: s.speed,
        scenes: s.scenes,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.colors = Array(totalSegments(state.sections)).fill(null);
      },
    },
  ),
);
