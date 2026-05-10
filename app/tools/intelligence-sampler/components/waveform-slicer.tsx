"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SamplePicker } from "@/components/sample-picker";
import { detectBpm } from "@/lib/audio/analysis";
import { getAudioBufferChannelData } from "@/lib/audio/buffer-data";
import { resolveSample } from "@/lib/samples/resolver";
import { computeEqualSlices, detectOnsetSlices } from "@/lib/audio/slices";
import { auditionIntelligenceSamplerSlice } from "@/app/tools/intelligence-sampler/lib/play";
import { useIntelligenceSamplerStore } from "@/app/tools/intelligence-sampler/store";

export function WaveformSlicer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [status, setStatus] = useState("loading sample");
  const [error, setError] = useState<string | null>(null);
  const sampleId = useIntelligenceSamplerStore((state) => state.sampleId);
  const sampleName = useIntelligenceSamplerStore((state) => state.sampleName);
  const sliceMode = useIntelligenceSamplerStore((state) => state.sliceMode);
  const slices = useIntelligenceSamplerStore((state) => state.slices);
  const setSample = useIntelligenceSamplerStore((state) => state.setSample);
  const setDetectedBpm = useIntelligenceSamplerStore((state) => state.setDetectedBpm);
  const setSliceMode = useIntelligenceSamplerStore((state) => state.setSliceMode);
  const setSlices = useIntelligenceSamplerStore((state) => state.setSlices);
  const setBpm = useIntelligenceSamplerStore((state) => state.setBpm);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setStatus("decoding sample");

      try {
        const resolved = await resolveSample(sampleId);
        if (cancelled) {
          return;
        }

        setAudioBuffer(resolved.audioBuffer);
        const bufferData = getAudioBufferChannelData(resolved.audioBuffer);
        setSlices(
          computeEqualSlices({
            channelData: bufferData?.channelData,
            sourceSampleId: sampleId,
            sampleRate: bufferData?.sampleRate,
            durationSec: resolved.audioBuffer.duration,
          }),
        );
        setStatus(`${resolved.audioBuffer.duration.toFixed(2)} sec decoded`);

        try {
          const bpm = await detectBpm(resolved.audioBuffer);
          if (!cancelled) {
            setDetectedBpm(bpm.bpm);
            setBpm(bpm.bpm);
          }
        } catch {
          if (!cancelled) {
            setDetectedBpm(null);
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          setError(
            unknownError instanceof Error
              ? unknownError.message
              : "Sample could not be loaded",
          );
          setAudioBuffer(null);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sampleId, setBpm, setDetectedBpm, setSlices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const channel = audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.max(1, Math.floor(channel.length / width));

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#050505";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(103, 232, 249, 0.88)";
    context.lineWidth = 1;
    context.beginPath();

    for (let x = 0; x < width; x += 1) {
      let min = 1;
      let max = -1;
      const start = x * samplesPerPixel;
      const end = Math.min(channel.length, start + samplesPerPixel);

      for (let index = start; index < end; index += 1) {
        const value = channel[index] ?? 0;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }

      context.moveTo(x, ((1 - max) * height) / 2);
      context.lineTo(x, ((1 - min) * height) / 2);
    }

    context.stroke();
    context.strokeStyle = "rgba(244, 244, 245, 0.38)";
    const renderedSlices =
      slices.length > 0
        ? slices
        : computeEqualSlices({ sourceSampleId: sampleId, durationSec: audioBuffer.duration });
    renderedSlices.forEach((slice) => {
      const x = (slice.startSec / audioBuffer.duration) * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    });
  }, [audioBuffer, sampleId, slices]);

  function applyEqualSlices() {
    if (!audioBuffer) {
      return;
    }

    const bufferData = getAudioBufferChannelData(audioBuffer);
    setSliceMode("equal");
    setSlices(
      computeEqualSlices({
        channelData: bufferData?.channelData,
        sourceSampleId: sampleId,
        sampleRate: bufferData?.sampleRate,
        durationSec: audioBuffer.duration,
      }),
    );
  }

  function applyOnsetSlices() {
    if (!audioBuffer) {
      return;
    }

    const bufferData = getAudioBufferChannelData(audioBuffer);
    setSliceMode("onset");
    setSlices(
      detectOnsetSlices({
        sourceSampleId: sampleId,
        channelData: bufferData?.channelData ?? audioBuffer.getChannelData(0),
        sampleRate: audioBuffer.sampleRate,
        durationSec: audioBuffer.duration,
        sliceCount: 8,
      }),
    );
  }

  return (
    <section className="border-b border-zinc-800 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SamplePicker
          id="sample-select"
          value={sampleId}
          label="source"
          roles={["break", "loop", "oneshot", "pad", "melodic", "fx"]}
          onSelect={(sample) => {
            setSample(sample.id, sample.name, sample.role);
          }}
        />
        <span className="text-xs text-zinc-500">{sampleName}</span>
        <span className="text-xs text-zinc-600">{status}</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">slicing</span>
        <Button
          variant={sliceMode === "equal" ? "solid" : "ghost"}
          onClick={applyEqualSlices}
        >
          equal
        </Button>
        <Button
          variant={sliceMode === "onset" ? "solid" : "ghost"}
          onClick={applyOnsetSlices}
        >
          onset
        </Button>
        <span className="text-xs text-zinc-600">
          {sliceMode === "onset" ? "transient boundaries" : "fixed 8-way chops"}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={1200}
        height={180}
        className="h-44 w-full border border-zinc-800 bg-black"
        aria-label="waveform"
      />
      <div className="mt-3 grid grid-cols-8 gap-1">
        {Array.from({ length: 8 }, (_, slot) => (
          <Button
            key={slot}
            className="h-8 px-1"
            onClick={() =>
              void auditionIntelligenceSamplerSlice(sampleId, slot, {
                slicesBySampleId:
                  slices.length > 0 ? new Map([[sampleId, slices]]) : undefined,
              })
            }
          >
            {slot + 1}
          </Button>
        ))}
      </div>
      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
