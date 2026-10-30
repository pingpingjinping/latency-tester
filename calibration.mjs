// Empirical scale matching, not a measurement of the tester's physical delay.
export const DEFAULT_REV3_CALIBRATION = Object.freeze({
  downOffset: 7.334, upOffset: 8.014, source: "reference_fit",
  referenceDown: 0.58, referenceUp: 0.46, baselineDown: -6.754, baselineUp: -7.554,
  sampleCount: 50, referenceName: "RAKKA Rev1 / FUN60 Ultra / 20ms / 2026-10-17"
});

function finiteNumber(value, label) {
  if (value === null || value === undefined || typeof value === "boolean" ||
      (typeof value === "string" && !value.trim())) throw new Error(label + "를 입력하세요.");
  const n = Number(value);
  if (!Number.isFinite(n) || n < -1000 || n > 1000) throw new Error(label + "는 −1000~1000ms 숫자여야 합니다.");
  return n;
}

export function validateCalibration(value) {
  const result = {
    downOffset: finiteNumber(value?.downOffset, "누름 보정값"),
    upOffset: finiteNumber(value?.upOffset, "뗌 보정값"),
    source: "manual"
  };
  if (value.source === "reference_fit") {
    const { referenceDown, referenceUp, baselineDown, baselineUp, sampleCount } = value;
    if (![referenceDown, referenceUp, baselineDown, baselineUp].every(Number.isFinite) ||
        !Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 100 ||
        Math.abs(referenceDown - baselineDown - result.downOffset) > 1e-6 ||
        Math.abs(referenceUp - baselineUp - result.upOffset) > 1e-6) {
      throw new Error("기준 장비 보정 기록이 올바르지 않습니다.");
    }
    Object.assign(result, { source: "reference_fit", referenceDown, referenceUp, baselineDown, baselineUp,
      sampleCount, referenceName: String(value.referenceName || "").slice(0, 80) });
  }
  return result;
}

export function applyRev3Calibration(record, calibration = DEFAULT_REV3_CALIBRATION) {
  const c = validateCalibration(calibration);
  const complete = !record.error && Number.isFinite(record.downFromIn) && Number.isFinite(record.upFromIn);
  return {
    ...record, timingBasis: "in_offset", calibration: c,
    downFromRequest: Number.isFinite(record.usbStartedAt) && Number.isFinite(record.downAt)
      ? record.downAt - record.usbStartedAt : NaN,
    upFromRequest: [record.usbStartedAt, record.upAt, record.holdTime].every(Number.isFinite)
      ? record.upAt - record.usbStartedAt - record.holdTime : NaN,
    down: complete ? record.downFromIn + c.downOffset : NaN,
    up: complete ? record.upFromIn + c.upOffset : NaN
  };
}

export function fitReferenceCalibration(records, referenceDown, referenceUp, referenceName = "") {
  const down = finiteNumber(referenceDown, "기준 장비 Keydown"), up = finiteNumber(referenceUp, "기준 장비 Keyup");
  const valid = records.filter(r => r.revision === "rev3" && !r.error && !r.outRetried &&
    r.phase !== "warmup" && Number.isFinite(r.downFromIn) && Number.isFinite(r.upFromIn));
  if (!valid.length) throw new Error("먼저 같은 키보드를 Rev3로 측정하세요.");
  const baselineDown = valid.reduce((s, r) => s + r.downFromIn, 0) / valid.length;
  const baselineUp = valid.reduce((s, r) => s + r.upFromIn, 0) / valid.length;
  return validateCalibration({
    downOffset: down - baselineDown, upOffset: up - baselineUp, source: "reference_fit",
    referenceDown: down, referenceUp: up, baselineDown, baselineUp, sampleCount: valid.length, referenceName
  });
}
