# Vintage FX Expansion Plan

## Current FX Unit

The shared FX path is centered on `FxManifest`, `FxPattern`, `FxSlotPanel`, and `createToneFxGraph` / `createOfflineFxOutput`.

What works now:

- Two serial slots, `A` and `B`.
- Stable manifest contract for built-in effect names, descriptions, default wet values, and default params.
- Live Tone graph and offline Web Audio graph both exist.
- Probability automation can punch wet values in and out per slot.
- Current palette: `repeat`, `chorus`, `delay`, `reverb`, `hall-reverb`, `hybrid-reverb`, `reverse-reverb`.

What blocks a large vintage palette:

- `FxKindSchema` is a fixed enum, so every new effect has to be added in schema, tests, UI, live graph, and offline graph.
- `FxSlot` has no per-slot `params`; `defaultParams` are in the manifest, but the UI cannot edit them.
- `FxSlotPanel` renders effect, wet, and probability only; it ignores `manifest.parameters`.
- `createToneFxStage` and `createOfflineFxStage` branch on individual slugs. This will become hard to maintain once we add 30-50 effects.
- The graph only supports two serial slots. Yamaha A3000-style processing wants at least three blocks; FX500/SPX-style patches often want composite chains such as compressor -> modulation -> reverb/delay.

## Source Conventions

Yamaha SPX90 / FX500:

- SPX-style classics include Reverb, Early Reflection, Delay, Echo, Stereo Flange, Chorus, Stereo Phasing, Tremolo, Symphonic, Reverb + Gate, Pitch Change, Freeze, Auto Pan, and PEQ.
- SPX Early Reflection has low/high density variants and selectable reflection patterns such as Hall, Random, Plate, and Reverse.
- SPX gate-style programs expose trigger level, trigger delay, trigger mask, attack, decay, hold, and release.
- FX500 explicitly exposes Symphonic as a broad sweeping dimension effect, plus reverb/delay types including Hall, Room, Vocal, Plate, Early Reflection Hall/Random/Reverse/Plate, Delay, Echo, Reverb + Delay, Reverb -> Delay, and Delay -> Reverb.

Yamaha A3000 / later workstation flavor:

- A3000 is directly relevant to jungle and breakbeat use because Yamaha described it as a phrase and break-beat sampler with a triple-block effects system.
- The A3000 effect list contains mangling names worth borrowing as presets: Scratch, Auto Synth, Tech Modulation, Noisy Mod Delay, Flanging Pan, Flow Pan, Noise Ambient, Low Resolution, Noisy, Attack LoFi, Radio, Digital Turntable, Jump, Beat Change, Voice Canceler, 3BandEQ, Aural Exciter, Auto Wah + Dist, Touch Wah + Dist, Distortion, Overdrive, and Amp Simulator.
- Motif XS-era effect lists preserve many useful Yamaha family names: SPX Hall, SPX Room, SPX Stage, Cross Delay, Tempo Cross Delay, SPX Chorus, Symphonic, Ensemble Detune, Classic Flanger, Dynamic Flanger, Tempo Phaser, Auto Pan, Amp Simulator, VCM Touch Wah, Lo-Fi, Noisy, Digital Turntable, Ring Modulator, Dynamic Filter, Auto Synth, Isolator, Slice, Tech Modulation, Talking Modulator, Pitch Change, and Early Reflection.

E-mu Z-plane:

- Morpheus introduced Z-Plane filtering as a filter that can smoothly change function over time.
- The Morpheus manual describes it as up to eight complex filters and one of 197 Z-Plane filters.
- The practical browser emulation should be "Z-plane inspired," not a claim of a bit-accurate E-mu clone: morph between two multi-filter response frames using cascaded/parallel biquad or IIR sections, then modulate `morph`, `frequency`, and `transform` from LFO/envelope/probability.

Web Audio primitives:

- Use `DelayNode` for delay lines and feedback cycles.
- Use `ConvolverNode` for reverb, early reflection, gated/reverse generated impulse responses.
- Use `BiquadFilterNode` for common resonant filters, shelves, notches, EQ, and wah.
- Use `IIRFilterNode` for custom filter coefficient sets and richer filter-bank shapes.
- Use `WaveShaperNode` for distortion, overdrive, amp saturation, and low-resolution clipping.
- Use `AudioWorklet` only when a browser-native graph cannot express the effect, especially for freeze buffers, beat repeat, scratch, resampling, and smoother Z-plane-style coefficient interpolation.

## Contract Changes

Make the FX layer data-driven before adding the big catalog.

