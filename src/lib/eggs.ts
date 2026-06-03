// Eggs are stored in the database as a whole number of individual eggs (pieces).
// 1 crate = 30 eggs. We display and input them in "crates.pieces" notation,
// e.g. 6 crates + 10 pieces -> "6.10" -> 190 eggs.

export const EGGS_PER_CRATE = 30;

/** Convert a total egg count (pieces) into { crates, pieces }. */
export function eggsToCrates(totalEggs: number): { crates: number; pieces: number } {
  const eggs = Math.max(0, Math.round(totalEggs ?? 0));
  return { crates: Math.floor(eggs / EGGS_PER_CRATE), pieces: eggs % EGGS_PER_CRATE };
}

/** Format a total egg count (pieces) as "crates.pieces", e.g. 190 -> "6.10". */
export function formatCrates(totalEggs: number): string {
  const { crates, pieces } = eggsToCrates(totalEggs);
  return `${crates}.${pieces.toString().padStart(2, "0")}`;
}

/** Total egg count (pieces) expressed as crates with two decimals, e.g. 190 -> "6.33". */
export function eggsAsCrateDecimal(totalEggs: number): number {
  return Math.round(((totalEggs ?? 0) / EGGS_PER_CRATE) * 100) / 100;
}

/**
 * Parse a "crates.pieces" string into a total egg count (pieces).
 * "6.10" -> 6 crates + 10 pieces = 190. "6" -> 180. "6.5" -> 6 crates + 5 pieces = 185.
 */
export function cratesInputToEggs(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  const str = String(input).trim();
  const [cratePart, piecePart = "0"] = str.split(".");
  const crates = parseInt(cratePart, 10) || 0;
  const pieces = parseInt(piecePart, 10) || 0;
  return crates * EGGS_PER_CRATE + pieces;
}
