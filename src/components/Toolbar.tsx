import { useStore } from "../store";

const SWATCHES = ["#ff0000", "#ff7a00", "#ffd400", "#00ff00", "#00ffd5", "#0066ff", "#8a2be2", "#ff00aa", "#ffffff"];

export function Toolbar() {
  const s = useStore();

  return (
    <div className="toolbar">
      <div className="row">
        {s.connected ? (
          <button onClick={s.disconnect}>Disconnect</button>
        ) : (
          <button className="primary" onClick={s.connect}>Connect device</button>
        )}
        <span className="status">{s.status}</span>
        {s.busy && <span className="dim">pushing…</span>}
      </div>

      <div className="row">
        <label>Color</label>
        <input
          type="color"
          value={s.selected}
          onChange={(e) => s.setSelected(e.target.value)}
        />
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={"swatch" + (s.selected === c && !s.erasing ? " active" : "")}
              style={{ background: c }}
              onClick={() => s.setSelected(c)}
              title={c}
            />
          ))}
        </div>
        <button
          className={s.erasing ? "active" : ""}
          onClick={() => s.setErasing(!s.erasing)}
        >
          Eraser
        </button>
      </div>

      <div className="row">
        <button onClick={s.fillAll}>Fill all</button>
        <button onClick={s.clear}>Clear</button>
        <button className="primary" onClick={() => void s.push()} disabled={!s.connected}>
          Push now
        </button>
      </div>

      <div className="row dim">
        <label>Grid columns</label>
        <input type="number" min={1} max={48} value={s.columns}
          onChange={(e) => s.setColumns(Number(e.target.value))} style={{ width: 60 }} />
        <span>(how each section wraps on screen)</span>
      </div>
    </div>
  );
}
