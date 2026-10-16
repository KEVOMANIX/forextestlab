import {describe,expect,it} from "vitest";
import {resolveCalendarImportZone} from "./import-zone";
import {parseExportHeader} from "./mt5-csv";
import {parseWallClock,wallClockToUtc} from "./timezone";
import {formatInZone} from "@/lib/chart/timezones";

describe("calendar import timezone",()=>{
  const header=parseExportHeader('# forextestlab-calendar v1 server=FBS-Demo server_gmt_offset_minutes=180 exported_utc=2026.10.15 08:00:50');
  it("uses the recorded export offset for short rolling files instead of UTC",()=>{
    const resolved=resolveCalendarImportZone(undefined,header,null);
    expect(resolved.timezone).toBe('+03:00');expect(resolved.timezoneSource).toBe('header');
    const utc=wallClockToUtc(parseWallClock('2026.08.07 15:30:00')!,resolved.zone);
    expect(new Date(utc).toISOString()).toBe('2026-08-07T12:30:00.000Z');
    expect(formatInZone(utc,'America/New_York',{hour:'2-digit',minute:'2-digit',hour12:false})).toBe('08:30');
  });
  it("keeps US daylight-saving changes in a single MT5 export correct",()=>{
    const {zone}=resolveCalendarImportZone(undefined,header,null);
    for(const stamp of ['2026.08.07 15:30:00','2026.11.06 16:30:00','2026.12.04 16:30:00']){
      const utc=wallClockToUtc(parseWallClock(stamp)!,zone);
      expect(formatInZone(utc,'America/New_York',{hour:'2-digit',minute:'2-digit',hour12:false})).toBe('08:30');
    }
  });
  it("reads a fresh offset when the broker changes its clock",()=>{
    const winter={...header!,offsetMinutes:120,exportedAt:Date.UTC(2026,10,10)};
    const {zone}=resolveCalendarImportZone(undefined,winter,null);
    expect(new Date(wallClockToUtc(parseWallClock('2026.11.06 15:30:00')!,zone)).toISOString()).toBe('2026-11-06T13:30:00.000Z');
  });
  it("preserves explicitly requested seasonal timezone rules",()=>{
    const {zone,timezoneSource}=resolveCalendarImportZone('Europe/Kyiv',header,null);
    expect(timezoneSource).toBe('given');
    expect(new Date(wallClockToUtc(parseWallClock('2026.11.06 15:30:00')!,zone)).toISOString()).toBe('2026-11-06T13:30:00.000Z');
  });
  it("refuses unverified or malformed timezone metadata before importing",()=>{
    expect(()=>resolveCalendarImportZone(undefined,null,null)).toThrow('No calendar rows');
    expect(()=>resolveCalendarImportZone(undefined,{...header!,offsetMinutes:2000},null)).toThrow();
    expect(()=>resolveCalendarImportZone(undefined,{...header!,exportedAt:null},null)).toThrow();
    expect(()=>resolveCalendarImportZone('Invalid/Timezone',header,null)).toThrow('Unrecognised');
  });
});
