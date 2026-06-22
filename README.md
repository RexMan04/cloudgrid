# CloudGrid

Design and control **Govee RGBIC dot lights** per-segment, straight from your browser over Bluetooth. No app, no cloud account, no API key.

Built for a cloud-ceiling installation (a grid of Govee dots), but works on any supported RGBIC strand.

## Why this exists

Govee's public Cloud API can only set a Govee dot string to **one color at a time** — it doesn't expose per-segment control for the H703B. So CloudGrid talks to the lights **locally over Bluetooth (Web Bluetooth)** using the device's own DIY-scene protocol, which was reverse-engineered from a Bluetooth packet capture. That gives full per-dot control, the same as the official app, with none of its limits.

## Features

- Connect to a Govee RGBIC device directly from Chrome/Edge (Web Bluetooth).
- Paint individual segments any color; changes push to the lights automatically.
- Fill / clear / eraser, color swatches + full picker.
- Configurable segment count and grid columns.

Static scenes only by design — the lights render each design locally, so there's no live animation/framerate. (Animated effects are a planned addition.)

## Requirements

- [Bun](https://bun.sh)
- A Chromium browser with Web Bluetooth: **Chrome or Edge** out of the box, or **Brave** with `brave://flags/#brave-web-bluetooth-api` enabled.
- A Govee RGBIC device that supports DIY scenes (developed against the **H703B**).

## Run

```bash
bun install
bun run dev
```

Open **http://localhost:5173**, click **Connect device**, pick your light, and start painting.

> On Windows + WSL: run these commands **inside WSL** (the dev server needs the native filesystem), then open `http://localhost:5173` in your Windows browser. Use the `localhost` URL, not the network IP — Web Bluetooth requires a secure context, and `localhost` qualifies.

## How it works

The device speaks a plaintext BLE protocol (20-byte packets, XOR checksum). A per-segment scene is a multi-packet "a3" stream:

```
header (9):  01 02 03 <dir> <speed> <bright> <bgR> <bgG> <bgB>
count  (1):  number of colored segments
entries(5n): 01 <R> <G> <B> <segmentIndex>   (repeated)
```

split across 20-byte writes (first packet `a3 00`, last `a3 ff`), then a commit packet `33 05 0a 20 03`. See [`src/govee/a3.ts`](src/govee/a3.ts) and [`src/govee/ble.ts`](src/govee/ble.ts).

## Project layout

- `src/govee/` — protocol: packet builder, a3 scene encoder, Web Bluetooth device wrapper.
- `src/` — React UI (grid editor, toolbar, Zustand store).
- `server/` — optional Bun proxy for the Govee Cloud API (whole-house control of non-segment devices).
- `tools/` — reverse-engineering utilities (BTSnoop decoder, a3 stream reassembler).

## Roadmap

- Map segment index → physical position; full 24×11 multi-device ceiling grid with snake-layout calibration.
- Saved scenes, gradients, presets, global brightness.
- Animated effects via the device's native effect engine.

## License

MIT
