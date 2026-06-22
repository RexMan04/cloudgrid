import { useStore } from "../store";

// Effect bytes confirmed on the H703B by observed behavior. 0x13 = static
// (holds the exact per-dot design); the rest animate on-device and persist.
const EFFECTS: { label: string; dir: number }[] = [
  { label: "Static", dir: 0x13 },
  { label: "Clockwise", dir: 0x09 },
  { label: "Counter-CW", dir: 0x0a },
  { label: "Breathe", dir: 0x14 },
  { label: "Flash", dir: 0x0f },
];

export function Effects() {
  const effect = useStore((s) => s.effect);
  const speed = useStore((s) => s.speed);

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Effect</strong>
        {EFFECTS.map((e) => (
          <button
            key={e.dir}
            className={effect === e.dir ? "active" : ""}
            onClick={() => useStore.getState().setEffect(e.dir)}
          >
            {e.label}
          </button>
        ))}
        <label>try byte</label>
        <input
          type="number"
          min={0}
          max={255}
          value={effect}
          onChange={(e) => useStore.getState().setEffect(Number(e.target.value))}
          style={{ width: 64 }}
          title="probe other effect bytes to find more animations (e.g. color cycle / rainbow flow)"
        />
        <span className="dim">0x{effect.toString(16).padStart(2, "0")}</span>
      </div>
      <div className="row">
        <label>Speed</label>
        <input
          type="range"
          min={1}
          max={100}
          value={speed}
          onChange={(e) => useStore.getState().setSpeed(Number(e.target.value))}
          style={{ width: 220 }}
        />
        <span className="dim">{speed}</span>
      </div>
      <div className="row dim">
        Motion effects run on the controller, so they keep animating after you close the page.
        <strong>&nbsp;Static&nbsp;</strong> holds your exact per-dot design. Effect names are
        best-guess from the Govee app, try each to see which is which.
      </div>
    </div>
  );
}
