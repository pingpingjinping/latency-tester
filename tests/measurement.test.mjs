import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { collectInput, rev3RequestMeasurement, measureRev3, measurementCsv } from "../measurement.mjs";

const settings = { type: "keyboard", target: "a", hold: 20 };
const reply = () => ({ command: 2, value: 20, transferOrder: "prearmed", inSubmittedAt: 99.9,
  startedAt: 100, sentAt: 112, receivedAt: 104, outRetried: false });
const times = () => ({ downAt: 111, upAt: 131, downEventAt: 110.8, upEventAt: 130.8 });
function edge(type, key = "a", stamp = 110) {
  const e = new Event(type); e.key = key;
  Object.defineProperty(e, "timeStamp", { value: stamp }); return e;
}
const csvRows = records => {
  const [header, ...lines] = measurementCsv(records).trim().split(/\r?\n/);
  const keys = header.replace(/^\uFEFF/, "").split(",");
  return lines.map(line => {
    const values = line.split(","); assert.equal(values.length, keys.length);
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  });
};
test("request diagnostic retains independently timestamped early IN", () => {
  const r = rev3RequestMeasurement(reply(), times(), 20);
  assert.equal(r.down, 11); assert.equal(r.up, 11);
  assert.equal(r.downFromIn, 7); assert.equal(r.upFromIn, 7);
  assert.equal(r.usbReceivedAt, 104); assert.equal(r.usbSentAt, 112);
  assert.equal(r.timingBasis, "out_request");
});
test("request diagnostic is independent of USB completion and does not invent tester delay", () => {
  const base = rev3RequestMeasurement(reply(), times(), 20);
  const changed = rev3RequestMeasurement({ ...reply(), receivedAt: 140, sentAt: 124 }, times(), 20);
  assert.equal(changed.down, base.down); assert.equal(changed.up, base.up);
  assert.equal(changed.downFromIn, -29);
  const negative = rev3RequestMeasurement(reply(), { ...times(), downAt: 99, upAt: 119 }, 20);
  assert.equal(negative.down, -1); assert.equal(negative.up, -1);
});
test("bad commands, ordering or timestamps cannot become basic measurements", () => {
  for (const change of [{ command: 0 }, { transferOrder: "sequential" },
    { inSubmittedAt: 101 }, { receivedAt: 99 }, { sentAt: 99 }, { startedAt: NaN }]) {
    assert.throws(() => rev3RequestMeasurement({ ...reply(), ...change }, times(), 20));
  }
  assert.throws(() => rev3RequestMeasurement(reply(), { downAt: 140, upAt: 130 }, 20));
});
test("input listeners precede the contact request and are removed after success", async t => {
  const target = new EventTarget(), controller = new AbortController();
  let now = 111; t.mock.method(performance, "now", () => now);
  let contacts = 0;
  const r = await measureRev3({
    async contactOncePrearmed(hold) {
      contacts++; assert.equal(hold, 20); assert.equal(getEventListeners(target, "keydown").length, 1);
      target.dispatchEvent(edge("keydown", "b"));
      target.dispatchEvent(edge("keydown")); now = 131; target.dispatchEvent(edge("keyup"));
      return reply();
    },
    contactOnce() { assert.fail("must not fall back to sequential contacts"); }
  }, settings, controller.signal, target);
  assert.equal(contacts, 1); assert.ok(Math.abs(r.down - 14.334) < 1e-9); assert.ok(Math.abs(r.up - 15.014) < 1e-9);
  assert.equal(r.downFromRequest, 11); assert.equal(r.calibration.source, "reference_fit");
  assert.equal(getEventListeners(target, "keydown").length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
test("missing keyup preserves partial input and complete USB timings instead of zeroes", async t => {
  const timers = [], target = new EventTarget();
  t.mock.method(globalThis, "setTimeout", (fn, ms) => { timers.push({ fn, ms }); return 0; });
  t.mock.method(performance, "now", () => 111);
  const pending = measureRev3({ async contactOncePrearmed() {
    target.dispatchEvent(edge("keydown")); return reply();
  } }, settings, new AbortController().signal, target);
  await Promise.resolve(); timers[0].fn();
  await assert.rejects(pending, error => {
    assert.equal(timers[0].ms, 1020);
    const p = error.measurement;
    assert.equal(p.failureStage, "input_timeout");
    assert.equal(p.downAt, 111); assert.equal(p.upAt, undefined);
    assert.equal(p.usbStartedAt, 100); assert.equal(p.usbReceivedAt, 104);
    const [r] = csvRows([{ index: 1, ...p, error: error.message }]);
    assert.equal(r.keydown_ms, ""); assert.equal(r.keyup_ms, "");
    assert.equal(r.keydown_at_ms, "111.000"); assert.equal(r.keyup_at_ms, "");
    assert.equal(r.failure_stage, "input_timeout"); return true;
  });
  assert.equal(getEventListeners(target, "keyup").length, 0);
});
test("USB failure preserves the completed direction and any input already received", async t => {
  const target = new EventTarget(); t.mock.method(performance, "now", () => 111);
  const failure = new Error("OUT stall");
  failure.usbTiming = { command: 2, startedAt: 100, receivedAt: 104, inSubmittedAt: 99.9, transferOrder: "prearmed" };
  await assert.rejects(measureRev3({ async contactOncePrearmed() {
    target.dispatchEvent(edge("keydown")); throw failure;
  } }, settings, new AbortController().signal, target), error => {
    assert.equal(error.measurement.failureStage, "usb");
    assert.equal(error.measurement.usbReceivedAt, 104);
    assert.equal(error.measurement.usbSentAt, undefined);
    assert.equal(error.measurement.downAt, 111); return true;
  });
});
test("orphan keyup and abort are distinct failures and late events do not rewrite snapshots", async t => {
  const target = new EventTarget(), controller = new AbortController();
  t.mock.method(performance, "now", () => 111);
  const input = collectInput(settings, controller.signal, target);
  target.dispatchEvent(edge("keyup"));
  await assert.rejects(input.result, { code: "INPUT_ORDER" });
  target.dispatchEvent(edge("keydown"));
  assert.equal(input.times().downAt, undefined); assert.equal(input.times().upAt, 111); input.cleanup();
  const stopped = collectInput(settings, controller.signal, target); controller.abort();
  await assert.rejects(stopped.result, { code: "ABORTED" }); stopped.cleanup();
});
test("basic CSV matches displayed values, distinguishes basis and contains no midpoint estimates", () => {
  const base = { index: 1, error: null, phase: "measure", ...rev3RequestMeasurement(reply(), times(), 20) };
  const [r, rev1] = csvRows([base, { index: 2, revision: "rev1", timingBasis: "out_complete", down: 5, up: 6 }]);
  assert.equal(r.keydown_ms, "11.000"); assert.equal(r.in_keydown_ms, "7.000");
  assert.equal(r.timing_basis, "out_request"); assert.equal(r.transfer_order, "prearmed");
  assert.equal(r.reply_wait_ms, "-8.000"); assert.equal(r.total_ms, "12.000");
  assert.equal(rev1.timing_basis, "out_complete"); assert.equal(rev1.in_end_at_ms, "");
  assert.doesNotMatch(measurementCsv([base]), /midpoint/);
  const failed = measurementCsv([{ index: 2, error: 'bad,"reply"' }]);
  assert.match(failed, /"bad,""reply"""/);
});
