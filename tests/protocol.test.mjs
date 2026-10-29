import test from "node:test";
import assert from "node:assert/strict";
import { IDS, validateSettings, rev1Packet, calculate, stats, csv, rev3Midpoint, rev3TransactionMidpoint } from "../protocol.mjs";

test("Rev1 USB ID", () => {
  assert.deepEqual(IDS.rev1, { vendorId: 0x5249, productId: 0x4c54 });
});
test("Rev1 measurement packets never enter DFU mode", () => {
  assert.deepEqual([...rev1Packet(20)], [20, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...rev1Packet(40)], [40, 0, 0, 0, 0, 0, 0, 0]);
  assert.throws(() => rev1Packet(256), RangeError);
});
test("Settings limit invalid values", () => {
  const input = { hold: "20", interval: "50", count: "10", warmup: "5", type: "keyboard", target: "A" };
  assert.equal(validateSettings(input).target, "a");
  assert.throws(() => validateSettings({ ...input, hold: "0" }));
  assert.throws(() => validateSettings({ ...input, target: "F12" }));
});
test("Latency calculation matches observed Rev1 arithmetic", () => {
  const result = calculate(100, 109.4, 130.1, 20);
  assert.ok(Math.abs(result.down - 9.4) < 0.0001);
  assert.ok(Math.abs(result.up - 10.1) < 0.0001);
});
test("Failed samples do not influence statistics", () => {
  const result = stats([5, 7, NaN, 9]);
  assert.equal(result.count, 3);
  assert.equal(result.avg, 7);
  assert.equal(result.p95, 9);
});
test("CSV outputs Keydown and Keyup values", () => {
  const result = csv([{ index: 1, down: 9.41, up: 10.33, error: null }]);
  assert.match(result, /keydown_ms,keyup_ms,status/);
  assert.match(result, /1,9\.410,10\.330,ok/);
});

test("Rev3 diagnostics add OUT-based timings without altering canonical values", () => {
  const result = csv([{
    index: 1,
    down: 5.25,
    up: 5.5,
    error: null,
    downFromOut: 8.25,
    upFromOut: 8.5,
    usbReplyWait: 3
  }]);
  assert.match(result, /rev3_out_keydown_ms,rev3_out_keyup_ms,rev3_usb_reply_wait_ms/);
  assert.match(result, /1,5\.250,5\.500,ok,8\.250,8\.500,3\.000/);
});
test("Rev1 CSV leaves Rev3-only diagnostics blank", () => {
  const lines = csv([{ index: 1, down: 9.41, up: 10.33, error: null }]).trim().split(/\r?\n/);
  const columns = lines[1].split(",");
  assert.deepEqual(columns.slice(0, 4), ["1", "9.410", "10.330", "ok"]);
  assert.equal(columns.length, lines[0].split(",").length);
  assert.ok(columns.slice(4).every(value => value === ""));
});

test("Rev3 midpoint estimates use each sample's own USB response time", () => {
  const fun = rev3Midpoint({ down: -6.89, up: -8.08, usbReplyWait: 15.98 });
  assert.ok(Math.abs(fun.down - 1.1) < 1e-9);
  assert.ok(Math.abs(fun.up - (-0.09)) < 1e-9);
  assert.ok(Math.abs(rev3Midpoint({ down: 2.55, up: 2.32, usbReplyWait: 16.09 }).down - 10.595) < 1e-9);
  assert.ok(Number.isNaN(rev3Midpoint({ down: NaN, up: 2.32, usbReplyWait: 16 }).down));
});
test("Rev3 CSV retains raw values and adds midpoint estimates in separate columns", () => {
  const result = csv([{
    index: 1, down: -6.89, up: -8.08, usbReplyWait: 15.98,
    downFromOut: 9.09, upFromOut: 7.9, error: null
  }]);
  assert.match(result, /rev3_midpoint_keydown_est_ms,rev3_midpoint_keyup_est_ms/);
  assert.match(result, /1,-6\.890,-8\.080,ok,9\.090,7\.900,15\.980,1\.100,-0\.090/);
});

