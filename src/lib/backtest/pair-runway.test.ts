import { expect, it, vi } from "vitest";
import { fetchPairRunway } from "./pair-runway";
import type { Candle } from "@/lib/market-data/types";

const bar = (timestamp: number): Candle => ({timestamp,open:"1",high:"1",low:"1",close:"1",source:"test"});
it("continues past the old 150,000-candle ceiling to the saved clock", async () => {
  const series=Array.from({length:151_501},(_,i)=>bar(i*60_000));
  const fetch=vi.fn(async (from:number)=>series.slice(from/60_000,from/60_000+1500));
  const result=await fetchPairRunway(0,series.at(-1)!.timestamp,"1m",fetch);
  expect(result).toHaveLength(series.length);
  expect(result.at(-1)).toEqual(series.at(-1));
  expect(fetch.mock.calls.length).toBeGreaterThan(100);
});
it("requests larger pages without revealing beyond the requested buffer", async () => {
  const fetch=vi.fn(async ()=>[bar(0),bar(60_000),bar(120_000)]);
  expect(await fetchPairRunway(0,60_000,"1m",fetch)).toEqual([bar(0),bar(60_000)]);
  expect(fetch).toHaveBeenCalledWith(0,60_000,50_000);
});
it("retains valid data when a market closes before the primary buffer ends", async () => {
  const fetch=vi.fn().mockResolvedValueOnce([bar(0)]).mockResolvedValueOnce([]);
  expect(await fetchPairRunway(0,600_000,"1m",fetch)).toEqual([bar(0)]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("rejects failures rather than publishing a silently truncated runway", async () => {
  const fetch=vi.fn().mockResolvedValueOnce([bar(0)]).mockRejectedValueOnce(Error("offline"));
  await expect(fetchPairRunway(0,600_000,"1m",fetch)).rejects.toThrow("offline");
});
