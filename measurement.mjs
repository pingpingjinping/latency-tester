import { calculate } from "./protocol.mjs";
import { eventHandlerDelay } from "./input-timing.mjs";
import { applyRev3Calibration, validateCalibration, DEFAULT_REV3_CALIBRATION } from "./calibration.mjs";

// Preserve partially received edges when a run fails. Freeze them at the
// failure, so a later stray event cannot turn a timeout into an apparent pair.
export function collectInput(settings, signal, target = document) {
  let downAt, upAt, downEventAt, upEventAt, settled = false;
  let resolveEvent, rejectEvent;
  const result = new Promise((resolve, reject) => { resolveEvent = resolve; rejectEvent = reject; });
  result.catch(() => {});
  const keyboard = settings.type === "keyboard";
  const downType = keyboard ? "keydown" : "mousedown";
  const upType = keyboard ? "keyup" : "mouseup";
  const matches = e => keyboard
    ? typeof e.key === "string" && e.key.toLowerCase() === settings.target : e.button === 0;
  const fail = (message, code) => {
    if (settled) return;
    settled = true;
    const error = new Error(message); error.code = code; rejectEvent(error);
  };
  const onDown = e => {
    if (!settled && matches(e) && !e.repeat && downAt === undefined) {
      downAt = performance.now(); downEventAt = e.timeStamp;
    }
  };
  const onUp = e => {
    if (settled || !matches(e) || upAt !== undefined) return;
    upAt = performance.now(); upEventAt = e.timeStamp;
    if (downAt === undefined) { fail("누름 없이 뗌 입력을 받았습니다.", "INPUT_ORDER"); return; }
    settled = true; resolveEvent();
  };
  const onAbort = () => fail("중단됨", "ABORTED");
  target.addEventListener(downType, onDown, { capture: true });
  target.addEventListener(upType, onUp, { capture: true });
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => fail("입력 이벤트 시간 초과", "INPUT_TIMEOUT"), settings.hold + 1000);
  if (signal.aborted) onAbort();
  return {
    result, times: () => ({ downAt, upAt, downEventAt, upEventAt }),
    cleanup() {
      clearTimeout(timer);
      target.removeEventListener(downType, onDown, { capture: true });
      target.removeEventListener(upType, onUp, { capture: true });
      signal.removeEventListener("abort", onAbort);
    }
  };
}

function usbFields(reply = {}) {
  return {
    transferOrder: reply.transferOrder || "prearmed", inSubmittedAt: reply.inSubmittedAt,
    usbStartedAt: reply.startedAt, usbSentAt: reply.sentAt, usbReceivedAt: reply.receivedAt,
    replyCommand: reply.command, replyValue: reply.value, outRetried: reply.outRetried
  };
}

// This is request-to-input elapsed time, including the unknown tester delay D.
// A keyboard-only estimate would subtract an independently established D.
// Neither USB completion, a midpoint nor an absolute value supplies that D.
export function rev3RequestMeasurement(reply, times, hold) {
  if (reply.command !== 2 || reply.transferOrder !== "prearmed" ||
      ![reply.startedAt, reply.sentAt, reply.receivedAt, reply.inSubmittedAt,
        times.downAt, times.upAt].every(Number.isFinite) ||
      reply.inSubmittedAt > reply.startedAt || reply.sentAt < reply.startedAt ||
      reply.receivedAt < reply.startedAt || times.upAt < times.downAt ||
      !Number.isInteger(hold) || hold < 1 || hold > 200) {
    throw new Error("Rev3 응답 또는 측정 시각이 잘못됐습니다.");
  }
  const rawIn = calculate(reply.receivedAt, times.downAt, times.upAt, hold);
  return {
    ...calculate(reply.startedAt, times.downAt, times.upAt, hold),
    revision: "rev3", timingBasis: "out_request", holdTime: hold,
    ...usbFields(reply), ...times,
    downFromIn: rawIn.down, upFromIn: rawIn.up
  };
}

export async function measureRev3(session, settings, signal, target = document) {
  if (signal.aborted) throw new DOMException("중단됨", "AbortError");
  // Snapshot before submitting a contact. Invalid offsets never actuate it.
  const calibration = validateCalibration(settings.calibration || DEFAULT_REV3_CALIBRATION);
  const input = collectInput(settings, signal, target);
  let reply;
  try {
    reply = await session.contactOncePrearmed(settings.hold);
    await input.result;
    if (signal.aborted) throw new DOMException("중단됨", "AbortError");
    return applyRev3Calibration(rev3RequestMeasurement(reply, input.times(), settings.hold), calibration);
  } catch (error) {
    error.measurement = applyRev3Calibration({
      revision: "rev3", timingBasis: "out_request", holdTime: settings.hold,
      ...usbFields(reply || error.usbTiming), ...input.times(),
      failureStage: signal.aborted ? "aborted"
        : error.code === "INPUT_TIMEOUT" ? "input_timeout"
        : error.code === "INPUT_ORDER" ? "input_order" : reply ? "timing" : "usb"
    }, calibration);
    throw error;
  } finally { input.cleanup(); }
}

// New basic export. The first two numeric columns match the displayed result;
// the basis is explicit. Original IN-relative results remain separate fields.
export function measurementCsv(records) {
  const cell = value => {
    if (value === undefined || value === null) return "";
    if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(3) : "";
    const text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  const lines = ["\uFEFFtest,keydown_ms,keyup_ms,status,revision,timing_basis,transfer_order,hold_ms,out_start_at_ms,out_end_at_ms,in_end_at_ms,in_submitted_at_ms,keydown_at_ms,keyup_at_ms,keydown_event_at_ms,keyup_event_at_ms,keydown_handler_delay_ms,keyup_handler_delay_ms,in_keydown_ms,in_keyup_ms,out_duration_ms,reply_wait_ms,total_ms,command_id,reply_value,out_retried,failure_stage,phase,error,out_request_keydown_ms,out_request_keyup_ms,keydown_offset_ms,keyup_offset_ms,calibration_source,calibration_reference,calibration_reference_keydown_ms,calibration_reference_keyup_ms,calibration_baseline_in_keydown_ms,calibration_baseline_in_keyup_ms,calibration_sample_count,run_id,time_origin_epoch_ms,clock_anchor_perf_ms,clock_anchor_epoch_ms"];
  for (const r of records) {
    lines.push([r.index, r.error ? NaN : r.down, r.error ? NaN : r.up, r.error ? "failed" : "ok",
      r.revision, r.timingBasis, r.transferOrder, r.holdTime,
      r.usbStartedAt, r.usbSentAt, r.usbReceivedAt, r.inSubmittedAt,
      r.downAt, r.upAt, r.downEventAt, r.upEventAt,
      eventHandlerDelay(r.downEventAt, r.downAt), eventHandlerDelay(r.upEventAt, r.upAt),
      r.downFromIn, r.upFromIn,
      r.usbSentAt - r.usbStartedAt, r.usbReceivedAt - r.usbSentAt,
      Math.max(r.usbReceivedAt, r.usbSentAt) - r.usbStartedAt,
      r.replyCommand, r.replyValue, r.outRetried, r.failureStage, r.phase, r.error,
      r.downFromRequest, r.upFromRequest, r.calibration?.downOffset, r.calibration?.upOffset,
      r.calibration?.source, r.calibration?.referenceName, r.calibration?.referenceDown, r.calibration?.referenceUp,
      r.calibration?.baselineDown, r.calibration?.baselineUp, r.calibration?.sampleCount,
      r.runId, r.timeOriginEpoch, r.clockAnchorPerf, r.clockAnchorEpoch].map(cell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
