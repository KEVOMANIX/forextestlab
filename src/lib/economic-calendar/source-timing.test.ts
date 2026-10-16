import {describe,expect,it} from "vitest";
import {SourceTimingIndex,type SourceReleaseTime} from "./source-timing";

const release:SourceReleaseTime={externalId:'current',seriesId:'payroll',currency:'USD',period:Date.UTC(2026,5,30,21),timestamp:Date.UTC(2026,7,7,12,30)};
describe("source-verified calendar timing repairs",()=>{
  it("uses the provider's exact release id",()=>{
    const index=new SourceTimingIndex();index.add(release);
    expect(index.find(release)).toEqual({timestamp:release.timestamp,basis:'source-id'});
    expect(index.find({...release,currency:'GBP'})).toBeNull();
  });
  it("matches replaced forecast ids by the same indicator and reference period",()=>{
    const index=new SourceTimingIndex();index.add(release);
    expect(index.find({...release,externalId:'old'})).toEqual({timestamp:release.timestamp,basis:'source-series-period'});
    expect(index.find({...release,externalId:'old',seriesId:'different'})).toBeNull();
    expect(index.find({...release,externalId:'old',currency:'GBP'})).toBeNull();
  });
  it("can verify a reference period affected by the same failed timezone import",()=>{
    const index=new SourceTimingIndex();index.add(release);
    const old={...release,externalId:'old',period:release.period!+3*3600000};
    expect(index.find(old)).toBeNull();
    expect(index.find(old,180)?.timestamp).toBe(release.timestamp);
  });
  it("refuses ambiguous matches and missing reference periods",()=>{
    const index=new SourceTimingIndex();index.add(release);
    index.add({...release,externalId:'revision',timestamp:release.timestamp+86400000});
    expect(index.find({...release,externalId:'old'},180)).toBeNull();
    expect(index.find({...release,externalId:'old',period:null},180)).toBeNull();
    expect(index.find(release)?.basis).toBe('source-id');
  });
  it("does not guess a timestamp from the event name, a nearby month or another series",()=>{
    const index=new SourceTimingIndex();index.add(release);
    expect(index.find({...release,externalId:'old',period:release.period!+31*86400000},180)).toBeNull();
    expect(index.find({...release,externalId:'old',seriesId:null},180)).toBeNull();
  });
});
