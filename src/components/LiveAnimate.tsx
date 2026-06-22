import { useStore } from "../store";
import { ANIMATIONS } from "../animations";

export function LiveAnimate() {
  const animationId = useStore((s) => s.animationId);
  const connected = useStore((s) => s.connected);

  return (
    <div className="toolbar">
      <div className="row">
        <strong>Live animation</strong>
        {ANIMATIONS.map((a) => (
          <button
            key={a.id}
            className={animationId === a.id ? "active" : ""}
            disabled={!connected}
            onClick={() => useStore.getState().startAnimation(a.id)}
          >
            {a.label}
          </button>
        ))}
        <button onClick={() => useStore.getState().stopAnimation()} disabled={!animationId}>
          Stop
        </button>
      </div>
      <div className="row dim">
        Streams frames live and uses the <strong>&nbsp;Speed&nbsp;</strong> slider for frame rate.
        Per-light motion, but the page must stay open (stops when closed). Breathe / Wave animate
        your painted design; the others are generative.
      </div>
    </div>
  );
}
