import { Toolbar } from "./components/Toolbar";
import { Sections } from "./components/Sections";

export function App() {
  return (
    <div className="app">
      <header>
        <h1>CloudGrid</h1>
        <p className="dim">
          Design and control Govee RGBIC dot lights over Bluetooth. Connect, pick a color,
          and paint segments — changes push to the lights automatically.
        </p>
      </header>

      <Toolbar />
      <Sections />

      <footer className="dim">
        Static scenes only — the lights render each design locally, so there is no live
        animation/framerate. Per-dot control runs entirely in your browser over Web Bluetooth
        (Chrome/Edge, or Brave with the Web Bluetooth flag enabled).
      </footer>
    </div>
  );
}
