import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_REV3_CALIBRATION, validateCalibration, applyRev3Calibration, fitReferenceCalibration } from "../calibration.mjs";
import { measureRev3, measurementCsv } from "../measurement.mjs";

function capture() {
  const lines = readFileSync(new URL("../docs/experiments/rev3-2026-10-30/fun60-wired.csv", import.meta.url), "utf8")
    .replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const keys = lines.shift().split(",");
  return lines.map(line => {
    const r = Object.fromEntries(line.split(",").map((v, i) => [keys[i], v]));
    return { index: +r.test, revision: "rev3", phase: r.phase, error: null,
      down: +r.keydown_ms, up: +r.keyup_ms, downFromIn: +r.in_keydown_ms, upFromIn: +r.in_keyup_ms,
      downAt: +r.keydown_at_ms, upAt: +r.keyup_at_ms, holdTime: +r.hold_ms,
      usbStartedAt: +r.out_start_at_ms, usbSentAt: +r.out_end_at_ms, usbReceivedAt: +r.in_end_at_ms,
      transferOrder: r.transfer_order, outRetried: r.out_retried === "true" };
  });
}
const mean = (rows, key) => rows.reduce((s, r) => s + r[key], 0) / rows.length;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("historical Rev1 preset matches FUN60 20ms averages without erasing negative tails or raw timestamps", () => {
  const raw = capture(), before = structuredClone(raw);
  const adjusted = raw.map(r => applyRev3Calibration(r));
  assert.equal(adjusted.length, 50); near(mean(adjusted, "down"), .58); near(mean(adjusted, "up"), .46);
  for (let i = 0; i < raw.length; i++) {
    near(adjusted[i].downFromRequest, raw[i].down);
    near(adjusted[i].upFromRequest, raw[i].up);
    assert.equal(adjusted[i].downFromIn, raw[i].downFromIn);
    assert.equal(adjusted[i].usbReceivedAt, raw[i].usbReceivedAt);
    assert.equal(adjusted[i].timingBasis, "in_offset");
    assert.equal(adjusted[i].calibration.source, "reference_fit");
    assert.equal(adjusted[i].calibration.referenceDown, .58);
    assert.equal(adjusted[i].calibration.referenceUp, .46);
  }
  assert.ok(adjusted.some(r => r.down < 0)); assert.ok(adjusted.some(r => r.up < 0));
  assert.deepEqual(raw, before);
});

test("preset provenance selects Rev1 20ms without averaging other holds or GMK's rough reference", () => {
  const ref = JSON.parse(readFileSync(new URL("../docs/experiments/rev3-2026-10-30/rev1-reference-values.json", import.meta.url), "utf8"));
  const selected = ref.measurements.find(r => r.hold_ms === ref.selected_hold_ms);
  assert.equal(selected.hold_ms, 20); assert.equal(selected.count, 50);
  near(DEFAULT_REV3_CALIBRATION.referenceDown, selected.keydown_average_ms);
  near(DEFAULT_REV3_CALIBRATION.referenceUp, selected.keyup_average_ms);
  near(ref.gmk70_cross_check.rev3_in_keydown_average_ms + DEFAULT_REV3_CALIBRATION.downOffset, 9.884);
  assert.equal(ref.gmk70_cross_check.reported_reference_approx_ms, 10);
});

test("fitting a reference matches both averages independently and never compounds an existing correction", () => {
  const raw = capture();
  const c = fitReferenceCalibration(raw, "1.1", "0.4", "Rev1 / FUN60");
  near(c.downOffset, 7.854); near(c.upOffset, 7.954); assert.equal(c.sampleCount, 50);
  const once = raw.map(r => applyRev3Calibration(r, c));
  near(mean(once, "down"), 1.1); near(mean(once, "up"), .4);
  const c2 = fitReferenceCalibration(once, 2, 3, "Other");
  const twice = once.map(r => applyRev3Calibration(r, c2));
  near(mean(twice, "down"), 2); near(mean(twice, "up"), 3);
  assert.deepEqual(twice.map(r => [r.downFromIn, r.upFromIn]), raw.map(r => [r.downFromIn, r.upFromIn]));
});

