import { Toolbar } from "./components/Toolbar";
import { ScenePanel } from "./components/ScenePanel";
import { ImageImport } from "./components/ImageImport";
import { Patterns } from "./components/Patterns";
import { Effects } from "./components/Effects";
import { LiveAnimate } from "./components/LiveAnimate";
import { GifVideo } from "./components/GifVideo";
import { AiGenerate } from "./components/AiGenerate";
import { Canvas } from "./components/Canvas";
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
      <ScenePanel />
      <Patterns />
      <Effects />
      <LiveAnimate />
      <ImageImport />
      <GifVideo />
      <AiGenerate />
      <Canvas />
      <Sections />

      <footer className="dim">
        Static scenes only — the lights render each design locally, so there is no live
        animation/framerate. Per-dot control runs entirely in your browser over Web Bluetooth
        (Chrome/Edge, or Brave with the Web Bluetooth flag enabled).
      </footer>
    </div>
  );
}