test("transaction midpoint matches independently specified timestamps for both edges", () => {
  // OUT starts 100, completes 104; IN completes 120. Inputs at 109/129,
  // with a 20ms hold: old midpoint 112 -> -3ms; new midpoint 110 -> -1ms.
  const record = {
    ...calculate(120, 109, 129, 20), usbReplyWait: 16,
    usbTransactionTime: 20, outRetried: false
  };
  const before = { ...record };
  assert.deepEqual(rev3Midpoint(record), { down: -3, up: -3 });
  assert.deepEqual(rev3TransactionMidpoint(record), { down: -1, up: -1 });
  assert.deepEqual(record, before, "raw records must stay unchanged");
  // A slower input must stay slower, including across the zero boundary.
  const slower = { ...record, ...calculate(120, 111, 131, 20) };
  assert.deepEqual(rev3TransactionMidpoint(slower), { down: 1, up: 1 });
});

test("transaction midpoint uses each OUT duration, with no fixed offset", () => {
  for (const outDuration of [0, 0.2, 4, 12]) {
    const record = { down: -6.89, up: -8.08, usbReplyWait: 15.98,
      usbTransactionTime: 15.98 + outDuration, outRetried: false };
    for (const key of ["down", "up"]) {
      assert.ok(Math.abs(rev3TransactionMidpoint(record)[key] -
        rev3Midpoint(record)[key] - outDuration / 2) < 1e-9);
    }
  }
});

test("new estimates exclude OUT retries, old records, and invalid intervals", () => {
  const valid = { down: -6, up: -7, usbReplyWait: 16, usbTransactionTime: 20 };
  for (const record of [
    { down: -6, up: -7, usbReplyWait: 16 },
    { ...valid, outRetried: true }, { ...valid, down: NaN },
    { ...valid, usbReplyWait: -1 }, { ...valid, usbTransactionTime: 15 },
    { ...valid, usbTransactionTime: Infinity }
  ]) {
    const result = rev3TransactionMidpoint(record);
    assert.ok(Number.isNaN(result.down) && Number.isNaN(result.up));
  }
});

test("CSV appends reconstructable timing data and preserves old columns and signs", () => {
  const record = { index: 1, ...calculate(120, 109, 129, 20), error: null,
    downFromOut: 5, upFromOut: 5, usbReplyWait: 16, usbOutDuration: 4,
    usbTransactionTime: 20, outRetried: false, usbStartedAt: 100,
    usbSentAt: 104, usbReceivedAt: 120, downAt: 109, upAt: 129, holdTime: 20 };
  const [header, line] = csv([record]).trim().split(/\r?\n/);
  const names = header.replace(/^\uFEFF/, "").split(",");
  const cells = line.split(",");
  assert.equal(cells.length, names.length);
  assert.deepEqual(cells.slice(0, 9), ["1", "-11.000", "-11.000", "ok",
    "5.000", "5.000", "16.000", "-3.000", "-3.000"]);
  const row = Object.fromEntries(names.map((name, i) => [name, cells[i]]));
  assert.equal(row.rev3_transaction_midpoint_keydown_est_ms, "-1.000");
  assert.equal(row.rev3_transaction_midpoint_keyup_est_ms, "-1.000");
  assert.equal(row.rev3_out_retried, "false");
  assert.equal(Number(row.rev3_keydown_at_ms) -
    (Number(row.rev3_out_start_at_ms) + Number(row.rev3_in_end_at_ms)) / 2, -1);
  assert.equal(Number(row.rev3_keyup_at_ms) - Number(row.rev3_hold_ms) -
    (Number(row.rev3_out_start_at_ms) + Number(row.rev3_in_end_at_ms)) / 2, -1);
  const retryCells = csv([{ ...record, outRetried: true }]).trim().split(/\r?\n/)[1].split(",");
  assert.equal(retryCells[names.indexOf("rev3_transaction_midpoint_keydown_est_ms")], "");
  assert.equal(retryCells[names.indexOf("rev3_out_retried")], "true");
});