test("reference fit excludes failures, warmups, retries, non-Rev3 and incomplete pairs", () => {
  const r = capture()[0];
  const records = [r, { ...r, error: "timeout" }, { ...r, phase: "warmup" }, { ...r, outRetried: true },
    { ...r, revision: "rev1" }, { ...r, upFromIn: NaN }];
  const c = fitReferenceCalibration(records, 1, 2);
  assert.equal(c.sampleCount, 1); near(c.downOffset, 1 - r.downFromIn);
  assert.throws(() => fitReferenceCalibration([], 1, 2), /먼저/);
});

test("blank and invalid coefficients/targets do not silently turn into zero", () => {
  for (const value of ["", "  ", null, undefined, true, NaN, Infinity, "abc", -1001, 1001]) {
    assert.throws(() => validateCalibration({ downOffset: value, upOffset: 8 }));
    assert.throws(() => fitReferenceCalibration(capture(), value, 1));
  }
  assert.equal(validateCalibration({ downOffset: "0", upOffset: "-2.5" }).downOffset, 0);
  assert.equal(validateCalibration({ downOffset: 9, upOffset: 8 }).source, "manual");
  const c = fitReferenceCalibration(capture(), 1, 2);
  assert.throws(() => validateCalibration({ ...c, downOffset: c.downOffset + 1 }), /기록/);
});

test("offsets preserve slower/faster order and failed records never contribute numeric results", () => {
  const r = capture()[0], c = { downOffset: -1, upOffset: 0 };
  const original = applyRev3Calibration(r, c);
  const slower = applyRev3Calibration({ ...r, downFromIn: r.downFromIn + 2, upFromIn: r.upFromIn + 2 }, c);
  near(slower.down - original.down, 2); near(slower.up - original.up, 2);
  assert.ok(Number.isNaN(applyRev3Calibration({ ...r, error: "failed" }, c).down));
});

test("invalid coefficients cannot submit a contact, and each measurement snapshots the profile", async () => {
  let calls = 0;
  const target = new EventTarget();
  await assert.rejects(measureRev3({ contactOncePrearmed() { calls++; } },
    { hold: 20, calibration: { downOffset: "", upOffset: 8 } }, new AbortController().signal, target));
  assert.equal(calls, 0);
  const profile = { downOffset: 8, upOffset: 9 };
  const r = applyRev3Calibration(capture()[0], profile); profile.downOffset = 100;
  assert.equal(r.calibration.downOffset, 8);
});

test("CSV keeps the old 29 positions and appends reproducible correction and reference metadata", () => {
  const rows = capture(), c = fitReferenceCalibration(rows, 1.1, .4, 'Rev1,"FUN60"');
  const csv = measurementCsv([applyRev3Calibration(rows[0], c)]);
  const [header, line] = csv.trim().split(/\r?\n/), keys = header.replace(/^\uFEFF/, "").split(",");
  assert.equal(keys[28], "error"); assert.equal(keys[29], "out_request_keydown_ms");
  assert.ok(keys.includes("calibration_baseline_in_keydown_ms"));
  assert.match(line, /in_offset/); assert.match(line, /reference_fit/); assert.match(line, /"Rev1,""FUN60"""/);
  const simple = measurementCsv([applyRev3Calibration(rows[0])]).trim().split(/\r?\n/)[1].split(",");
  const r = Object.fromEntries(keys.map((key, i) => [key, simple[i]]));
  near(+r.keydown_ms, +r.in_keydown_ms + +r.keydown_offset_ms);
  near(+r.out_request_keydown_ms, +r.keydown_at_ms - +r.out_start_at_ms);
});
