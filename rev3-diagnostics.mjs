import { stats } from "./protocol.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function versionTiming(reply, index) {
  const { startedAt, sentAt, receivedAt } = reply;
  if (reply.command !== 0 || ![startedAt, sentAt, receivedAt].every(Number.isFinite) ||
      startedAt > sentAt || sentAt > receivedAt) {
    throw new Error("버전 조회 응답 또는 시각이 잘못됐습니다.");
  }
  return {
    index, phase: "measure", error: null, protocolVersion: reply.value,
    startedAt, sentAt, receivedAt, outRetried: reply.outRetried === true,
    outDuration: sentAt - startedAt,
    replyWait: receivedAt - sentAt,
    totalTime: receivedAt - startedAt
  };
}

// Only VERSION requests, serialized through the existing OUT -> IN path.
// Cancellation stops the next request; an already submitted WebUSB request is
// allowed to finish (or hit the session timeout) rather than orphaning its reply.
export async function runVersionDiagnostics(session, {
  count = 50, warmup = 5, interval = 50, signal,
  onProgress = () => {}, onRecord = () => {}
} = {}) {
  for (const [value, min, max] of [[count, 1, 100], [warmup, 0, 10], [interval, 0, 100]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError("통신 검사 설정 오류");
  }
  const records = [];
  for (let i = 0; i < warmup + count; i++) {
    if (signal?.aborted) break;
    const warming = i < warmup;
    onProgress({ warming, index: warming ? i + 1 : i - warmup + 1, total: warming ? warmup : count });
    try {
      const row = versionTiming(await session.version(), i - warmup + 1);
      if (signal?.aborted) break;
      if (!warming) { records.push(row); onRecord(row); }
    } catch (error) {
      if (signal?.aborted) break;
      const row = { index: warming ? 0 : i - warmup + 1,
        phase: warming ? "warmup" : "measure", error: error.message || String(error) };
      records.push(row); onRecord(row);
      // Do not queue further commands after a failed or timed-out exchange.
      break;
    }
    if (!signal?.aborted && i < warmup + count - 1) await sleep(interval);
  }
  return { records, aborted: signal?.aborted === true };
}

export function versionStats(records) {
  const valid = records.filter(r => !r.error && !r.outRetried && r.phase === "measure");
  const summary = key => {
    const values = valid.map(r => r[key]).filter(Number.isFinite).sort((a, b) => a - b);
    const result = stats(values);
    if (!result) return null;
    const middle = Math.floor(values.length / 2);
    return { ...result, median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 };
  };
  return {
    count: valid.length,
    failed: records.filter(r => r.error).length,
    retried: records.filter(r => r.outRetried).length,
    out: summary("outDuration"),
    reply: summary("replyWait"),
    total: summary("totalTime")
  };
}

export function versionCsv(records) {
  const cell = value => {
    if (value === undefined || value === null) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const lines = ["\uFEFFtest,phase,status,command_id,protocol_version,out_start_at_ms,out_end_at_ms,in_end_at_ms,out_duration_ms,reply_wait_ms,total_ms,out_retried,error"];
  for (const r of records) {
    lines.push([r.index, r.phase, r.error ? "failed" : "ok", 0,
      r.protocolVersion, r.startedAt, r.sentAt, r.receivedAt,
      r.outDuration, r.replyWait, r.totalTime, r.outRetried, r.error]
      .map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
