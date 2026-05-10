export type SliceRegion = {
  id: string;
  sourceSampleId: string;
  slot: number;
  startSec: number;
  endSec: number;
  durationSec: number;
};

export type AudioChannelData = Float32Array | Float32Array[];

export type ComputeEqualSlicesInput = {
  channelData?: AudioChannelData;
  sourceSampleId: string;
  sampleRate?: number;
  snapToZeroCrossing?: boolean;
  durationSec: number;
  sliceCount?: number;
  zeroCrossingWindowMs?: number;
};

export type DetectOnsetSlicesInput = {
  sourceSampleId: string;
  channelData: AudioChannelData;
  sampleRate: number;
  durationSec: number;
  sliceCount?: number;
  frameSize?: number;
  snapToZeroCrossing?: boolean;
  transientPrerollMs?: number;
  zeroCrossingWindowMs?: number;
};

export function createSliceSampleId(sourceSampleId: string, slot: number) {
  return `${sourceSampleId}#slice/${slot}`;
}

export function computeEqualSlices(input: ComputeEqualSlicesInput): SliceRegion[] {
  const sliceCount = input.sliceCount ?? 8;

  assertSliceInput(input.durationSec, sliceCount);

  const durationSec = input.durationSec / sliceCount;
  const boundaries = Array.from({ length: sliceCount + 1 }, (_, index) =>
    index === sliceCount ? input.durationSec : index * durationSec,
  );
  const snappedBoundaries = maybeSnapBoundaries({
    boundaries,
    channelData: input.channelData,
    durationSec: input.durationSec,
    sampleRate: input.sampleRate,
    snapToZeroCrossing: input.snapToZeroCrossing,
    windowMs: input.zeroCrossingWindowMs,
  });

  return buildSlicesFromBoundaries({
    boundaries: snappedBoundaries,
    durationSec: input.durationSec,
    sliceCount,
    sourceSampleId: input.sourceSampleId,
  });
}

export function detectOnsetSlices(input: DetectOnsetSlicesInput): SliceRegion[] {
  const sliceCount = input.sliceCount ?? 8;
  const frameSize = input.frameSize ?? 1024;
  const transientPrerollSec = (input.transientPrerollMs ?? 2) / 1000;

  assertSliceInput(input.durationSec, sliceCount);

  if (!Number.isInteger(frameSize) || frameSize < 64) {
    throw new Error("Frame size must be an integer greater than or equal to 64");
  }

  const onsetTimes = detectOnsetTimesFromSignal(
    mixChannelsToMono(input.channelData),
    input.sampleRate,
    {
      frameSize,
      maxOnsets: sliceCount - 1,
      minSpacingSec: input.durationSec / (sliceCount * 2),
    },
  ).map((timeSec) => Math.max(0, timeSec - transientPrerollSec));

  const boundaries = normalizeBoundaries(
    [0, ...onsetTimes, input.durationSec],
    input.durationSec,
  );

  if (boundaries.length < sliceCount + 1) {
    for (const fallback of computeEqualSlices(input)) {
      boundaries.push(fallback.startSec);
    }
    boundaries.push(input.durationSec);
  }

  const uniqueBoundaries = normalizeBoundaries(
    maybeSnapBoundaries({
      boundaries,
      channelData: input.channelData,
      durationSec: input.durationSec,
      sampleRate: input.sampleRate,
      snapToZeroCrossing: input.snapToZeroCrossing,
      windowMs: input.zeroCrossingWindowMs,
    }),
    input.durationSec,
  )
    .slice(0, sliceCount)
    .concat(input.durationSec);

  return buildSlicesFromBoundaries({
    boundaries: uniqueBoundaries,
    durationSec: input.durationSec,
    sliceCount,
    sourceSampleId: input.sourceSampleId,
  });
}

export function snapSliceRegionsToZeroCrossings({
  channelData,
  durationSec,
  sampleRate,
  slices,
  windowMs,
}: {
  channelData: AudioChannelData;
  durationSec: number;
  sampleRate: number;
  slices: SliceRegion[];
  windowMs?: number;
}) {
  const boundaries = [
    slices[0]?.startSec ?? 0,
    ...slices.map((slice) => slice.endSec),
  ];
  const snapped = maybeSnapBoundaries({
    boundaries,
    channelData,
    durationSec,
    sampleRate,
    snapToZeroCrossing: true,
    windowMs,
  });

  return buildSlicesFromBoundaries({
    boundaries: snapped,
    durationSec,
    sliceCount: slices.length,
    sourceSampleId: slices[0]?.sourceSampleId ?? "sample",
  });
}

export function snapTimeToNearestZeroCrossing({
  channelData,
  durationSec,
  sampleRate,
  timeSec,
  windowMs = 5,
}: {
  channelData: AudioChannelData;
  durationSec: number;
  sampleRate: number;
  timeSec: number;
  windowMs?: number;
}) {
  const channels = normalizeChannelData(channelData);
  const sampleCount = channels[0]?.length ?? 0;
  if (sampleCount === 0 || sampleRate <= 0) {
    return clamp(timeSec, 0, durationSec);
  }

  const centerIndex = Math.round(clamp(timeSec, 0, durationSec) * sampleRate);
  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const start = clampInt(centerIndex - windowSamples, 0, sampleCount - 1);
  const end = clampInt(centerIndex + windowSamples, 0, sampleCount - 1);
  let bestIndex = clampInt(centerIndex, start, end);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = start; index <= end; index += 1) {
    const score = getZeroCrossingScore(channels, index);
    if (
      score < bestScore ||
      (score === bestScore && Math.abs(index - centerIndex) < Math.abs(bestIndex - centerIndex))
    ) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return clamp(bestIndex / sampleRate, 0, durationSec);
}

