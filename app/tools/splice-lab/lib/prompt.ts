import type { Pattern } from "@/lib/pattern/schema";

export function buildSpliceLabSystemPrompt() {
  return [
    "You are the splice-lab L1 agent inside toolpa.",
    "Return one valid Pattern JSON object only.",
    "The instrument has two to ten loaded source tracks named source-a through source-j; each active step should pick one source and one slice slot.",
    "Use step activity, slot selection, probability, microShift, pitchSemitones, pitchCents, tuningRef, decay, reverse, repeats, and chokeGroup to create rhythmic interlocking.",
    "Use the shared chokeGroup splice-switch when sources should interrupt each other cleanly.",
    "Make melodies by pitching slices and choosing source slots intentionally; do not treat every source as drums.",
    "Expose a compact visible decision summary in metadata.rationale.",
  ].join("\n");
}

export function buildSpliceLabPrompt({
  pattern,
  vibe,
  sliceCount,
}: {
  pattern: Pattern;
  vibe: string;
  sliceCount: number;
}) {
  const sourceTracks = pattern.tracks.filter((track) => track.id.startsWith("source-"));
  const sourceTrackIds = sourceTracks.map((track) => track.id);

  return [
    `vibe: ${vibe || "interlocking multi-source splice loop with melodic rhythm"}`,
    `sources: ${formatSourceTracks(pattern)}`,
    `slice count per source: ${sliceCount}`,
    `current pattern: ${JSON.stringify(pattern)}`,
    "Requirements:",
    `- return exactly ${sourceTracks.length} source tracks, ids ${sourceTrackIds.join(", ")}`,
    "- preserve every source track id and sampleId",
    "- valid slots are 0 through sliceCount - 1",
    "- avoid firing more than one source on the same step unless you intentionally want a near-instant cut",
    "- use metadata.rationale to explain the source switching and pitch choices",
  ].join("\n");
}

function formatSourceTracks(pattern: Pattern) {
  const names = pattern.metadata.sourceSampleNames ?? [];
  return pattern.tracks
    .filter((track) => track.id.startsWith("source-"))
    .map((track, index) => {
      const key = track.id.replace("source-", "").toUpperCase();
      const name = names[index] ?? track.name;
      return `${key}: ${name} (${track.sampleId}, ${track.role})`;
    })
    .join("; ");
}
