/**
 * How many closed trades before the report means much.
 *
 * Around thirty is where win rate and profit factor stop swinging with every
 * new trade. It is a floor rather than a guarantee, and it was written as a
 * bare `30` in three separate places on the analytics screens — so a change of
 * mind about the threshold would have moved one figure and left the others
 * disagreeing with it on the same page.
 */
export const RELIABLE_SAMPLE_TRADES = 30;

export function sampleIsReliable(closedTrades: number): boolean {
  return closedTrades >= RELIABLE_SAMPLE_TRADES;
}

export function tradesUntilReliable(closedTrades: number): number {
  return Math.max(0, RELIABLE_SAMPLE_TRADES - closedTrades);
}
