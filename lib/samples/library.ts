import { z } from "zod";

import { curatedSuiteSamples } from "@/lib/samples/curated-suite";
import { SampleRoleSchema, type SampleRole } from "@/lib/samples/roles";

export const LibraryGenreSchema = z.enum([
  "jungle-dnb",
  "uk-dubstep",
  "ambient-experimental",
  "club-house",
  "vocal-world",
  "cinematic-fx",
]);

export type LibraryGenre = z.infer<typeof LibraryGenreSchema>;

export const LibrarySampleKindSchema = z.enum([
  "amen-break",
  "drum-break",
  "drum-loop",
  "top-loop",
  "percussion-loop",
  "bass-loop",
  "bass-hit",
  "drum-hit",
  "melodic-loop",
  "melodic-hit",
  "pad-drone",
  "vocal-phrase",
  "fx-hit",
  "fx-texture",
]);

export type LibrarySampleKind = z.infer<typeof LibrarySampleKindSchema>;

export const LibrarySampleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pack: z.string().min(1),
  role: SampleRoleSchema,
  href: z.string().startsWith("/"),
  genre: LibraryGenreSchema.optional(),
  kind: LibrarySampleKindSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  sourcePath: z.string().min(1).optional(),
  estimatedBpm: z.number().min(40).max(260).optional(),
  key: z.string().optional(),
});

export type LibrarySample = z.infer<typeof LibrarySampleSchema>;

