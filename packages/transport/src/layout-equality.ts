import type { FlagshipLayout } from '@vestaquest/board';

export function layoutsEqual(
  left: FlagshipLayout,
  right: FlagshipLayout,
): boolean {
  return left.every((row, rowIndex) =>
    row.every((code, columnIndex) => code === right[rowIndex]?.[columnIndex]),
  );
}
