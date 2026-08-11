---
project: CloudGrid
task: System of record for CloudGrid (Govee H703B per-segment designer)
effort: E3
phase: complete
progress: seeded
mode: project
started: 2026-08-10
updated: 2026-08-10
---

## Problem

The Govee app treats a 270-dot string as a strand, not a canvas: no grid editor, no per-dot pattern design, no image import. The public Govee Cloud API only sets the whole strand to one color and exposes no per-segment control for the H703B. Anyone who mounts a dot-string as a 2D surface has no way to design for it.

## Vision

Paint on a grid in the browser and watch the ceiling match it, live, with no app, no cloud account, and no API key. The physical wiring (reversed sections, serpentine runs) disappears behind calibration: what you see on screen is what the room does.

## Out of Scope

Cloud accounts or any Govee Cloud API dependency. Devices beyond the H703B (other DIY-scene RGBIC devices may work; untested, future step). Native mobile apps. Multi-user or remote control beyond what the deployed web app provides.

## Constraints

- Web Bluetooth only — Chromium browsers (Chrome/Edge; Brave behind a flag), all device control local.
- Bun runtime, no npm/node build step; server is pure Bun stdlib with TypeScript executed directly.
- Reverse-engineered BLE protocol from packet captures is the substrate; no vendor SDK exists.
- Deploys to Railway via Dockerfile (`oven/bun`); `PORT` injected, `GOVEE_HOST=0.0.0.0` as service var.
- AI generation requires a Claude/OpenAI key in `.env`; the app must function fully without one.

## Goal

A browser-based grid designer that gives full per-dot control of an H703B over local Bluetooth — design, calibrate, animate, persist — reproducible from a clean checkout with `mise install` + `bun start`.

## Criteria

- [ ] ISC-1: Web Bluetooth connect to H703B succeeds from Chrome/Edge. Probe: browser session, device link up.
- [ ] ISC-2: Link auto-reconnects after drop. Probe: kill link, observe reconnect.
- [ ] ISC-3: Page load reconnects to last device without re-pair (Chrome/Edge). Probe: reload, no chooser.
- [ ] ISC-4: Brush, eraser, bucket, line, rectangle, eyedropper, box-select all function. Probe: one action each on canvas.
- [ ] ISC-5: Eyedropper clones color AND brightness. Probe: sample cell, compare both values.
- [ ] ISC-6: Per-cell brightness paints and right-click-sets. Probe: cell level readback.
- [ ] ISC-7: Output brightness master is WYSIWYG on canvas. Probe: slider change reflected on preview.
- [ ] ISC-8: Undo/redo via Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Probe: paint, undo, redo, compare.
- [ ] ISC-9: Approved-palette Snap constrains AI gen and image import. Probe: import with Snap on, colors ⊆ palette.
- [ ] ISC-10: Pattern generators (rainbow, stripes, checker, two-color gradient) render. Probe: run each.
- [ ] ISC-11: Layout calibration (reverse section, serpentine, transpose, flip-H/V) maps design correctly. Probe: known pattern on physical grid.
- [ ] ISC-12: Image import samples onto grid. Probe: import, non-empty sampled cells.
- [ ] ISC-13: Native device effects (Static, Gradient, Breathe, Twinkle, Cycle, CW, CCW) apply with speed control and persist on-device. Probe: set effect, disconnect, effect continues.
- [ ] ISC-14: Static freezes current animation frame when chosen mid-play. Probe: play, switch, frame holds.
- [ ] ISC-15: Live browser animations stream (Rainbow flow, Color cycle, Chase, Sparkle, Breathe, Wave, Scroll x4). Probe: run each, device follows.
- [ ] ISC-16: GIF/video playback samples onto grid. Probe: play file, grid animates.
- [ ] ISC-17: AI generation (static + animated) returns a valid color grid honoring Snap. Probe: prompt with key set.
- [ ] ISC-18: Scenes save/load/delete and export/import as JSON. Probe: round-trip a scene file.
- [ ] ISC-19: Device-scene preview mirrors across 2 strands (first 44 == second 44). Probe: git e5c6748 behavior on canvas.
- [ ] ISC-20: Clean checkout reproduces toolchain via `mise install` then `bun start`. Probe: fresh clone run.
- [ ] ISC-21: Railway deploy serves the app from `oven/bun` image. Probe: deployed URL responds.
- [ ] ISC-22: Renovate detects bun-toolchain, Dockerfile, and package deps. Probe: renovate local dry-run lists them.
- [x] ISC-23: Anti: app never requires a Govee cloud account or API key for device control. Probe: grep for cloud API calls in server/.
- [x] ISC-24: Anti: no runtime npm dependencies creep into server/. Probe: package.json dependencies absent.
- [ ] ISC-25: Anti: no dependency update lands on the deployed app without a human-merged PR. Probe: Renovate PR flow once app installed.

## Test Strategy

| isc | type | check | threshold | tool |
|---|---|---|---|---|
| 1-19 | functional | manual browser + device session per feature | works on H703B | browser |
| 20 | reproducibility | fresh clone, mise install, bun start | server up | Bash |
| 21 | deploy | deployed URL responds | HTTP 200 | curl |
| 22 | tooling | renovate --platform=local dry-run | 3 managers detected | Bash |
| 23-24 | anti | grep server/ for cloud calls; package.json deps | zero | Grep |
| 25 | process | Renovate PR exists before any dep change | PR per bump | GitHub |

## Features

| name | satisfies | depends_on | parallelizable |
|---|---|---|---|
| BLE protocol layer | ISC-1..3, 13 | none | no |
| Canvas + tool dock | ISC-4..8 | none | yes |
| Palette/Snap system | ISC-9, 17 | canvas | yes |
| Calibration | ISC-11, 19 | BLE layer | yes |
| Generators + import | ISC-10, 12, 16 | canvas | yes |
| Animation engines | ISC-13..15 | BLE layer | yes |
| Scene persistence | ISC-18 | canvas | yes |
| Deploy + toolchain convention | ISC-20..22, 25 | none | yes |

## Decisions

- 2026-08-10: ISA seeded from README + git log as part of the projects-convention pilot. All feature ISCs seeded UNCHECKED even though the README claims them working: a checkmark asserts a live probe happened, and documentation is not a probe (advisor caught an initial draft that laundered README claims into `[x]` marks). Only session-probed criteria carry `[x]`. First future session touching a feature promotes its ISC by probing it.
- 2026-08-10: ISC count (25) sits under the E3 soft floor of 32; show-your-math: seeded from documented surface only, without inventing untestable criteria. The count grows as real work touches the project.
- 2026-08-10: Toolchain convention adopted: `mise.toml` declares (bun 1.3.14), README § Stack describes, `renovate.json` automates detection, PR merge is the only application path, `git revert` is rollback.
- 2026-08-10: `@types/bun` pinned from `latest` to `1.3.14` — an unpinned range is invisible to update automation and drifts silently.

## Changelog

- conjectured: the repo's dependency surface was too small to justify automation (one devDependency).
- refuted_by: survey showed three independent update surfaces — bun runtime pin, `oven/bun` base image, `@types/bun` — none previously tracked.
- learned: "small repo" is measured in update surfaces, not package count; the Dockerfile base image alone justifies the convention.
- criterion_now: ISC-22 requires Renovate to detect all three surfaces.

## Verification

- ISC-23: Grep — `grep -rniE "govee.*cloud|api\.govee|developer-api" server/` exits 1, zero matches.
- ISC-24: Grep — `grep -c '"dependencies"' package.json` returns 0; no runtime deps key exists.
