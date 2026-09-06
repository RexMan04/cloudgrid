---
project: CloudGrid
task: System of record for CloudGrid (Govee H703B per-segment designer)
effort: E3
phase: complete
progress: 23/24 (multi-device, N lights; ISC-30 deferred to hardware)
mode: project
started: 2026-08-10
updated: 2026-09-06
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
- [x] ISC-22: Renovate detects bun-toolchain, Dockerfile, and package deps. Probe: renovate local dry-run lists them.
- [x] ISC-23: Anti: app never requires a Govee cloud account or API key for device control. Probe: grep for cloud API calls in server/.

### Multi-device (2026-09-06): second H703B on the same ceiling

- [x] ISC-24: `CG.deviceLayout(sections)` maps every global physical index to `{dev, idx}` with per-device `idx` contiguous from 0. Probe: `bun tools/test-emulator.ts` layout assertions.
- [x] ISC-25: Sections saved without a `dev` field load as device 0 (legacy localStorage migrates). Probe: Read load path; browser eval of state.sections.
- [x] ISC-26: Each section row shows a Light 1 / Light 2 toggle. Probe: playwright screenshot of Sections card.
- [x] ISC-27: Section cap is 2 per device, 4 total. Probe: grep addSection guard.
- [x] ISC-28: Device card shows one row per light, each with its own Connect/Disconnect. Probe: playwright screenshot.
- [x] ISC-29: Each slot persists its own device-id key; slot 0 keeps the legacy `cloudgrid-device-id` key. Probe: grep keys in core.
- [DEFERRED-VERIFY] ISC-30: Page load auto-reconnects both slots on Chrome/Edge. Probe: Read tryAutoConnect; live probe needs hardware.
- [x] ISC-31: buildEntries emits one scene per device, each with its own background and device-local segment indices. Probe: test-emulator assertion.
- [x] ISC-32: Scenes for several devices are written in parallel (`Promise.all`). Probe: grep sendScenes.
- [x] ISC-33: The animation loop waits for every device write before advancing the frame. Probe: Read frame loop.
- [x] ISC-34: Preview emulation decodes each device scene and maps it back onto the right cells. Probe: test-emulator round-trip across 2 devices.
- [x] ISC-35: Power on/off and Clear address every connected device. Probe: grep call sites.
- [x] ISC-36: Captured-scene replay mirrors to every connected device. Probe: grep replayScene call.
- [x] ISC-37: Connecting Light 2 when no section is assigned to it auto-adds two 44-segment sections owned by it. Probe: Read connect path.
- [x] ISC-38: A link drop on one light does not stop pushes to the other. Probe: Read sendScenes filter.
- [x] ISC-39: Picking a light already bound to the other slot is refused with a status message. Probe: grep guard.
- [x] ISC-40: Anti: single-light wire bytes are byte-identical to the pre-change encoder for legacy sections. Probe: test-emulator compares old vs new entries.
- [x] ISC-41: Anti: no runtime dependency added. Probe: package.json dependencies unchanged.
- [x] ISC-42: README documents the two-light setup and calibration. Probe: grep README.
- [x] ISC-43: Lights card has "+ Add light"; each click adds a slot with its own row. Probe: browser eval rows after 2 clicks = LIGHT 1..3.
- [x] ISC-44: A section's Light button cycles through every light and wraps. Probe: browser eval secs after two clicks = [0,2].
- [x] ISC-45: Section cap is 2 per light for any light count. Probe: 3 lights, 5 adds → 6 sections, 264 segments.
- [x] ISC-46: Removing a light drops its sections and renumbers higher lights. Probe: remove light 2 of 3 → secs [0,1,0,1], 2 rows.
- [x] ISC-47: Light count persists and never drops below what sections reference. Probe: Read load path (`lightCount`, maxDev+1).
- [x] ISC-24: Anti: no runtime npm dependencies creep into server/. Probe: package.json dependencies absent.
- [ ] ISC-25: Anti: no dependency update lands on the deployed app without a human-merged PR. Probe: Renovate PR flow once app installed.
- [x] ISC-26: Renovate App dashboard issue lists bun, dockerfile, and mise surfaces on GitHub. Probe: gh issue body.
- [x] ISC-27: CI workflow exists and passes on master. Probe: gh run green.
- [x] ISC-28: CI installs the toolchain from mise.toml via jdx/mise-action (no setup-node/npm). Probe: run log + workflow grep.
- [x] ISC-29: `tsc --noEmit` runs as the real CI check and passes. Probe: green step in run log.
- [x] ISC-30: gitleaks scans the repo in CI and passes. Probe: green gitleaks job.
- [x] ISC-31: gitleaks pre-commit hook blocks a staged fake secret locally. Probe: commit attempt fails.
- [x] ISC-32: Dependabot vulnerability alerts enabled on the repo. Probe: gh api vulnerability-alerts returns 204.
- [x] ISC-33: Anti: Dependabot automated security-fix PRs stay disabled; Renovate is the sole fixer. Probe: gh api automated-security-fixes enabled:false.

