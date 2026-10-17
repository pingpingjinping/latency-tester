import test from "node:test";
import assert from "node:assert/strict";
import { IDS, validateSettings, rev1Packet, calculate, stats, csv, rev3Midpoint } from "../protocol.mjs";

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
  assert.equal(lines[1], "1,9.410,10.330,ok,,,,,");
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
