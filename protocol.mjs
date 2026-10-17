export const IDS = Object.freeze({
  rev1: Object.freeze({ vendorId: 0x5249, productId: 0x4c54 })
});

export function validateSettings(input) {
  const settings = {
    hold: Number(input.hold),
    interval: Number(input.interval),
    count: Number(input.count),
    warmup: Number(input.warmup),
    target: String(input.target || "").toLowerCase(),
    type: input.type
  };
  for (const [key, min, max] of [
    ["hold", 1, 200], ["interval", 0, 100], ["count", 1, 100], ["warmup", 0, 10]
  ]) {
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) {
      throw new Error(key + ": " + min + "~" + max + " 범위의 정수를 입력하세요.");
    }
  }
  if (!["keyboard", "mouse"].includes(settings.type)) throw new Error("측정 대상을 선택하세요.");
  if (settings.type === "keyboard" && settings.target.length !== 1) {
    throw new Error("측정할 일반 문자 키 하나를 입력하세요.");
  }
  return settings;
}

export function rev1Packet(hold) {
  if (!Number.isInteger(hold) || hold < 1 || hold > 200) throw new RangeError("잘못된 유지 시간");
  const packet = new Uint8Array(8);
  packet[0] = hold;
  packet[1] = 0; // NEVER set to 1: Rev1 DFU entry command
  return packet;
}

export function calculate(sentAt, downAt, upAt, hold) {
  return { down: downAt - sentAt, up: upAt - sentAt - hold };
}

export function stats(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  const ordered = [...valid].sort((a, b) => a - b);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    avg, min: ordered[0], max: ordered.at(-1), count: valid.length,
    p95: ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)]
  };
}

// EXPERIMENTAL estimate, not an independently verified contact timestamp.
// Never rewrite the official Rev3 values stored as record.down / record.up.
export function rev3Midpoint(record) {
  if (!Number.isFinite(record.down) || !Number.isFinite(record.up) ||
      !Number.isFinite(record.usbReplyWait)) {
    return { down: NaN, up: NaN };
  }
  return {
    down: record.down + record.usbReplyWait / 2,
    up: record.up + record.usbReplyWait / 2
  };
}

export function csv(records) {
  const lines = ["\uFEFFtest,keydown_ms,keyup_ms,status,rev3_out_keydown_ms,rev3_out_keyup_ms,rev3_usb_reply_wait_ms,rev3_midpoint_keydown_est_ms,rev3_midpoint_keyup_est_ms"];
  for (const r of records) {
    lines.push([
      r.index,
      Number.isFinite(r.down) ? r.down.toFixed(3) : "",
      Number.isFinite(r.up) ? r.up.toFixed(3) : "",
      r.error ? "failed" : "ok",
      Number.isFinite(r.downFromOut) ? r.downFromOut.toFixed(3) : "",
      Number.isFinite(r.upFromOut) ? r.upFromOut.toFixed(3) : "",
      Number.isFinite(r.usbReplyWait) ? r.usbReplyWait.toFixed(3) : "",
      Number.isFinite(rev3Midpoint(r).down) ? rev3Midpoint(r).down.toFixed(3) : "",
      Number.isFinite(rev3Midpoint(r).up) ? rev3Midpoint(r).up.toFixed(3) : ""
    ].join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
