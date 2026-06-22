import { useStore } from "../store";

// Effect bytes captured from the Govee app's effect buttons (best-guess names;
// verify by trying each). 0x13 renders your exact per-dot design (static).
const EFFECTS: { label: string; dir: number }[] = [
  { label: "Static", dir: 0x13 },
  { label: "Cycle", dir: 0x02 },
  { label: "Clockwise", dir: 0x09 },
  { label: "Counter-CW", dir: 0x0a },
  { label: "Twinkle", dir: 0x0f },
  { label: "Breathe", dir: 0x14 },
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
