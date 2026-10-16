/** Audit by default. Apply only source-verified timing changes after saving a
 * recoverable backup; forecast/actual figures and trading records are untouched.
 * Run: npx tsx scripts/repair-calendar-timestamps.ts --file data/calendar.csv
 * Add --apply --backup .tmp/calendar-timestamps-backup.json.gz to commit.
 */
import "dotenv/config";
import {createReadStream} from "node:fs";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {Prisma} from "../src/generated/prisma/client";
import {prisma} from "../src/lib/db";
import {importEconomicCalendar} from "../src/lib/economic-calendar/import";
import {normalizeMt5Row} from "../src/lib/economic-calendar/mt5-csv";
import {parseZoneSpec,parseWallClock,wallClockToUtc} from "../src/lib/economic-calendar/timezone";
import {streamCsv} from "../src/lib/market-data/csv-parser";
import {resolveSafeCsvPath} from "../src/lib/market-data/import";
import {SourceTimingIndex} from "../src/lib/economic-calendar/source-timing";

function flag(name:string){const i=process.argv.indexOf(`--${name}`);return i>=0?process.argv[i+1]:undefined}
interface Change {id:string;externalId:string;name:string;currency:string;before:string;after:string;updatedAt:string;basis:string}
async function main(){
  const file=resolveSafeCsvPath(flag('file')??'');
  const report=await importEconomicCalendar({filePath:file,timezone:flag('timezone'),dryRun:true});
  const zone=parseZoneSpec(report.timezone)!;
  const source=new SourceTimingIndex();
  const supplementary=flag('supplement');
  const inputs=supplementary?[resolveSafeCsvPath(supplementary),file]:[file];
  const sourceFiles:Array<{file:string;timezone:string}>=[];
  for(const input of inputs){
    const inputReport=input===file?report:await importEconomicCalendar({filePath:input,dryRun:true});
    const zone=parseZoneSpec(inputReport.timezone)!;
    sourceFiles.push({file:input,timezone:inputReport.timezone});
  for await(const row of streamCsv(createReadStream(input,'utf8'),{commentPrefix:'#'})){
    const parsed=normalizeMt5Row(row.record,{zone,source:'mt5'});
    const clock=parseWallClock(row.record.time_server??'');
    const periodClock=parseWallClock(row.record.period_server??'');
    const timing=parsed.ok?parsed.record:clock&&row.record.value_id?{
      timestamp:wallClockToUtc(clock,zone),period:periodClock?wallClockToUtc(periodClock,zone):null,
      seriesId:row.record.event_id||null,currency:row.record.currency??'',
    }:null;
    if(!timing)continue;
    source.add({...timing,externalId:row.record.value_id!});
  }
  }
  if(source.size<1000)throw Error('Refusing a timing repair from an unexpectedly small calendar export.');
  let cursor:string|undefined;let checked=0,matched=0,unchanged=0,matchedByPeriod=0;
  const changes:Change[]=[];
  const missing:Array<{externalId:string;name:string;currency:string;time:string;updatedAt:string}>=[];
  const batches=new Map<string,{matched:number;unchanged:number;deltas:Record<string,number>}>();
  for(;;){
    const rows=await prisma.economicEvent.findMany({where:{source:'mt5'},orderBy:{id:'asc'},take:4000,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,externalId:true,name:true,currency:true,timestamp:true,period:true,seriesId:true,updatedAt:true}});
    if(!rows.length)break;
    for(const row of rows){
      checked++;const found=source.find({...row,period:row.period==null?null:Number(row.period)},zone.kind==='offset'?zone.minutes:undefined);
      const after=found?.timestamp,basis=found?.basis??'unverified',updatedAt=row.updatedAt.toISOString();
      if(basis==='source-series-period')matchedByPeriod++;
      if(after===undefined){missing.push({externalId:row.externalId,name:row.name,currency:row.currency,time:new Date(Number(row.timestamp)).toISOString(),updatedAt});continue}
      matched++;const delta=after-Number(row.timestamp);
      const batch=batches.get(updatedAt)??{matched:0,unchanged:0,deltas:{}};
      batch.matched++;batch.deltas[String(delta)]=(batch.deltas[String(delta)]??0)+1;
      if(!delta){unchanged++;batch.unchanged++}else changes.push({id:row.id,externalId:row.externalId,name:row.name,currency:row.currency,before:row.timestamp.toString(),after:String(after),updatedAt,basis});
      batches.set(updatedAt,batch);
    }
    cursor=rows.at(-1)!.id;
  }
  const deltas:Record<string,number>={};for(const c of changes){const delta=(Number(c.after)-Number(c.before))/60000;deltas[delta]=(deltas[delta]??0)+1}
  const missingSummary:Record<string,number>={};for(const row of missing){const key=row.updatedAt.slice(0,10);missingSummary[key]=(missingSummary[key]??0)+1}
  const output={timezone:report.timezone,timezoneSource:report.timezoneSource,sourceRows:source.size,checked,matched,matchedByPeriod,unchanged,changes:changes.length,deltasMinutes:deltas,missing:missing.length,missingByImportDay:missingSummary,missingSamples:missing.slice(0,25).map(row=>({...row,batch:batches.get(row.updatedAt)})),samples:changes.slice(0,12).map(c=>({...c,before:new Date(Number(c.before)).toISOString(),after:new Date(Number(c.after)).toISOString()}))};
  console.log(JSON.stringify(output));
  if(flag('report'))await writeFile(flag('report')!,JSON.stringify({output,missing,batches:[...batches]},null,2),{mode:0o600});
  if(!process.argv.includes('--apply'))return;
  const backup=flag('backup');if(!backup)throw Error('--backup is required before applying changes.');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  const manifest={version:1,createdAt:new Date().toISOString(),sourceHash:hash.digest('hex'),sourceFiles,timezone:report.timezone,changes};
  await mkdir(path.dirname(backup),{recursive:true});
  await writeFile(backup,gzipSync(Buffer.from(JSON.stringify(manifest))),{flag:'wx',mode:0o600});
  const updated=await prisma.$transaction(async tx=>{
    let count=0;
    for(let i=0;i<changes.length;i+=250){
      const batch=changes.slice(i,i+250);
      const values=batch.map(c=>Prisma.sql`(${c.id},${BigInt(c.before)},${BigInt(c.after)})`);
      const n=await tx.$executeRaw(Prisma.sql`UPDATE "EconomicEvent" AS e SET "timestamp"=v.new_timestamp,"updatedAt"=NOW() FROM (VALUES ${Prisma.join(values)}) AS v(id,old_timestamp,new_timestamp) WHERE e.id=v.id AND e."timestamp"=v.old_timestamp`);
      if(n!==batch.length)throw Error('Calendar changed during the repair; transaction rolled back.');
      count+=n;
    }
    return count;
  },{timeout:120000});
  console.log(JSON.stringify({updated,backup}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());



