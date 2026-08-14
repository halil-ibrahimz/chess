export const DEFAULT_AUDIT_SEED = "satranc-mezarligi-conservation-audit-v1";
export const SAMPLE_STRATEGY = "archive-strata-seeded-v1";

function seedToUint32(value) {
  let hash = 2_166_136_261;

  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function stableStringCompare(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

export function selectDeterministicChronologicalSample(
  candidates,
  { seed = DEFAULT_AUDIT_SEED, size = 20 } = {},
) {
  if (!Number.isInteger(size) || size < 1) {
    throw new TypeError("Örnek büyüklüğü pozitif bir tam sayı olmalı.");
  }

  const sorted = candidates
    .filter((candidate) => typeof candidate?.url === "string" && candidate.url)
    .map((candidate) => ({ ...candidate }))
    .sort(
      (left, right) => Number(left.endTime) - Number(right.endTime)
        || stableStringCompare(left.identity, right.identity),
    );
  const actualSize = Math.min(size, sorted.length);
  if (actualSize === 0) {
    return [];
  }

  const random = mulberry32(seedToUint32(seed));
  const selected = [];
  const groups = new Map();

  for (const candidate of sorted) {
    const archive = typeof candidate.archive === "string" ? candidate.archive : "unknown";
    const group = groups.get(archive) ?? [];
    group.push(candidate);
    groups.set(archive, group);
  }

  const chronologicalGroups = [...groups.entries()].sort(([left], [right]) =>
    stableStringCompare(left, right));

  if (chronologicalGroups.length >= actualSize) {
    for (let stratum = 0; stratum < actualSize; stratum += 1) {
      const start = Math.floor((stratum * chronologicalGroups.length) / actualSize);
      const endExclusive = Math.floor(
        ((stratum + 1) * chronologicalGroups.length) / actualSize,
      );
      const groupIndex = start + Math.floor(random() * Math.max(1, endExclusive - start));
      const [, group] = chronologicalGroups[groupIndex];
      selected.push(group[Math.floor(random() * group.length)]);
    }

    return selected.sort((left, right) => Number(left.endTime) - Number(right.endTime));
  }

  const selectedIdentities = new Set();
  for (const [, group] of chronologicalGroups) {
    const candidate = group[Math.floor(random() * group.length)];
    selected.push(candidate);
    selectedIdentities.add(candidate.identity);
  }

  const remaining = sorted.filter((candidate) => !selectedIdentities.has(candidate.identity));
  const additionalCount = actualSize - selected.length;

  for (let stratum = 0; stratum < additionalCount; stratum += 1) {
    const start = Math.floor((stratum * remaining.length) / additionalCount);
    const endExclusive = Math.floor(((stratum + 1) * remaining.length) / additionalCount);
    const width = Math.max(1, endExclusive - start);
    const index = start + Math.floor(random() * width);
    selected.push(remaining[index]);
  }

  return selected.sort((left, right) => Number(left.endTime) - Number(right.endTime));
}
