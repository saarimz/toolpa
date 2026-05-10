export const TraversalModes = [
  "LR",
  "RL",
  "TD",
  "DT",
  "LR_serp",
  "TD_serp",
  "Diagonal",
  "DiagonalReverse",
  "Spiral",
  "SpiralReverse",
  "CenterOut",
  "EdgesIn",
  "Random",
] as const;

export type TraversalMode = (typeof TraversalModes)[number];
export const GridSliceCounts = [4, 8, 16, 32, 64, 128, 256] as const;
export type GridSliceCount = (typeof GridSliceCounts)[number];

export function getGridDimensions(sliceCount: GridSliceCount) {
  if (sliceCount === 4) {
    return { rows: 2, cols: 2 };
  }

  if (sliceCount === 8) {
    return { rows: 2, cols: 4 };
  }

  if (sliceCount === 16) {
    return { rows: 4, cols: 4 };
  }

  if (sliceCount === 32) {
    return { rows: 4, cols: 8 };
  }

  if (sliceCount === 64) {
    return { rows: 8, cols: 8 };
  }

  if (sliceCount === 128) {
    return { rows: 8, cols: 16 };
  }

  return { rows: 16, cols: 16 };
}

export function traverse(
  rows: number,
  cols: number,
  mode: TraversalMode,
  seed = "grid",
): number[] {
  assertGrid(rows, cols);

  if (mode === "LR") {
    return indices(rows, cols, (row, col) => row * cols + col);
  }

  if (mode === "RL") {
    return indices(rows, cols, (row, col) => row * cols + (cols - 1 - col));
  }

  if (mode === "TD") {
    return indices(cols, rows, (col, row) => row * cols + col);
  }

  if (mode === "DT") {
    return indices(cols, rows, (col, row) => (rows - 1 - row) * cols + col);
  }

  if (mode === "LR_serp") {
    return indices(rows, cols, (row, col) =>
      row % 2 === 0 ? row * cols + col : row * cols + (cols - 1 - col),
    );
  }

  if (mode === "TD_serp") {
    return indices(cols, rows, (col, row) =>
      col % 2 === 0 ? row * cols + col : (rows - 1 - row) * cols + col,
    );
  }

  if (mode === "Diagonal") {
    return diagonal(rows, cols);
  }

  if (mode === "DiagonalReverse") {
    return diagonal(rows, cols).map((index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return row * cols + (cols - 1 - col);
    });
  }

  if (mode === "Spiral") {
    return spiral(rows, cols);
  }

  if (mode === "SpiralReverse") {
    return [...spiral(rows, cols)].reverse();
  }

  if (mode === "CenterOut") {
    return centerOut(rows, cols);
  }

  if (mode === "EdgesIn") {
    return [...centerOut(rows, cols)].reverse();
  }

  return seededShuffle(indices(rows, cols, (row, col) => row * cols + col), seed);
}

export function getTraversalCellAtStep(
  sliceCount: GridSliceCount,
  mode: TraversalMode,
  stepIndex: number,
  seed = "grid",
) {
  const { rows, cols } = getGridDimensions(sliceCount);
  const order = traverse(rows, cols, mode, seed);
  return order[positiveModulo(stepIndex, order.length)] ?? 0;
}

export function getTraversalPositions(
  sliceCount: GridSliceCount,
  mode: TraversalMode,
  seed = "grid",
) {
  const { rows, cols } = getGridDimensions(sliceCount);
  const order = traverse(rows, cols, mode, seed);
  return new Map(order.map((cellIndex, orderIndex) => [cellIndex, orderIndex]));
}

function indices(
  outer: number,
  inner: number,
  resolve: (outerIndex: number, innerIndex: number) => number,
) {
  const order: number[] = [];
  for (let outerIndex = 0; outerIndex < outer; outerIndex += 1) {
    for (let innerIndex = 0; innerIndex < inner; innerIndex += 1) {
      order.push(resolve(outerIndex, innerIndex));
    }
  }
  return order;
}

function diagonal(rows: number, cols: number) {
  const order: number[] = [];
  for (let sum = 0; sum <= rows + cols - 2; sum += 1) {
    for (let row = 0; row < rows; row += 1) {
      const col = sum - row;
      if (col >= 0 && col < cols) {
        order.push(row * cols + col);
      }
    }
  }
  return order;
}

function spiral(rows: number, cols: number) {
  const order: number[] = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;

  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col += 1) {
      order.push(top * cols + col);
    }
    top += 1;

    for (let row = top; row <= bottom; row += 1) {
      order.push(row * cols + right);
    }
    right -= 1;

    if (top <= bottom) {
      for (let col = right; col >= left; col -= 1) {
        order.push(bottom * cols + col);
      }
      bottom -= 1;
    }

    if (left <= right) {
      for (let row = bottom; row >= top; row -= 1) {
        order.push(row * cols + left);
      }
      left += 1;
    }
  }

  return order;
}

function centerOut(rows: number, cols: number) {
  return indices(rows, cols, (row, col) => row * cols + col).sort(
    (left, right) => {
      const leftDistance = distanceFromCenter(left, rows, cols);
      const rightDistance = distanceFromCenter(right, rows, cols);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return left - right;
    },
  );
}

function distanceFromCenter(index: number, rows: number, cols: number) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const centerRow = (rows - 1) / 2;
  const centerCol = (cols - 1) / 2;
  return Math.hypot(row - centerRow, col - centerCol);
}

function seededShuffle(values: number[], seed: string) {
  const result = [...values];
  let state = hashSeed(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex] ?? 0, result[index] ?? 0];
  }

  return result;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assertGrid(rows: number, cols: number) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error("Grid dimensions must be positive integers");
  }
}
