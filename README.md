# CloudGrid

Design and control **Govee RGBIC dot lights** per-segment, straight from your browser over Bluetooth. No app, no cloud account, no API key.

Built to turn a Govee dot-string kit into a designable grid. Mine is a light-cloud on my basement ceiling.

## Why I built this

I grabbed a Govee dot-string kit on a Black Friday deal a while back, 270 lights, basically for free, and I wanted to actually do something with them instead of stringing them on the house. So I decided to build a grid on my basement ceiling, a little cloud of lights.

The problem is the Govee app has no real grid editor. There's no good way to design per-dot patterns or drop in an image and have it show up on the lights. These are string lights, so the app treats them as a strand, not a canvas. And the public Govee Cloud API only lets you set the whole strand to one color; it doesn't expose per-segment control for the H703B at all.

So I reverse-engineered the device's Bluetooth protocol from packet captures and built CloudGrid: a grid-based pattern maker that talks to the lights locally over Web Bluetooth, gives full per-dot control (the same as the app, without its limits), and lets me calibrate the physical layout (reversing sections and handling snake/zigzag wiring) so a clean design on screen maps correctly onto however the strip is actually mounted.

It's working well for my setup. I'm still developing it.

## Features

- Connect to a Govee RGBIC device directly from Chrome/Edge (Web Bluetooth).
- Paint individual segments any color; changes push to the lights automatically.
- Fill / clear / eraser, color swatches + full picker, global brightness.
- Configurable segment count, sections, and grid rows/columns.
- Layout calibration: reverse a section, serpentine (snake) wiring, and transpose / flip-H / flip-V to align the on-screen grid to the physical install.
- Built-in pattern generators and image import (drop in an image, it samples onto the grid).
- On-device effects via the H703B's native effect engine (Static, Clockwise, Counter-CW, Breathe, Flash) with adjustable speed. These persist and run on the device itself.
- Live animations streamed from the browser frame-by-frame (Rainbow flow, Color cycle, Chase, Sparkle, Breathe design, Wave), plus GIF/video playback sampled onto the grid.
- AI pattern generation: describe a pattern in words and Claude/OpenAI returns a color grid (needs an AI key in `.env`, see below).
- Saved scenes: save, load, delete, and export/import as JSON.

Two kinds of motion are available: the device's **native effects** (persistent, rendered on-device, no streaming) and **live animations** (the browser computes and streams each frame, so they stop when the tab closes). Plain painted designs are static scenes the device holds locally.

## Requirements

- [Bun](https://bun.sh)
- A Chromium browser with Web Bluetooth: **Chrome or Edge** out of the box, or **Brave** with `brave://flags/#brave-web-bluetooth-api` enabled.
- A Govee **H703B** dot-string light. That's the only device I've built and tested against. Other Govee RGBIC devices that use the same DIY-scene Bluetooth protocol may work, but I haven't tried them yet (adapting to more devices is a possible future step).

## Run

```bash
bun run dev
```

Open **http://localhost:8787**, click **Connect device**, pick your light, and start painting. (`bun install` first if you want editor types; the app itself has no runtime dependencies.)

One Bun process serves the whole thing: the static frontend and the AI endpoint. The browser talks to the lights directly over Web Bluetooth, so the server is only in the loop for AI generation.

> On Windows + WSL: run this **inside WSL**, then open `http://localhost:8787` in your Windows browser. Use the `localhost` URL, not the network IP. Web Bluetooth requires a secure context, and `localhost` qualifies.

## AI generation (optional)

The AI panel turns a text prompt into a color grid. The key stays server-side and never reaches the browser. Add one of these to `.env` (copy `.env.example`) and the panel works automatically:

```
ANTHROPIC_API_KEY=...      # or
OPENAI_API_KEY=...
```

Everything else works without a key.

## How it works

The device speaks a plaintext BLE protocol (20-byte packets, XOR checksum). A per-segment scene is a multi-packet "a3" stream:

```
header (9):  01 02 03 <dir> <speed> <bright> <bgR> <bgG> <bgB>
count  (1):  number of colored segments
entries(5n): 01 <R> <G> <B> <segmentIndex>   (repeated)
```

split across 20-byte writes (first packet `a3 00`, last `a3 ff`), then a commit packet `33 05 0a 20 03`. The protocol, scene encoder, and image sampler all live in [`web/cloudgrid-core.js`](web/cloudgrid-core.js).

## Project layout

- `web/`: the frontend. `CloudGrid.dc.html` is the UI (a self-contained design component — no build step; React loads from a CDN at runtime), `cloudgrid-core.js` is the Govee BLE protocol + image sampler, `support.js` is the design-component runtime.
- `server/`: the Bun server. `index.ts` serves `web/` and the AI endpoint; `ai.ts` holds the AI call.
- `tools/`: reverse-engineering utilities (BTSnoop decoder, a3 stream reassembler).

## Roadmap

- Map segment index → physical position; full 24×11 multi-device ceiling grid.
- Gradients and presets.
- Broader device support beyond the H703B.

## License

MIT
