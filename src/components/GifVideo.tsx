import { useRef, useState } from "react";
import { useStore } from "../store";
import { sampleSource, type SampleOpts } from "../sampler";

const MAX_FRAMES = 240;

// Decode a GIF/animated image into sampled frames via WebCodecs ImageDecoder.
async function framesFromImage(file: File, opts: SampleOpts): Promise<(string | null)[][]> {
  const AnyImageDecoder = (globalThis as unknown as { ImageDecoder?: any }).ImageDecoder;
  if (!AnyImageDecoder) throw new Error("ImageDecoder unavailable (use Chrome/Edge).");
  const dec = new AnyImageDecoder({ data: await file.arrayBuffer(), type: file.type || "image/gif" });
  await dec.tracks.ready;
  const count: number = dec.tracks.selectedTrack?.frameCount ?? 1;
  const frames: (string | null)[][] = [];
  for (let i = 0; i < Math.min(count, MAX_FRAMES); i++) {
    const { image } = await dec.decode({ frameIndex: i });
    frames.push(sampleSource(image, image.displayWidth, image.displayHeight, opts));
    image.close();
  }
  return frames;
}

// Decode a video by seeking and grabbing frames at ~6 fps.
async function framesFromVideo(file: File, opts: SampleOpts): Promise<(string | null)[][]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("could not load video"));
    });
    const step = 1 / 6;
    const frames: (string | null)[][] = [];
    for (let t = 0; t < video.duration && frames.length < MAX_FRAMES; t += step) {
      video.currentTime = t;
      await new Promise<void>((res) => (video.onseeked = () => res()));
      frames.push(sampleSource(video, video.videoWidth, video.videoHeight, opts));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GifVideo() {
  const sections = useStore((s) => s.sections);
  const rows = useStore((s) => s.rows);
  const transpose = useStore((s) => s.transpose);
  const flipH = useStore((s) => s.flipH);
  const flipV = useStore((s) => s.flipV);
  const playing = useStore((s) => s.animationId === "__frames__");
  const connected = useStore((s) => s.connected);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [sat, setSat] = useState(160);

  const load = async (file: File) => {
    const opts: SampleOpts = {
      sections, rows, transpose, flipH, flipV,
      fit: "cover", rotate: false,
      adjust: { sat, bright: 100, contrast: 110 },
    };
    setStatus("decoding…");
    try {
      const frames = file.type.startsWith("video/")
        ? await framesFromVideo(file, opts)
        : await framesFromImage(file, opts);
      if (!frames.length) { setStatus("no frames found"); return; }
      setStatus(`playing ${frames.length} frames`);
      useStore.getState().playFrames(frames);
    } catch (e) {
      setStatus(`failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="toolbar">
      <div className="row">
        <strong>GIF / video</strong>
        <button disabled={!connected} onClick={() => fileRef.current?.click()}>Choose GIF / video</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,image/webp,image/apng,video/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }}
        />
        <button disabled={!playing} onClick={() => useStore.getState().stopAnimation()}>Stop</button>
        <span className="dim">{status}</span>
      </div>
      <div className="row">
        <label>Saturation</label>
        <input type="range" min={0} max={300} value={sat} onChange={(e) => setSat(Number(e.target.value))} />
        <span className="dim">{sat}% (applied on next load)</span>
      </div>
      <div className="row dim">
        Samples each frame to the grid and plays the loop live (uses the Speed slider for frame rate).
        Page must stay open; capped at {MAX_FRAMES} frames. Needs Chrome/Edge for GIF decoding.
      </div>
    </div>
  );
}
