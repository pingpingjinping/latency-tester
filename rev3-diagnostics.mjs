import { stats } from "./protocol.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function versionTiming(reply, index) {
  const { startedAt, sentAt, receivedAt } = reply;
  const mode = reply.transferOrder || "sequential";
  if (reply.command !== 0 || ![startedAt, sentAt, receivedAt].every(Number.isFinite) ||
      !["sequential", "prearmed"].includes(mode) || startedAt > sentAt ||
      receivedAt < startedAt || (mode === "sequential" && sentAt > receivedAt) ||
      (mode === "prearmed" && (!Number.isFinite(reply.inSubmittedAt) || reply.inSubmittedAt > startedAt))) {
    throw new Error("버전 조회 응답 또는 시각이 잘못됐습니다.");
  }
  return {
    index, phase: "measure", error: null, protocolVersion: reply.value, mode,
    startedAt, sentAt, receivedAt, outRetried: reply.outRetried === true,
    inSubmittedAt: reply.inSubmittedAt,
    outDuration: sentAt - startedAt,
    replyWait: receivedAt - sentAt,
    inElapsed: receivedAt - startedAt,
    inBeforeOutComplete: receivedAt < sentAt,
    totalTime: Math.max(sentAt, receivedAt) - startedAt
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
    total: summary("totalTime"),
    inElapsed: summary("inElapsed")
  };
}

export async function runVersionComparison(session, {
  count = 50, warmup = 5, interval = 50, signal,
  onProgress = () => {}, onRecord = () => {}
} = {}) {
  for (const [value, min, max] of [[count, 1, 100], [warmup, 0, 10], [interval, 0, 100]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError("통신 비교 설정 오류");
  }
  const records = [];
  for (let round = 0; round < warmup + count; round++) {
    const warming = round < warmup;
    // AB / BA pairs balance which method is tested first.
    const modes = round % 2 ? ["prearmed", "sequential"] : ["sequential", "prearmed"];
    for (const mode of modes) {
      if (signal?.aborted) return { records, aborted: true };
      const pairIndex = warming ? 0 : round - warmup + 1;
      onProgress({ warming, mode, index: warming ? round + 1 : pairIndex, total: warming ? warmup : count });
      if (signal?.aborted) return { records, aborted: true };
      try {
        const reply = await (mode === "prearmed" ? session.versionPrearmed() : session.version());
        if (signal?.aborted) return { records, aborted: true };
        if ((reply.transferOrder || "sequential") !== mode) throw new Error("통신 비교 방식 불일치");
        const row = { ...versionTiming(reply, records.length + 1), mode, pairIndex };
        if (!warming) { records.push(row); onRecord(row); }
      } catch (error) {
        if (signal?.aborted) return { records, aborted: true };
        const row = { index: records.length + 1, phase: warming ? "warmup" : "measure",
          mode, pairIndex, error: error.message || String(error) };
        records.push(row); onRecord(row);
        return { records, aborted: false };
      }
      if (!signal?.aborted && (round < warmup + count - 1 || mode !== modes.at(-1))) await sleep(interval);
    }
  }
  return { records, aborted: signal?.aborted === true };
}

export function versionComparisonStats(records) {
  const pairs = new Map();
  for (const r of records) {
    if (r.error || r.outRetried || r.phase !== "measure" || !Number.isInteger(r.pairIndex) || r.pairIndex < 1) continue;
    if (!pairs.has(r.pairIndex)) pairs.set(r.pairIndex, {});
    pairs.get(r.pairIndex)[r.mode] = r;
  }
  const matched = [...pairs.values()].filter(p => p.sequential && p.prearmed);
  return {
    count: matched.length,
    sequential: versionStats(matched.map(p => p.sequential)),
    prearmed: versionStats(matched.map(p => p.prearmed)),
    totalDifference: stats(matched.map(p => p.prearmed.totalTime - p.sequential.totalTime))
  };
}

export function versionCsv(records) {
  const cell = value => {
    if (value === undefined || value === null) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const lines = ["\uFEFFtest,phase,status,command_id,protocol_version,out_start_at_ms,out_end_at_ms,in_end_at_ms,out_duration_ms,reply_wait_ms,total_ms,out_retried,error,mode,pair,in_submitted_at_ms,in_elapsed_ms,in_before_out_complete"];
  for (const r of records) {
    lines.push([r.index, r.phase, r.error ? "failed" : "ok", 0,
      r.protocolVersion, r.startedAt, r.sentAt, r.receivedAt,
      r.outDuration, r.replyWait, r.totalTime, r.outRetried, r.error,
      r.mode || "sequential", r.pairIndex, r.inSubmittedAt, r.inElapsed, r.inBeforeOutComplete]
      .map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