```ts
type FxSlotId = "A" | "B" | "C" | "D";

type FxFamily =
  | "spx"
  | "fx500"
  | "a3000"
  | "motif"
  | "emu"
  | "utility";

type FxModel =
  | "passthrough"
  | "delay-line"
  | "multi-tap-delay"
  | "modulated-delay"
  | "algorithmic-reverb"
  | "early-reflection"
  | "gated-reverb"
  | "pitch-shift"
  | "freeze-buffer"
  | "pan-mod"
  | "lofi-sampler"
  | "waveshaper-drive"
  | "ring-mod"
  | "dynamic-filter"
  | "filter-bank-morph"
  | "composite-chain";

type FxSlot = {
  id: FxSlotId;
  effect: FxKind;
  wet: number;
  params: Record<string, string | number | boolean>;
  probability: FxProbability;
};

type FxManifest = {
  slug: FxKind;
  name: string;
  family: FxFamily;
  tags: Array<"shoegaze" | "jungle" | "dub" | "ambient" | "industrial" | "lofi">;
  model: FxModel;
  defaultWet: number;
  defaultParams: Record<string, string | number | boolean>;
  parameters: FxParameterManifest[];
};
```

Then refactor `createToneFxStage` / `createOfflineFxStage` to dispatch by `manifest.model`, not by slug. Slugs should become presets; models should own DSP.

## First Catalog

### Shoegaze / Dream Pop

- `spx-reverse-gate` / `SPX Reverse Gate`: reverse early-reflection convolver, short pre-delay, gated tail, high wet. Refines the current `reverse-reverb`.
- `spx-early-reflection-reverse` / `SPX Early Reflection Reverse`: dense multi-tap early reflection with reverse-shaped tap gains.
- `fx500-soft-focus` / `FX500 Soft Focus`: composite chain: plate-like convolver -> split wet path into multi-voice Symphonic chorus, slight octave-up pitch layer, dry reverb path, optional fixed digital delay.
- `spx-symphonic` / `SPX Symphonic`: multi-voice modulated delay with slow LFOs, stereo phase spread, more dimension than ordinary chorus.
- `spx-pitch-change-7` / `SPX Pitch Change +7`: short-window pitch shifter, plus detuned dry blend.
- `spx-stereo-flange` / `SPX Stereo Flange`: modulated short delay with feedback and inverted channel phase.
- `motif-ensemble-detune` / `Ensemble Detune`: several micro-detuned delay taps, no obvious LFO wobble.

### Jungle / Breakbeat

- `a3000-low-resolution` / `A3000 Low Resolution`: bit depth reduction, sample-rate hold, anti-alias dulling, output trim.
- `a3000-noisy-mod-delay` / `A3000 Noisy Mod Delay`: modulated tempo delay with noise injection, high damp, feedback.
- `a3000-digital-turntable` / `A3000 Digital Turntable`: transient-triggered speed dive / brake; should use AudioWorklet.
- `a3000-digital-scratch` / `A3000 Digital Scratch`: short buffer gesture playback with forward/backward scrub; AudioWorklet.
- `a3000-jump` / `A3000 Jump`: retriggered buffer jumps synced to step probability; AudioWorklet or scheduled one-shot buffer segments.
- `motif-slice` / `Motif Slice`: tempo-gated amplitude pattern plus optional filter/pan pattern.
- `emu-z-plane-morph` / `E-mu Z-Plane Morph`: morphing filter-bank for moving notches/peaks on breaks, pads, and bass.
- `emu-vowel-morph` / `E-mu Vowel Morph`: formant filter-bank morph between vowel targets.
- `motif-dynamic-filter` / `Dynamic Filter`: envelope-follower cutoff/Q motion for breaks and bass.
- `motif-isolator` / `Isolator`: three-band DJ-style mute/boost.

### Dub / Ambient / Utility

- `spx-hall` / `SPX Hall`: generated convolver with low density and darker high damping.
- `spx-room` / `SPX Room`: short, grainier room with early-reflection balance.
- `spx-stage` / `SPX Stage`: medium room/stage with more pre-delay.
- `fx500-reverb-delay` / `FX500 Reverb + Delay`: parallel reverb and delay.
- `fx500-reverb-into-delay` / `FX500 Reverb -> Delay`: reverb smear feeding repeat.
- `fx500-delay-into-reverb` / `FX500 Delay -> Reverb`: echo softened into reverb.
- `motif-cross-delay` / `Cross Delay`: left-to-right and right-to-left feedback delay.
- `spx-auto-pan` / `SPX Auto Pan`: speed/depth/phase pan LFO.
- `spx-triggered-pan` / `SPX Triggered Pan`: envelope-triggered pan sweep.
- `motif-talking-modulator` / `Talking Modulator`: vowel formant filter with LFO or envelope morph.
- `motif-ring-modulator` / `Ring Modulator`: oscillator multiply with tone filtering.
- `motif-dynamic-ring` / `Dynamic Ring Modulator`: envelope-followed ring frequency or wet.

## DSP Model Notes

`spx-reverse-gate`

- Keep the generated reverse impulse response, but move it into an `early-reflection` / `gated-reverb` model.
- Parameters: `type`, `roomSize`, `liveness`, `preDelay`, `gateHold`, `gateRelease`, `swell`, `density`.
- Offline and live can both use generated `ConvolverNode` buffers.

`spx-symphonic`

- Use 3 or 4 modulated delay voices per channel.
- Delay range: roughly 4-18 ms.
- Slow LFOs with left/right phase offsets.
- Add a tiny pitch-spread by modulating delay time, not by resampling.
- Parameters: `speedHz`, `depth`, `voices`, `spread`, `tone`.