const baseLibrarySamples = [
  {
    id: "library:jungle/let-there-break",
    name: "Let There Break",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "break",
    href: "/samples/jungle-jungle/let-there-break.wav",
  },
  {
    id: "library:jungle/first-contact-amen",
    name: "First Contact Amen",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "break",
    href: "/samples/jungle-jungle/first-contact-amen.wav",
  },
  {
    id: "library:jungle/stepper-amen",
    name: "Stepper Amen",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "break",
    href: "/samples/jungle-jungle/stepper-amen.wav",
  },
  {
    id: "library:jungle/control-amen",
    name: "Control Amen",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "break",
    href: "/samples/jungle-jungle/control-amen.wav",
  },
  {
    id: "library:jungle/tear-apache-4a",
    name: "Tear Apache",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "break",
    key: "4A",
    href: "/samples/jungle-jungle/tear-apache-4a.wav",
  },
  {
    id: "library:jungle/cool-bell-4a",
    name: "Cool Bell",
    pack: "Blu Mar Ten - Jungle Jungle",
    role: "fx",
    key: "4A",
    href: "/samples/jungle-jungle/cool-bell-4a.wav",
  },
  {
    id: "library:element-one/140-stripped-drum-loop-03",
    name: "140 Stripped Drum Loop 03",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "loop",
    estimatedBpm: 140,
    href: "/samples/expanded-library/element-one/140-stripped-drum-loop-03.wav",
  },
  {
    id: "library:element-one/140-hat-loop-04",
    name: "140 Hat Loop 04",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "loop",
    estimatedBpm: 140,
    href: "/samples/expanded-library/element-one/140-hat-loop-04.wav",
  },
  {
    id: "library:element-one/140-shaker-loop-01",
    name: "140 Shaker Loop 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "loop",
    estimatedBpm: 140,
    href: "/samples/expanded-library/element-one/140-shaker-loop-01.wav",
  },
  {
    id: "library:element-one/kick-01",
    name: "Kick 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "oneshot",
    href: "/samples/expanded-library/element-one/kick-01.wav",
  },
  {
    id: "library:element-one/snare-03",
    name: "Snare 03",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "oneshot",
    href: "/samples/expanded-library/element-one/snare-03.wav",
  },
  {
    id: "library:element-one/closed-hat-01",
    name: "Closed Hat 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "oneshot",
    href: "/samples/expanded-library/element-one/closed-hat-01.wav",
  },
  {
    id: "library:element-one/rimshot-01",
    name: "Rimshot 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "oneshot",
    href: "/samples/expanded-library/element-one/rimshot-01.wav",
  },
  {
    id: "library:element-one/synth-pad-swell-01",
    name: "Synth Pad Swell 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "pad",
    key: "E",
    href: "/samples/expanded-library/element-one/synth-pad-swell-01.wav",
  },
  {
    id: "library:element-one/synth-chord-skank",
    name: "Synth Chord Skank",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "melodic",
    key: "E",
    href: "/samples/expanded-library/element-one/synth-chord-skank.wav",
  },
  {
    id: "library:element-one/sub-pluck",
    name: "Sub Pluck",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "melodic",
    key: "E",
    href: "/samples/expanded-library/element-one/sub-pluck.wav",
  },
  {
    id: "library:element-one/fx-glitch-01",
    name: "FX Glitch 01",
    pack: "Element One - Classic UK Dubstep Essentials",
    role: "fx",
    href: "/samples/expanded-library/element-one/fx-glitch-01.wav",
  },
  {
    id: "library:zero-g/glasychord",
    name: "Glasychord",
    pack: "Zero-G Ambient 1",
    role: "pad",
    href: "/samples/expanded-library/zero-g-ambient/glasychord.wav",
  },
  {
    id: "library:zero-g/hyperpad",
    name: "Hyperpad",
    pack: "Zero-G Ambient 1",
    role: "pad",
    href: "/samples/expanded-library/zero-g-ambient/hyperpad.wav",
  },
  {
    id: "library:zero-g/sparkledrone",
    name: "Sparkledrone",
    pack: "Zero-G Ambient 1",
    role: "pad",
    href: "/samples/expanded-library/zero-g-ambient/sparkledrone.wav",
  },
  {
    id: "library:zero-g/infiniloop",
    name: "Infiniloop",
    pack: "Zero-G Ambient 1",
    role: "loop",
    href: "/samples/expanded-library/zero-g-ambient/infiniloop.wav",
  },
  {
    id: "library:zero-g/arps-loop",
    name: "Arps Loop",
    pack: "Zero-G Ambient 1",
    role: "melodic",
    href: "/samples/expanded-library/zero-g-ambient/arps-loop.wav",
  },
  {
    id: "library:zero-g/fastbellloop",
    name: "Fast Bell Loop",
    pack: "Zero-G Ambient 1",
    role: "loop",
    href: "/samples/expanded-library/zero-g-ambient/fastbellloop.wav",
  },
  {
    id: "library:goldbaby/808-bd-t7d3-orig",
    name: "808 BD T7D3 Orig",
    pack: "Goldbaby Tape808 & Tape909",
    role: "oneshot",
    href: "/samples/expanded-library/goldbaby-tape/808-bd-t7d3-orig.wav",
  },
  {
    id: "library:goldbaby/808-hh-orig",
    name: "808 HH Orig",
    pack: "Goldbaby Tape808 & Tape909",
    role: "oneshot",
    href: "/samples/expanded-library/goldbaby-tape/808-hh-orig.wav",
  },
  {
    id: "library:goldbaby/808-clap-orig",
    name: "808 Clap Orig",
    pack: "Goldbaby Tape808 & Tape909",
    role: "oneshot",
    href: "/samples/expanded-library/goldbaby-tape/808-clap-orig.wav",
  },
] satisfies LibrarySample[];

export const librarySamples = [
  ...baseLibrarySamples,
  ...curatedSuiteSamples,
] satisfies LibrarySample[];

export function getLibrarySamples(role?: SampleRole): LibrarySample[] {
  const parsed = librarySamples.map((sample) => LibrarySampleSchema.parse(sample));
  return role ? parsed.filter((sample) => sample.role === role) : parsed;
}

export function getLibrarySamplesByRoles(roles: readonly SampleRole[]): LibrarySample[] {
  const allowed = new Set(roles);
  return getLibrarySamples().filter((sample) => allowed.has(sample.role));
}

export function getDefaultLibrarySample(roles?: readonly SampleRole[]): LibrarySample {
  const sample = roles
    ? roles
        .map((role) => getLibrarySamples(role)[0])
        .find((candidate) => candidate !== undefined) ?? getLibrarySamples()[0]
    : getLibrarySamples()[0];

  if (!sample) {
    throw new Error("No library samples configured");
  }

  return sample;
}

export function getLibrarySample(id: string): LibrarySample | null {
  return getLibrarySamples().find((sample) => sample.id === id) ?? null;
}

export function assertLibrarySample(id: string): LibrarySample {
  const sample = getLibrarySample(id);
  if (!sample) {
    throw new Error(`Unknown library sample: ${id}`);
  }

  return sample;
}
