/** Audit by default. Apply with the app stopped and --apply --backup=<new-file>.
 * Repairs one saved candle prefix from a verified R2 month; keeps trade prices,
 * results and replay timestamps, remapping their positional indexes only.
 */
import "dotenv/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { rowsToCandles } from "../src/lib/market-data/r2-sync";
import { repairCandlePrefix } from "../src/lib/backtest/repair-candle-prefix";
import { normalizeSessionState } from "../src/lib/backtest/replay-engine";
import { decompress } from "fzstd";
import type { Candle } from "../src/lib/market-data/types";

const flag = (name: string) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length+3);
async function main() {
  const id=flag("session"), month=flag("month");
  if (!id || !month?.match(/^20\d{2}\/\d{2}$/)) throw Error("Supply --session=<id> --month=YYYY/MM");
  const client=new S3Client({endpoint:process.env.R2_ENDPOINT,region:"auto",forcePathStyle:true,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID!,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY!}});
  const Bucket=process.env.R2_BUCKET_NAME!;
  const prefix=process.env.R2_SNAPSHOT_PREFIX || "backtest_snapshots";
  const candleKey=`${prefix}/candles/${id}.json.gz`;
  const get=async(Key:string)=>Buffer.from(await (await client.send(new GetObjectCommand({Bucket,Key}))).Body!.transformToByteArray());
  const put=async(Key:string,Body:Buffer)=>client.send(new PutObjectCommand({Bucket,Key,Body,ContentType:"application/json",ContentEncoding:"gzip",CacheControl:"private, no-store"}));
  const row=await prisma.backtestSession.findUniqueOrThrow({where:{id},select:{id:true,symbol:true,timeframe:true,visibleIndex:true,visibleTime:true,totalCandles:true,status:true,lockedBeforeIndex:true,stateJson:true,stateObjectKey:true,stateSizeBytes:true,updatedAt:true}});
  const stateBytes=row.stateObjectKey?await get(row.stateObjectKey):null;
  const state=normalizeSessionState(JSON.parse(stateBytes?gunzipSync(stateBytes).toString():row.stateJson));
  const oldBytes=await get(candleKey);
  const original=JSON.parse(gunzipSync(oldBytes).toString()).candles as Candle[];
  state.visibleIndex=row.visibleIndex;
  state.lockedBeforeIndex=row.lockedBeforeIndex;
  if (row.visibleTime!=null && original[row.visibleIndex]?.timestamp!==Number(row.visibleTime)) throw Error("Saved replay clock disagrees with snapshot; refusing repair");
  const parquet=await get(`${process.env.R2_PREFIX||"market_data"}/${row.symbol}/${month}.parquet`);
  const {parquetReadObjects}=await import("hyparquet");
  const objects=await parquetReadObjects({file:parquet.buffer.slice(parquet.byteOffset,parquet.byteOffset+parquet.byteLength),compressors:{ZSTD:(input:Uint8Array)=>decompress(input)},columns:["timestamp","open","high","low","close","volume"]});
  const repaired=repairCandlePrefix(state,original,rowsToCandles(objects as Record<string,unknown>[]));
  const trades=await prisma.simulatedTrade.findMany({where:{sessionId:id},select:{id:true,entryIndex:true,exitIndex:true}});
  const equity=await prisma.equitySnapshot.findMany({where:{sessionId:id},select:{id:true,index:true}});
  console.log(JSON.stringify({session:id,inserted:repaired.inserted,oldLength:original.length,newLength:repaired.candles.length,beforeTime:original[state.visibleIndex]?.timestamp,afterTime:repaired.candles[repaired.state.visibleIndex]?.timestamp,trades:trades.length,equity:equity.length}));
  if (!process.argv.includes("--apply") || !repaired.inserted) return;
  const backup=flag("backup"); if(!backup) throw Error("--backup=<new-file> is required");
  await writeFile(backup,gzipSync(Buffer.from(JSON.stringify({row,oldCandles:oldBytes.toString("base64"),oldState:stateBytes?.toString("base64"),trades,equity},(_,v)=>typeof v==="bigint"?String(v):v))),{flag:"wx",mode:0o600});
  repaired.state.status="paused";
  const json=JSON.stringify(repaired.state);
  const stateKey=`${prefix}/${id}-repaired-${Date.now()}.json.gz`;
  await put(stateKey,gzipSync(Buffer.from(json)));
  await put(candleKey,gzipSync(Buffer.from(JSON.stringify({version:1,candles:repaired.candles}))));
  try {
    await prisma.$transaction(async tx=>{
      const result=await tx.backtestSession.updateMany({where:{id,updatedAt:row.updatedAt},data:{visibleIndex:repaired.state.visibleIndex,totalCandles:repaired.candles.length,lockedBeforeIndex:repaired.state.lockedBeforeIndex,status:"paused",stateObjectKey:stateKey,stateJson:JSON.stringify({config:repaired.state.config}),stateSizeBytes:Buffer.byteLength(json)}});
      if(result.count!==1) throw Error("Session changed during repair; rolling back");
      for(const trade of trades) await tx.simulatedTrade.update({where:{id:trade.id},data:{entryIndex:repaired.remap(trade.entryIndex),exitIndex:repaired.remap(trade.exitIndex)}});
      for(const point of equity) await tx.equitySnapshot.update({where:{id:point.id},data:{index:repaired.remap(point.index)}});
    },{timeout:120000});
  } catch(error) {
    await put(candleKey,oldBytes);
    throw error;
  }
  console.log("Saved candle prefix repaired; replay time and financial records retained.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