## Test Strategy

| isc | type | check | threshold | tool |
|---|---|---|---|---|
| 1-19 | functional | manual browser + device session per feature | works on H703B | browser |
| 20 | reproducibility | fresh clone, mise install, bun start | server up | Bash |
| 21 | deploy | deployed URL responds | HTTP 200 | curl |
| 22 | tooling | renovate --platform=local dry-run | 3 managers detected | Bash |
| 23-24 | anti | grep server/ for cloud calls; package.json deps | zero | Grep |
| 25 | process | Renovate PR exists before any dep change | PR per bump | GitHub |
| 26-30 | ci | dashboard issue body; gh run jobs green; run log PATH shows mise-installed bun+gitleaks | success | gh |
| 31 | hook | stage fake secret, attempt commit | exit 1, finding shown | Bash |
| 32-33 | repo-settings | gh api vulnerability-alerts (204) and automated-security-fixes (enabled:false) | exact | gh |

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
- 2026-08-12: Renovate onboarded in "Scan and Alert" mode (Scan Only is silent: no dashboard, no PRs). Hosted first-run verified: dashboard issue #1 lists all three surfaces, lock-file maintenance sits in Pending Approval per our config.
- 2026-08-12: gitleaks delivered through mise (8.30.1 in mise.toml) instead of gitleaks-action, so pre-commit and CI share one pinned binary and mise.toml stays the single toolchain source. If Renovate's mise manager can't track the aqua-backed gitleaks version, the pin just sits static; acceptable.
- 2026-08-12: Dependabot alerts enabled, automated security fixes left disabled: Renovate vulnerabilityAlerts is the sole fixer, avoiding duplicate PRs.
- 2026-08-12: E2 delegation floor relaxed (show-your-math): every step was a sub-30s direct tool call (4 file writes, 3 API calls, 1 CI watch); an agent handoff costs more than the tier budget.

- 2026-09-06 — Multi-device: per-section `dev` ownership over a device-boundary index (allows interleaved sections); global physical index stays flat so calibration math is untouched; scene split lives in core (`splitScenes`) so the byte-identity test hits real code. Advisor (Inference.ts) reviewed pre-build; applied: allSettled fan-out, blank scene for a light with no sections, persisted seed flag, duplicate-id guard. Delegation floor relaxed: two files sharing one state model, a parallel writer would collide. Project ISA edited directly (ISA skill CLI still deferred per v6.2.x note).

## Changelog

- conjectured: the repo's dependency surface was too small to justify automation (one devDependency).
- refuted_by: survey showed three independent update surfaces — bun runtime pin, `oven/bun` base image, `@types/bun` — none previously tracked.
- learned: "small repo" is measured in update surfaces, not package count; the Dockerfile base image alone justifies the convention.
- criterion_now: ISC-22 requires Renovate to detect all three surfaces.

## Verification

