import test from "node:test";
import assert from "node:assert/strict";
import { eventHandlerDelay, rev3EventMidpoint } from "../input-timing.mjs";
import { calculate, rev3Midpoint, csv } from "../protocol.mjs";

const sample = () => ({
  index: 1, error: null, ...calculate(120, 115, 140, 20),
  usbReplyWait: 16, usbSentAt: 104, usbReceivedAt: 120,
  downAt: 115, upAt: 140, holdTime: 20, downEventAt: 109, upEventAt: 129
});

test("event timing isolates different handler delays without moving the USB midpoint", () => {
  const record = sample(), original = { ...record };
  const old = rev3Midpoint(record), event = rev3EventMidpoint(record);
  assert.deepEqual(old, { down: 3, up: 8 });
  assert.deepEqual(event, { valid: true, down: -3, up: -3, downDelay: 6, upDelay: 11 });
  assert.equal(old.down - event.down, event.downDelay);
  assert.equal(old.up - event.up, event.upDelay);
  assert.deepEqual(record, original);
});

test("zero real delay is valid and not confused with a missing timestamp", () => {
  assert.equal(eventHandlerDelay(115, 115), 0);
  const record = { ...sample(), downEventAt: 115, upEventAt: 140 };
  assert.equal(rev3EventMidpoint(record).valid, true);
  assert.equal(rev3EventMidpoint(record).downDelay, 0);
  assert.equal(rev3EventMidpoint(record).upDelay, 0);
});

test("missing, nonnumeric, epoch-style and future event timestamps stay unavailable", () => {
  for (const stamp of [undefined, null, "109", NaN, Infinity, 0, -1, 116, 1790000000000]) {
    assert.ok(Number.isNaN(eventHandlerDelay(stamp, 115)));
    const event = rev3EventMidpoint({ ...sample(), downEventAt: stamp });
    assert.equal(event.valid, false);
    assert.ok(Number.isNaN(event.downDelay));
    assert.ok(Number.isNaN(event.down));
  }
});

test("bad edge ordering, missing hold and reversed USB interval exclude the comparison", () => {
  for (const change of [
    { downEventAt: 114, upEventAt: 110 }, { holdTime: undefined },
    { holdTime: 0 }, { usbSentAt: 121 }, { usbReceivedAt: undefined }
  ]) assert.equal(rev3EventMidpoint({ ...sample(), ...change }).valid, false);
});

test("a long dispatch wait changes handler results but not the event-based estimate", () => {
  const record = sample();
  const delayed = { ...record, upAt: record.upAt + 40,
    ...calculate(record.usbReceivedAt, record.downAt, record.upAt + 40, record.holdTime) };
  assert.equal(rev3Midpoint(delayed).up - rev3Midpoint(record).up, 40);
  assert.equal(rev3EventMidpoint(delayed).up, rev3EventMidpoint(record).up);
  assert.equal(rev3EventMidpoint(delayed).upDelay, 51);
});

test("CSV preserves old columns and raw timestamps, flags missing data, and keeps negative estimates", () => {
  const record = sample();
  const [header, line] = csv([record]).trim().split(/\r?\n/);
  const names = header.replace(/^\uFEFF/, "").split(",");
  const row = Object.fromEntries(names.map((key, i) => [key, line.split(",")[i]]));
  assert.equal(names[19], "rev3_hold_ms");
  assert.equal(names[20], "rev3_keydown_event_at_ms");
  assert.equal(row.keydown_ms, "-5.000");
  assert.equal(row.keyup_ms, "0.000");
  assert.equal(row.rev3_midpoint_keydown_est_ms, "3.000");
  assert.equal(row.rev3_keydown_event_at_ms, "109.000");
  assert.equal(row.rev3_keydown_handler_delay_ms, "6.000");
  assert.equal(row.rev3_keyup_handler_delay_ms, "11.000");
  assert.equal(row.rev3_event_timestamps_valid, "true");
  assert.equal(row.rev3_event_midpoint_keydown_est_ms, "-3.000");
  assert.equal(row.rev3_event_midpoint_keyup_est_ms, "-3.000");
  const invalid = csv([{ ...record, downEventAt: 0 }]).trim().split(/\r?\n/)[1].split(",");
  assert.equal(invalid[names.indexOf("rev3_keydown_event_at_ms")], "0.000");
  assert.equal(invalid[names.indexOf("rev3_event_timestamps_valid")], "false");
  assert.equal(invalid[names.indexOf("rev3_keydown_handler_delay_ms")], "");
  assert.equal(invalid[names.indexOf("rev3_event_midpoint_keydown_est_ms")], "");
});