`fx500-soft-focus`

- Composite chain:
  - input -> plate-ish convolver
  - wet split A -> Symphonic chorus
  - wet split B -> octave-up pitch shifter at low level
  - wet split C -> plain reverb
  - optional fixed digital delay after wet sum
- Needs `composite-chain` model so it does not pollute the core graph with one-off branching.

`emu-z-plane-morph`

- Start with a bank of 4-8 filters. Each target frame is an array of filter specs:
  - `{ type: "peaking" | "notch" | "bandpass" | "lowpass" | "highpass", frequencyHz, q, gainDb }`
- `morph` interpolates frequency, Q, and gain between frame A and frame B.
- `transform` can select a second destination frame or add extra resonant peaks.
- For live: use Biquad nodes first for easy automation. If zippering or topology changes become audible, move to AudioWorklet.
- For offline: use the same native nodes and schedule param ramps so exported WAV matches preview.

`a3000-low-resolution`

- WaveShaper for quantization plus sample-and-hold resampling.
- Native graph can do bitcrush with WaveShaper; sample-rate hold is cleaner in AudioWorklet.
- Parameters: `bits`, `sampleRateHz`, `noise`, `tone`, `jitter`.

`a3000-scratch` / `a3000-jump` / `freeze`

- Requires a short rolling buffer and read-head modulation.
- Do this in AudioWorklet, not in React/Tone state.
- Keep deterministic offline by implementing the same processor as a pure sample-array renderer for export tests.

## UI Changes

`FxSlotPanel` should become a small rack editor:

- Group effects by family: SPX, FX500, A3000, Motif, E-mu, Utility.
- Add style filters: Shoegaze, Jungle, Dub, Ambient, Lo-Fi.
- Render `manifest.parameters` dynamically as sliders/selects/toggles.
- Store per-slot `params`, not just `wet`.
- Show model/evidence text in the slot: "convolver", "modulated delay", "AudioWorklet", "offline-safe".
- Add a reset-to-default button per slot.
- Increase slots to 4, but keep CPU warnings when multiple expensive effects are active.

## Verification Gates

Every new effect needs:

- Manifest schema test: slug appears, default params parse, parameter controls have valid ranges.
- Live graph smoke test: `createToneFxGraph` accepts the effect and disposes without leaking nodes.
- Offline graph render test: effect changes rendered buffer RMS/peak versus dry input without clipping.
- Determinism test for generated buffers: same params produce same impulse/filter response.
- Style preset test: shoegaze and jungle preset bundles select only supported effect slugs.
- Export parity test: the same `FxPattern` used for live preview is accepted by offline WAV render.

## Implementation Order

1. Add `params` to `FxSlotSchema` and preserve backwards compatibility by defaulting to `{}`.
2. Update `updateFxSlot` so changing `effect` resets `params` to that manifest's `defaultParams`.
3. Render dynamic controls from `manifest.parameters` in `FxSlotPanel`.
4. Change stage creation to `switch (manifest.model)` and pass merged `{ ...defaultParams, ...slot.params }`.
5. Add the easy native-graph batch first:
   - SPX Hall / Room / Stage
   - SPX Early Reflection Reverse
   - SPX Reverse Gate
   - SPX Symphonic
   - FX500 Reverb + Delay / Reverb -> Delay / Delay -> Reverb
   - Motif Cross Delay
   - Auto Pan / Tremolo
   - Ring Modulator / Dynamic Filter / Isolator
6. Add the shoegaze composite:
   - FX500 Soft Focus
7. Add the jungle manglers:
   - A3000 Low Resolution
   - A3000 Noisy Mod Delay
   - Motif Slice
8. Add the E-mu inspired filter-bank:
   - Z-Plane Morph
   - Vowel Morph
9. Add AudioWorklet-only buffer effects:
   - Digital Scratch
   - Digital Turntable
   - Jump
   - Freeze

## Sources

- Yamaha SPX90 manual: https://www.manualslib.com/guide/3712824/yamaha-spx90-manual.html
- Yamaha SPX90II manual PDF: https://usa.yamaha.com/files/download/other_assets/1/317181/SPX90IIE.pdf
- Yamaha FX500 manual: https://www.manualslib.com/manual/3387862/Yamaha-Fx500.html?page=16
- Yamaha A3000 owner manual PDF: https://de.yamaha.com/files/download/other_assets/3/328693/A3000E.PDF
- Yamaha Motif XS data list mirror: https://manualmachine.com/yamaha/xs6motif/10588951-user-manual/
- E-mu Morpheus operation manual PDF: https://www.polynominal.com/site/studio/gear/synth/emu_morpheus/emu-morpheus-manual.pdf
- MDN IIRFilterNode guide: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_IIR_filters
- MDN ConvolverNode: https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode
- MDN WaveShaperNode: https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode
- MDN DelayNode: https://developer.mozilla.org/en-US/docs/Web/API/DelayNode
- MDN AudioWorklet source: https://github.com/mdn/content/blob/main/files/en-us/web/api/audioworklet/index.md