export function detectOnsetTimesFromSignal(
  channelData: Float32Array,
  sampleRate: number,
  options: {
    frameSize?: number;
    maxOnsets?: number;
    minSpacingSec?: number;
  } = {},
): number[] {
  const frameSize = options.frameSize ?? 1024;
  const maxOnsets = options.maxOnsets ?? 7;
  const minSpacingSec = options.minSpacingSec ?? 0.08;

  if (channelData.length === 0 || maxOnsets <= 0) {
    return [];
  }

  const energies: number[] = [];
  for (let start = 0; start < channelData.length; start += frameSize) {
    let sum = 0;
    const end = Math.min(channelData.length, start + frameSize);
    for (let index = start; index < end; index += 1) {
      const value = channelData[index] ?? 0;
      sum += value * value;
    }
    energies.push(sum / Math.max(1, end - start));
  }

  const flux = energies.map((energy, index) => {
    if (index === 0) {
      return 0;
    }
    return Math.max(0, energy - (energies[index - 1] ?? 0));
  });
  const sortedFlux = [...flux].sort((left, right) => left - right);
  const median = sortedFlux[Math.floor(sortedFlux.length / 2)] ?? 0;
  const threshold = Math.max(median * 6, 0.0005);
  const candidates = flux
    .map((value, frameIndex) => ({
      value,
      timeSec: (frameIndex * frameSize) / sampleRate,
    }))
    .filter((candidate) => candidate.timeSec > 0.01 && candidate.value >= threshold)
    .sort((left, right) => right.value - left.value);

  const selected: number[] = [];
  for (const candidate of candidates) {
    if (selected.length >= maxOnsets) {
      break;
    }

    if (
      selected.every(
        (timeSec) => Math.abs(timeSec - candidate.timeSec) >= minSpacingSec,
      )
    ) {
      selected.push(candidate.timeSec);
    }
  }

  return selected.sort((left, right) => left - right);
}

export function getSliceForSlot(slices: SliceRegion[], slot: number): SliceRegion {
  const slice = slices.find((region) => region.slot === slot);
  if (!slice) {
    throw new Error(`Missing slice slot ${slot}`);
  }

  return slice;
}

function assertSliceInput(durationSec: number, sliceCount: number) {
  if (durationSec <= 0) {
    throw new Error("Sample duration must be positive");
  }

  if (!Number.isInteger(sliceCount) || sliceCount < 1 || sliceCount > 256) {
    throw new Error("Slice count must be an integer between 1 and 256");
  }
}

function maybeSnapBoundaries({
  boundaries,
  channelData,
  durationSec,
  sampleRate,
  snapToZeroCrossing,
  windowMs,
}: {
  boundaries: number[];
  channelData?: AudioChannelData;
  durationSec: number;
  sampleRate?: number;
  snapToZeroCrossing?: boolean;
  windowMs?: number;
}) {
  const shouldSnap = snapToZeroCrossing ?? Boolean(channelData && sampleRate);
  if (!shouldSnap || !channelData || !sampleRate) {
    return boundaries;
  }

  return boundaries.map((boundary, index) => {
    if (index === 0 || index === boundaries.length - 1) {
      return boundary;
    }

    return snapTimeToNearestZeroCrossing({
      channelData,
      durationSec,
      sampleRate,
      timeSec: boundary,
      windowMs,
    });
  });
}

function buildSlicesFromBoundaries({
  boundaries,
  durationSec,
  sliceCount,
  sourceSampleId,
}: {
  boundaries: number[];
  durationSec: number;
  sliceCount: number;
  sourceSampleId: string;
}) {
  const normalized = normalizeBoundaries(boundaries, durationSec);
  return Array.from({ length: sliceCount }, (_, slot) => {
    const fallbackStart = (slot / sliceCount) * durationSec;
    const fallbackEnd = ((slot + 1) / sliceCount) * durationSec;
    const startSec = normalized[slot] ?? fallbackStart;
    const endSec = normalized[slot + 1] ?? fallbackEnd;

    return {
      id: createSliceSampleId(sourceSampleId, slot),
      sourceSampleId,
      slot,
      startSec,
      endSec,
      durationSec: Math.max(0.001, endSec - startSec),
    };
  });
}

function normalizeChannelData(channelData: AudioChannelData) {
  return Array.isArray(channelData) ? channelData : [channelData];
}

function mixChannelsToMono(channelData: AudioChannelData) {
  const channels = normalizeChannelData(channelData);
  if (channels.length === 1) {
    return channels[0] ?? new Float32Array();
  }

  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[index] ?? 0;
    }
    mono[index] = sum / channels.length;
  }
  return mono;
}

function getZeroCrossingScore(channels: Float32Array[], index: number) {
  let amplitude = 0;
  let crossed = false;

  for (const channel of channels) {
    const value = channel[index] ?? 0;
    const previous = channel[Math.max(0, index - 1)] ?? value;
    amplitude += Math.abs(value);
    crossed ||= (previous <= 0 && value >= 0) || (previous >= 0 && value <= 0);
  }

  return amplitude / Math.max(1, channels.length) - (crossed ? 0.000001 : 0);
}

function normalizeBoundaries(boundaries: number[], durationSec: number) {
  return [...new Set(boundaries.map((value) => clamp(value, 0, durationSec)))]
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || value - (values[index - 1] ?? 0) > 0.001);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}
