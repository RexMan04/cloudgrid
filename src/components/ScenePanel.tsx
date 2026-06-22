import { useRef, useState } from "react";
import { useStore } from "../store";

export function ScenePanel() {
  const scenes = useStore((s) => s.scenes);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const n = name.trim();
    if (n) {
      useStore.getState().saveScene(n);
      setName("");
    }
  };

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Scenes</strong>
        <input
          type="text"
          placeholder="scene name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button className="primary" onClick={save} disabled={!name.trim()}>
          Save current
        </button>
        <button onClick={() => useStore.getState().exportScenes()} disabled={!scenes.length}>
          Export library
        </button>
        <button onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) useStore.getState().importScenes(await f.text());
            e.target.value = "";
          }}
        />
      </div>

      {scenes.length > 0 && (
        <div className="scene-list">
          {scenes.map((sc, i) => (
            <div className="scene" key={i}>
              <span className="scene-name">{sc.name}</span>
              <span className="dim">{sc.colors.filter(Boolean).length} lit</span>
              <button onClick={() => useStore.getState().loadScene(i)}>Load</button>
              <button onClick={() => useStore.getState().deleteScene(i)} title="delete">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
