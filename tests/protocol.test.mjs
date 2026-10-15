import test from "node:test";
import assert from "node:assert/strict";
import { IDS, validateSettings, rev1Packet, calculate, stats, csv } from "../protocol.mjs";

test("Rev1 and Rev3 USB IDs", () => {
  assert.deepEqual(IDS.rev1, { vendorId: 0x5249, productId: 0x4c54 });
  assert.deepEqual(IDS.rev3, { vendorId: 0x5249, productId: 0x4c65 });
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
