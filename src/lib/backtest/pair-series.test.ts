import { expect, it } from "vitest";
import { mergePairSeries } from "./pair-series";
import type { Candle } from "@/lib/market-data/types";
const bar=(timestamp:number,close="1"):Candle=>({timestamp,open:close,high:close,low:close,close,source:"test"});
it("a late shorter response never truncates a newer pair buffer",()=>{
 const current=[bar(0),bar(1),bar(2),bar(3)];
 expect(mergePairSeries(current,[bar(0),bar(1)])).toEqual(current);
 expect(current).toHaveLength(4);
});
it("merges concurrent extensions without losing either tail",()=>{
 const first=mergePairSeries([bar(0)],[bar(1),bar(2),bar(3)]);
 expect(mergePairSeries(first,[bar(1),bar(2)])).toEqual([bar(0),bar(1),bar(2),bar(3)]);
});
it("retains newer overlapping data and can fill missing interior timestamps",()=>{
 expect(mergePairSeries([bar(0),bar(2,"2")],[bar(1),bar(2,"9"),bar(3)])).toEqual([bar(0),bar(1),bar(2,"2"),bar(3)]);
});
it("does not mutate or cross-contaminate another symbol's buffer",()=>{
 const pairs={EURUSD:[bar(0,"1.1")],USA30IDXUSD:[bar(0,"42000")],USATECHIDXUSD:[bar(0,"20000")]};
 const before=structuredClone(pairs);
 pairs.USA30IDXUSD=mergePairSeries(pairs.USA30IDXUSD,[bar(1,"42100")]);
 expect(pairs.EURUSD).toEqual(before.EURUSD);
 expect(pairs.USATECHIDXUSD).toEqual(before.USATECHIDXUSD);
});
