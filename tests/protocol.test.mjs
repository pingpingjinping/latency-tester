import test from "node:test";
import assert from "node:assert/strict";
import { IDS, validateSettings, rev1Packet, calculate, stats, csv } from "../protocol.mjs";

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
  assert.equal(lines[1], "1,9.410,10.330,ok,,,");
});
