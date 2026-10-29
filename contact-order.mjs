import { stats } from "./protocol.mjs";
import { eventHandlerDelay } from "./input-timing.mjs";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Independent actuations, grouped by adjacent A/B pairs. This comparison does
// not estimate contact time or apply a midpoint/absolute-value correction.
export async function runContactComparison(measure, {
  count, warmup, interval, signal, onProgress = () => {}, onRecord = () => {}
}) {
  for (const [value, min, max] of [[count, 1, 100], [warmup, 0, 10], [interval, 0, 100]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError("접점 비교 설정 오류");
  }
  const records = [];
  for (let round = 0; round < warmup + count; round++) {
    const warming = round < warmup;
    const pairIndex = warming ? 0 : round - warmup + 1;
    const modes = round % 2 ? ["prearmed", "sequential"] : ["sequential", "prearmed"];
    for (const mode of modes) {
      if (signal?.aborted) return { records, aborted: true };
      onProgress({ warming, mode, index: warming ? round + 1 : pairIndex, total: warming ? warmup : count });
      if (signal?.aborted) return { records, aborted: true };
      try {
        const result = await measure(mode);
        if (signal?.aborted) return { records, aborted: true };
        if (result.transferOrder !== mode || result.replyCommand !== 2 ||
            ![result.down, result.up, result.usbStartedAt, result.usbSentAt,
              result.usbReceivedAt, result.holdTime].every(Number.isFinite) ||
            result.usbSentAt < result.usbStartedAt || result.usbReceivedAt < result.usbStartedAt ||
            result.holdTime < 1 || result.holdTime > 200 ||
            (mode === "sequential" && result.usbReceivedAt < result.usbSentAt) ||
            (mode === "prearmed" && (!Number.isFinite(result.inSubmittedAt) || result.inSubmittedAt > result.usbStartedAt))) {
          throw new Error("접점 비교 응답 또는 시각이 잘못됐습니다.");
        }
        if (!warming) {
          const row = { ...result, index: records.length + 1, pairIndex, mode, phase: "measure", error: null };
          records.push(row); onRecord(row);
        }
      } catch (error) {
        if (signal?.aborted) return { records, aborted: true };
        const row = { index: records.length + 1, pairIndex, mode,
          phase: warming ? "warmup" : "measure", error: error.message || String(error) };
        records.push(row); onRecord(row);
        return { records, aborted: false };
      }
      if (!signal?.aborted && (round < warmup + count - 1 || mode !== modes.at(-1))) await sleep(interval);
    }
  }
  return { records, aborted: signal?.aborted === true };
}

export function contactComparisonStats(records) {
  const pairs = new Map();
  for (const row of records) {
    if (row.error || row.outRetried || row.phase !== "measure" || !Number.isInteger(row.pairIndex) || row.pairIndex < 1 ||
        ![row.down, row.up, row.usbStartedAt, row.usbSentAt, row.usbReceivedAt].every(Number.isFinite) ||
        !["sequential", "prearmed"].includes(row.mode)) continue;
    if (!pairs.has(row.pairIndex)) pairs.set(row.pairIndex, {});
    pairs.get(row.pairIndex)[row.mode] = row;
  }
  const matched = [...pairs.values()].filter(p => p.sequential && p.prearmed);
  const summarize = mode => {
    const rows = matched.map(p => p[mode]);
    return {
      down: stats(rows.map(r => r.down)), up: stats(rows.map(r => r.up)),
      reply: stats(rows.map(r => r.usbReceivedAt - r.usbSentAt)),
      total: stats(rows.map(r => Math.max(r.usbReceivedAt, r.usbSentAt) - r.usbStartedAt))
    };
  };
  return {
    count: matched.length, sequential: summarize("sequential"), prearmed: summarize("prearmed"),
    difference: {
      down: stats(matched.map(p => p.prearmed.down - p.sequential.down)),
      up: stats(matched.map(p => p.prearmed.up - p.sequential.up))
    },
    failed: records.filter(r => r.error).length,
    retried: records.filter(r => r.outRetried).length
  };
}

export function contactComparisonCsv(records, settings) {
  const cell = value => {
    if (value === undefined || value === null) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const lines = ["\uFEFFtest,pair,phase,mode,status,command_id,reply_command_id,reply_value,hold_ms,target_type,target,interval_ms,in_submitted_at_ms,out_start_at_ms,out_end_at_ms,in_end_at_ms,out_duration_ms,reply_wait_ms,total_ms,in_before_out_complete,out_retried,keydown_at_ms,keyup_at_ms,keydown_event_at_ms,keyup_event_at_ms,keydown_handler_delay_ms,keyup_handler_delay_ms,keydown_in_ms,keyup_in_ms,keydown_out_ms,keyup_out_ms,keydown_event_in_ms,keyup_event_in_ms,event_timestamps_valid,error"];
  for (const r of records) {
    const downDelay = eventHandlerDelay(r.downEventAt, r.downAt);
    const upDelay = eventHandlerDelay(r.upEventAt, r.upAt);
    const eventValid = !r.error && Number.isFinite(downDelay) && Number.isFinite(upDelay) &&
      r.upEventAt >= r.downEventAt && Number.isFinite(r.usbReceivedAt) && Number.isFinite(r.holdTime);
    lines.push([r.index, r.pairIndex, r.phase, r.mode, r.error ? "failed" : "ok", 2, r.replyCommand,
      r.replyValue, r.holdTime ?? settings.hold, settings.type, settings.target, settings.interval,
      r.inSubmittedAt, r.usbStartedAt, r.usbSentAt, r.usbReceivedAt,
      r.usbSentAt - r.usbStartedAt, r.usbReceivedAt - r.usbSentAt,
      Math.max(r.usbReceivedAt, r.usbSentAt) - r.usbStartedAt,
      !r.error ? r.usbReceivedAt < r.usbSentAt : undefined, r.outRetried,
      r.downAt, r.upAt, r.downEventAt, r.upEventAt, downDelay, upDelay,
      r.down, r.up, r.downFromOut, r.upFromOut,
      eventValid ? r.downEventAt - r.usbReceivedAt : NaN,
      eventValid ? r.upEventAt - r.usbReceivedAt - r.holdTime : NaN,
      eventValid, r.error].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
