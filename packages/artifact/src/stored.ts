import type { Trace } from '@toolpa/trace';
import { ArtifactError, openArtifact, sealArtifact, type SealedArtifact } from './artifact.ts';
import { packToolpa, unpackToolpa } from './zip.ts';

export function isZipToolpa(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function zipForEnvelope(sealed: SealedArtifact, trace?: Trace): Promise<Uint8Array> {
  const packed = await packToolpa(
    {
      chain: sealed.artifact.chain,
      title: 'chain',
      name: 'chain',
      parents: sealed.artifact.parents,
      seq: sealed.artifact.parents.length + 1,
    },
    trace,
  );
  return packed.bytes;
}

export async function openStoredArtifact(bytes: Uint8Array, trace?: Trace): Promise<SealedArtifact> {
  if (!isZipToolpa(bytes)) return openArtifact(bytes, trace);
  const unpacked = await unpackToolpa(bytes, trace);
  for (const parent of unpacked.parents) {
    if (!/^[a-f0-9]{64}$/.test(parent)) {
      throw new ArtifactError('parent', 'parent ids must be 64 lowercase hex characters');
    }
  }
  return sealArtifact({ chain: unpacked.chain, parents: unpacked.parents }, trace);
}
