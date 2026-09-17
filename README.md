# CloudGrid

**A browser-based lighting editor that turns Govee dot strings into a programmable canvas.**

CloudGrid maps two-dimensional designs onto physical light strands and controls them directly over Web Bluetooth. Built for a 270-light H703B ceiling installation, it combines a pixel editor, multi-controller calibration, animation playback, and a reverse-engineered Bluetooth scene encoder.

Lighting control runs locally, without a Govee cloud account or API key. Optional AI generation adds text-to-pattern and text-to-animation tools.

## Why I built it

I mounted a Govee dot-string kit as a light-cloud on my basement ceiling and wanted to treat it as a canvas. The installation was a two-dimensional arrangement, but the available controls treated it as a strand. I needed to paint designs, map them onto the actual wiring, and send individual segment colors to the controller.

I reverse-engineered the device's Bluetooth scene protocol from packet captures and built the editor around it. The core engineering challenges are translating canvas coordinates into physical wiring order, encoding compact scenes, and pacing Bluetooth writes within the hardware's limits.

## Current capabilities

| Area | Implemented functionality |
| --- | --- |
| Design editor | Brush, eraser, fill, line, rectangle, box selection, grid-cell eyedropper, and undo/redo |
| Color control | Per-cell and master brightness, editable approved-color palette, optional palette snapping, and pattern generators |
| Physical calibration | Movable strand blocks, reverse and serpentine wiring, transpose and flips, controller identification, and segment-walk tools |
| Multiple controllers | One shared canvas, per-controller scene encoding, independent Bluetooth connections, and reconnect handling |
| Motion | Persistent on-device effects, browser-streamed animations, directional scrolling, and GIF/video import |
| Design sources | Image sampling, optional AI-generated grids and looping animations, and saved scenes with JSON import/export |
| Diagnostics | Decoded-scene preview, BLE timing instrumentation, and clickable animation tests under **View** |

**Status:** Actively developed for a personal H703B installation. The editor, protocol encoder, and calibration tools are implemented. H703B is the only hardware model tested; other models are unverified. Multi-controller routing has automated coverage, but performance depends on the physical installation.

## Engineering highlights

### Mapping a canvas onto physical wiring

Each strand is a movable block with its own dimensions, orientation, wiring direction, and controller assignment. Calibration translates the visual layout into physical segment indices, then splits the result into a scene for each controller. Gaps between blocks remain inactive canvas cells.

This separates the design from the installation: a pattern can be painted spatially without manually reasoning about wire order.

### Reverse-engineered BLE protocol

The H703B uses 20-byte Bluetooth packets with XOR checksums. CloudGrid builds multi-packet `a3` scene streams, grouping segments by color to reduce packet count, then sends a commit command to apply the scene.

The encoder and decoder live in [web/cloudgrid-core.js](web/cloudgrid-core.js). The streamed preview decodes the same scene data prepared for transmission, allowing tests to check mapping and encoding together. Utilities in [tools/](tools/) decode BTSnoop captures, reassemble scene streams, and inspect captured device scenes.

### Two animation paths

| Mode | Execution | Behavior |
| --- | --- | --- |
| On-device effects | Light controller | Static, Gradient, Breathe, Twinkle, Cycle, Clockwise, and Counter-CW; continue independently of the browser |
| Live animations | Browser over BLE | Procedural effects, scrolling designs, imported media, and AI frame sequences; require an active tab and connection |

Static is the default. Native motion previews are approximations; rotational previews move dot positions along the strand. Streamed frames are sent sequentially, waiting for writes to finish before advancing.

FPS is manually adjustable from **0.5 to 10**, with a default target of **4 FPS**. The target is not a hardware guarantee. Earlier H703B measurements over Windows BLE found roughly **3 FPS for full-color 88-segment frames** and **4–5 FPS for simpler frames**. These describe that configuration, not the entire 270-light installation. Fewer distinct colors generally mean fewer packets and shorter writes. Native effects avoid the per-frame streaming bottleneck.

## Getting started

### Requirements

- **Bun**, with the project version pinned in [mise.toml](mise.toml).
- **Brave or Microsoft Edge** with Web Bluetooth. In Brave, enable `brave://flags/#brave-web-bluetooth-api`.
- A **Govee H703B** and Bluetooth-capable computer for physical output. The editor and preview can be explored without connected lights.

### Run locally

```bash
git clone https://github.com/RexMan04/cloudgrid.git
cd cloudgrid
bun install
bun run dev
```

Open **http://localhost:8787**. Connect a device from the Lights card, calibrate the layout, and start painting. Use **+ Add light** to attach another controller to the canvas.

On Windows with WSL, run Bun inside WSL and open the app in your Windows browser. Use `localhost`, not the network IP, because Web Bluetooth requires a secure context.

### Calibrate the installation

1. Select a strand in the **Calibrate** card.
2. Use **Flash light N** to identify its controller, then **Walk light N** to compare physical segment order with the on-screen path.
3. Adjust Reverse, Snake, Flip, and Transpose to match the wiring.
4. Use **Place strands (drag)** or position controls to arrange blocks to match the installation.

Output brightness is reflected in the canvas. Physical color and motion still need to be checked on the lights: a decoded preview verifies software behavior, not the controller's rendering or individual LED behavior. The development installation occasionally exhibits hot-pink dots in hardware.

### Optional AI generation

Copy `.env.example` to `.env` and set either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. The Bun server makes generation requests and keeps the key server-side. Enable palette snapping to constrain generated colors to the approved palette.

Painting, calibration, imports, and Bluetooth control work without an AI key.

## Architecture

```text
Browser editor
  ├─ Design + brightness + layout mapping
  │    └─ Per-controller scenes → BLE encoder → Web Bluetooth → H703B
  │                              └─ Scene decoder → streamed preview
  └─ Optional generation request → Bun /api/generate → AI provider

Bun serves the frontend and API from one process on localhost:8787.
```

The server uses Bun's standard library with **no runtime npm dependencies**. The frontend uses JavaScript and a vendored design-component runtime that loads React from a CDN; there is no frontend build step. CDN-loaded scripts and fonts mean the application is not fully self-contained offline.

| Path | Responsibility |
| --- | --- |
| [web/CloudGrid.dc.html](web/CloudGrid.dc.html) | Editor UI, calibration, scene management, and playback |
| [web/cloudgrid-core.js](web/cloudgrid-core.js) | BLE transport, scene encoder/decoder, layout mapping, and image sampling |
| [web/captured-scenes.js](web/captured-scenes.js) | Captured native device scenes |
| [server/index.ts](server/index.ts) | Static file server and generation endpoint |
| [server/ai.ts](server/ai.ts) | Static and animated pattern generation |
| [tools/](tools/) | Protocol analysis utilities and automated checks |

## Development and verification

Run the deterministic protocol and layout checks:

```bash
bun tools/test-emulator.ts
bun tools/test-layout.ts
```

These exercise scene encode/decode round trips, single-controller compatibility, multi-controller segment ownership, and coordinate mapping. They do not verify radio reliability or physical lighting output.

[CI](.github/workflows/ci.yml) runs TypeScript checking and Gitleaks secret scanning. Tool versions are pinned in [mise.toml](mise.toml), with dependency update PRs configured through [Renovate](renovate.json). Docker and Railway configuration are also included.

To enable the repository's local pre-commit hook, install the pinned tools with `mise install`, then run:

```bash
git config core.hooksPath .githooks
```

## Future work

- Scene playlists and a frame-by-frame animation editor.
- Hardware validation and protocol adaptation for additional device models.
- Screen-wide color sampling beyond the current grid-cell eyedropper.

## License

MIT
