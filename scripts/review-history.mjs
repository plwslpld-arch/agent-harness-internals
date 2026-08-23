export function findPreviousLocks(currentLocks, loadRevision, maxDepth = 50) {
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const rev = `HEAD~${depth}`;
    try {
      const parsed = loadRevision(rev);
      const map = new Map(parsed.sources.map((entry) => [entry.id, entry.commit]));
      if ([...map].some(([id, commit]) => {
        const current = currentLocks.get(id);
        const currentCommit = typeof current === 'string' ? current : current?.commit;
        return currentCommit !== commit;
      })) {
        return { map, rev };
      }
    } catch {
      // 这一版没有 lock 或无法解析，继续往前找。
    }
  }
  return { map: new Map(), rev: null };
}

function normalizeLine(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

export function findUniqueNormalizedLine(lines, needle) {
  const hits = [];
  lines.forEach((line, index) => {
    if (normalizeLine(line) === needle) hits.push(index);
  });
  return hits.length === 1 ? hits[0] : null;
}

export function findUniqueNormalizedWindow(oldLines, newLines, oldIndex, maxRadius = 3) {
  if (oldIndex < 0 || oldIndex >= oldLines.length) return null;

  for (let radius = maxRadius; radius >= 1; radius -= 1) {
    const left = Math.max(0, oldIndex - radius);
    const right = Math.min(oldLines.length, oldIndex + radius + 1);
    const needle = oldLines.slice(left, right).map(normalizeLine);
    const offset = oldIndex - left;
    const hits = [];

    for (let at = 0; at <= newLines.length - needle.length; at += 1) {
      const candidate = newLines.slice(at, at + needle.length).map(normalizeLine);
      if (candidate.every((line, index) => line === needle[index])) hits.push(at + offset);
    }
    if (hits.length === 1) return hits[0];
  }

  return null;
}

export function unchangedCurrentReferenceIndices(oldReferences, currentReferences) {
  const rows = Array.from(
    { length: oldReferences.length + 1 },
    () => new Uint16Array(currentReferences.length + 1),
  );

  for (let oldIndex = oldReferences.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let currentIndex = currentReferences.length - 1; currentIndex >= 0; currentIndex -= 1) {
      rows[oldIndex][currentIndex] = oldReferences[oldIndex] === currentReferences[currentIndex]
        ? rows[oldIndex + 1][currentIndex + 1] + 1
        : Math.max(rows[oldIndex + 1][currentIndex], rows[oldIndex][currentIndex + 1]);
    }
  }

  const unchanged = new Set();
  let oldIndex = 0;
  let currentIndex = 0;
  while (oldIndex < oldReferences.length && currentIndex < currentReferences.length) {
    if (oldReferences[oldIndex] === currentReferences[currentIndex]) {
      unchanged.add(currentIndex);
      oldIndex += 1;
      currentIndex += 1;
    } else if (rows[oldIndex + 1][currentIndex] >= rows[oldIndex][currentIndex + 1]) {
      oldIndex += 1;
    } else {
      currentIndex += 1;
    }
  }
  return unchanged;
}

export function canAutoRelocate(quoted, lines, startIndex, endIndex = startIndex) {
  if (!quoted) return false;
  const region = normalizeLine(lines.slice(startIndex, endIndex + 1).join(' '));
  return region.includes(normalizeLine(quoted));
}