- ISC-22: Bash — `renovate --platform=local` (node 24 via mise, GITHUB_COM_TOKEN set): extraction stats `{"bun": 1, "dockerfile": 1, "mise": 1}` files/deps; mise entry resolved to `oven-sh/bun` github-releases with `^bun-v` extractVersion and `updates: []` because 1.3.14 IS the latest release (confirmed via `gh api`). Gotchas recorded: local platform only sees git-TRACKED files, and github-releases lookups need `GITHUB_COM_TOKEN` locally.
- ISC-23: Grep — `grep -rniE "govee.*cloud|api\.govee|developer-api" server/` exits 1, zero matches.
- ISC-24: Grep — `grep -c '"dependencies"' package.json` returns 0; no runtime deps key exists.
- ISC-26: gh — issue #1 "Dependency Dashboard" body shows Detected Dependencies: bun (package.json), dockerfile (oven/bun), mise (bun 1.3.14).
- ISC-27: gh — run 31626334113 conclusion "success" on master push f4a79d5.
- ISC-28: gh — run log: `mise install` in jdx/mise-action@v4.2.4, PATH gains `installs/bun/1.3.14/bin` and `installs/gitleaks/8.30.1`; workflow contains no setup-node/npm step.
- ISC-29: gh — typecheck job: `bunx tsc --noEmit` step green in 10s.
- ISC-30: gh — gitleaks job green; full-history pre-scan locally: "44 commits scanned … no leaks found".
- ISC-31: Bash — staged fake AWS key, `git commit` exited 1 with generic-api-key finding; hook also ran clean on the real commit (0 leaks, commit f4a79d5 created).
- ISC-32: gh — `PUT /vulnerability-alerts` then `GET` both return HTTP 204.
- ISC-33: gh — `GET /automated-security-fixes` returns `{"enabled":false,"paused":false}`.

### Multi-device 2026-09-06

- ISC-24, 31, 34, 40: `bun tools/test-layout.ts` — "layout tests: 18000 passed, 0 failed" (single-light bytes == legacy encoder; interleaved two-light round trip).
- ISC-25: Read of componentDidMount — `patch.sections.map((sec) => Object.assign({ dev: 0 }, sec))`.
- ISC-26, 28: playwright-cli screenshot of localhost:8787 — Lights card shows LIGHT 1 / LIGHT 2 rows with Connect; Sections rows show a Light 1 button.
- ISC-27: browser eval after 3× "+ Add" — sections `[[44,0],[44,0],[44,1],[44,1]]`, fourth add refused.
- ISC-29: grep core — `storageKey(slot)` returns `cloudgrid-device-id` for slot 0, `-1` suffix for slot 1.
- ISC-30: DEFERRED-VERIFY — needs both lights in range on Chrome/Edge (Brave lacks getDevices). Follow-up: Kaden's ceiling session.
- ISC-32, 38: Read sendScenes — `Promise.allSettled` over connected slots only; failures reported after all drain.
- ISC-33: Read frame loop — `await this.sendFrame(logical, { scenes })` before the gap sleep.
- ISC-35, 36: grep — powerToggle, clear and replay go through `eachDevice`.
- ISC-37: Read connect() → `ensureSectionsFor(slot)` seeds two 44-seg sections once (`seededDevs` persisted).
- ISC-39: grep core — `connect(excludeIds)` throws "already connected as another slot".
- ISC-41: package.json has no `dependencies` key; only `@types/bun` dev dep.
- ISC-42: grep README — "Light 2" appears in Requirements, Usage and roadmap.
- Browser: DOM-driven toggle S2 Light 1→2→1 persisted `[0,1,1,1]` then `[0,0,1,1]`; console errors excluding favicon: 0.
- Hardware: NOT yet seen on the ceiling. Two-link BLE throughput on this BlueZ stack is unmeasured (advisor flag).
- ISC-43..47 (2026-09-06, N lights): playwright-cli DOM-driven run on localhost — 2× "+ Add light" → rows LIGHT 1,2,3; S2 cycle → dev 2; 5× "+ Add" → secs [0,2,0,1,1,2], Grid 24 × 11, 264 segments; ✕ on light 2 → secs [0,1,0,1], 2 rows; console errors 0. `bun tools/test-layout.ts` 19729 passed (2–6 lights, interleaved).
