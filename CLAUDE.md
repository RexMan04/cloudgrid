# CloudGrid: Project-Scoped Rules

**Read `README.md` first.** It is accurate and covers what this is, the BLE protocol,
the measured frame rate, and the project layout. This file does not restate it.

This file exists because 14 separate corrections in this repo traced back to the same
handful of facts, none of which were written anywhere. Every rule below is something
Kaden had to say to me more than once, or had to say at all.

## The device is physical, and the physical facts are not in the code

- The strip is an **H703B dot string, 270 lights**, mounted as a **light-cloud on the
  basement ceiling**. It is a grid on screen and a strand in reality; the calibration
  (reversed sections, snake/zigzag wiring) is what reconciles the two.
- **Some dots are hot pink, occasionally, in hardware.** They are not a rendering bug
  and not a protocol bug. Any feature that maps a design onto the strip has to survive
  them. Kaden had to point this out after it was missed.
- Verification of anything visual ultimately means **Kaden looking at the ceiling**.
  Screenshots of the canvas prove the canvas, not the lights. Do not report a lighting
  behaviour as working on the strength of the preview.

## Preview must preview the thing, not an impression of it

The single most repeated correction here:

> "the clockwise is doing a gradient shift thing in the preview, its not previewing
> where the dots are. I already told you how they move, and you didnt even try to fix it"

**Motion effects move dot POSITIONS. The preview must animate positions.** A hue or
gradient shift across a static grid looks vaguely like motion and is not motion. If the
real device rotates which dots are lit, the preview rotates which cells are lit.

## Brightness lives in three places, and the bug is usually the prompt

1. **Per-cell brightness**, painted at the brush level, or right-click a cell.
2. **Output brightness**, the master on the right. The canvas honours it (WYSIWYG).
3. **The AI generation prompt**, and this is the one that bit repeatedly.

> "What i meant by the brightness thing is that in the AI prompt it tells the AI to max
> the brightness of every color it pics."

When Kaden says brightness is wrong, **check `server/ai.ts` and the prompt text before
touching the renderer.** The default was the prompt instructing the model to max every
colour it picked. Generated designs should use **the Output brightness value that is
actually set**, not 100%.

Related, same root: the AI and image-upload tools should draw from an **approved colours
list** (extendable from a button) so generated art is not always 100% saturated.

## UI defaults Kaden has already chosen

- **Collapsible panels start CLOSED.** He asked for this explicitly after they shipped
  open: *"they currrently are open when i open the page and i dont want that."*
- **Static is the default** and a painted design must stay dead still until an effect is
  chosen. A painted image that flashes or animates on its own is a bug, not an effect.
- **FPS is set manually.** Do not auto-ramp the speed.
- **Debug tooling lives under View, in its own collapsible section**, as clickable
  buttons rather than instructions to run something.
- Long help text goes in a **hover tooltip icon**, not permanently on screen.

## Known unfinished, do not silently re-attempt

- **The eyedropper only samples grid cells.** Kaden wants it to sample **any pixel on
  screen**, which the Web platform does not hand you from a canvas app. He parked it:
  *"just remind me to fix it later."* Raise it, do not burn an hour rediscovering that
  it is hard.

## Browser and environment

- Web Bluetooth needs Chromium and a secure context. **Kaden does not want stock Google
  Chrome.** Use **Brave** with `brave://flags/#brave-web-bluetooth-api` enabled, or Edge.
- Run **inside WSL**, open `http://localhost:8787` from the Windows browser. The
  `localhost` URL specifically, not the network IP.
- One Bun process serves frontend and AI endpoint. Do not add a second server or
  reintroduce CORS plumbing; Kaden had it removed once already.

## Operating rules

1. **bun, TypeScript, no runtime dependencies.** The app ships with none. Keep it that way.
2. **Do not estimate in afternoons.** Kaden: *"stop overestimating how long things like
   that will take. it wont take 'an afternoon' its one prompt and like 10 minutes."*
   Give a real estimate or none.
3. **"Still doesn't work" appeared three times in this repo** (Bluetooth twice, the
   flag animation once). Before saying something is fixed, say exactly what was
   observed and by whom. If it has not been seen on the ceiling, say that.
