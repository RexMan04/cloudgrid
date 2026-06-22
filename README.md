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
- Fill / clear / eraser, color swatches + full picker.
- Configurable segment count and grid columns.

Static scenes only by design — the lights render each design locally, so there's no live animation/framerate. (Animated effects are a planned addition.)

## Requirements

- [Bun](https://bun.sh)
- A Chromium browser with Web Bluetooth: **Chrome or Edge** out of the box, or **Brave** with `brave://flags/#brave-web-bluetooth-api` enabled.
- A Govee **H703B** dot-string light. That's the only device I've built and tested against. Other Govee RGBIC devices that use the same DIY-scene Bluetooth protocol may work, but I haven't tried them yet (adapting to more devices is a possible future step).

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
