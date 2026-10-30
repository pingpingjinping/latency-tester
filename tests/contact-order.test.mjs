import test from "node:test";
import assert from "node:assert/strict";
import { Rev3Session } from "../rev3-protocol.mjs";
import { runContactComparison, contactComparisonStats, contactComparisonCsv } from "../contact-order.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function data(command = 2, hold = 20) {
  const value = new DataView(new ArrayBuffer(64));
  value.setUint8(0, command); value.setUint32(2, hold, true); return value;
}
const sample = mode => {
  const receivedAt = mode === "prearmed" ? 103 : 120;
  return { transferOrder: mode, replyCommand: 2, replyValue: 20,
    usbStartedAt: 100, usbSentAt: 104, usbReceivedAt: receivedAt,
    inSubmittedAt: mode === "prearmed" ? 99.9 : undefined,
    downAt: 115, upAt: 140, downEventAt: 109, upEventAt: 129,
    down: 115 - receivedAt, up: 140 - receivedAt - 20,
    downFromOut: 11, upFromOut: 16, holdTime: 20, outRetried: false };
};
const options = { count: 3, warmup: 1, interval: 0 };

test("prearmed contact uses the original 64-byte contact packet and records early IN independently", async t => {
  let now = 100; t.mock.method(performance, "now", () => now);
  const input = deferred(), output = deferred(), calls = [];
  const s = new Rev3Session({ opened: true,
    transferIn() { calls.push("IN"); return input.promise; },
    transferOut(_endpoint, bytes) {
      calls.push("OUT"); assert.equal(bytes.length, 64);
      assert.deepEqual([...bytes.slice(0, 6)], [2, 0, 20, 0, 0, 0]);
      assert.ok([...bytes.slice(6)].every(b => b === 0)); return output.promise;
    }
  }, { inEndpoint: 1, outEndpoint: 1 });
  const pending = s.contactOncePrearmed(20);
  assert.deepEqual(calls, ["IN", "OUT"]);
  now = 103; input.resolve({ status: "ok", data: data() }); await Promise.resolve();
  now = 104; output.resolve({ status: "ok" });
  const result = await pending;
  assert.equal(result.command, 2); assert.equal(result.value, 20);
  assert.equal(result.receivedAt, 103); assert.equal(result.sentAt, 104);
  assert.equal(result.transferOrder, "prearmed"); assert.equal(result.outRetried, false);
});

test("invalid prearmed hold never queues IN or OUT", async () => {
  const s = new Rev3Session({ opened: true,
    transferIn() { assert.fail("invalid input queued IN"); },
    transferOut() { assert.fail("invalid input actuated a contact"); }
  }, {});
  for (const hold of [0, 201, 1.5, NaN]) await assert.rejects(s.contactOncePrearmed(hold), RangeError);
  assert.equal(s.closed, false);
});

test("a version reply during contact comparison closes pending OUT and rejects the sample", async () => {
  const output = deferred(); let closed = false;
  const s = new Rev3Session({ opened: true,
    async transferIn() { return { status: "ok", data: data(0) }; },
    transferOut() { return output.promise; },
    async close() { closed = true; output.reject(new Error("cancelled")); }
  }, { inEndpoint: 1, outEndpoint: 1 });
  await assert.rejects(s.contactOncePrearmed(20), /불일치/);
  assert.equal(closed, true); assert.equal(s.closed, true);
});

test("contact comparison balances AB/BA actuations and excludes warmups for both methods", async () => {
  const calls = [];
  const result = await runContactComparison(async mode => { calls.push(mode); return sample(mode); }, options);
  assert.deepEqual(calls, ["sequential", "prearmed", "prearmed", "sequential",
    "sequential", "prearmed", "prearmed", "sequential"]);
  assert.equal(result.records.length, 6);
  assert.deepEqual(result.records.map(r => r.pairIndex), [1, 1, 2, 2, 3, 3]);
  const summary = contactComparisonStats(result.records);
  assert.equal(summary.count, 3); assert.equal(summary.sequential.down.avg, -5);
  assert.equal(summary.prearmed.reply.avg, -1); assert.equal(summary.prearmed.total.avg, 4);
  assert.equal(summary.difference.down.avg, 17);
});

test("partial, failed and retried pairs stay recorded and cannot bias summaries", () => {
  const row = (mode, pairIndex) => ({ ...sample(mode), mode, pairIndex, phase: "measure" });
  const records = [row("sequential", 1), row("prearmed", 1), row("sequential", 2),
    { ...row("prearmed", 2), outRetried: true }, row("sequential", 3),
    { mode: "prearmed", pairIndex: 3, phase: "measure", error: "missing keyup" }, row("prearmed", 4)];
  const summary = contactComparisonStats(records);
  assert.equal(summary.count, 1); assert.equal(summary.failed, 1); assert.equal(summary.retried, 1);
  assert.equal(summary.sequential.down.avg, -5); assert.equal(records.length, 7);
});

test("input/USB error stops all later contact commands, retaining its mode and partial pair", async () => {
  const calls = [];
  const result = await runContactComparison(async mode => {
    calls.push(mode); if (mode === "prearmed") throw new Error("missing keyup"); return sample(mode);
  }, { ...options, count: 50, warmup: 0 });
  assert.deepEqual(calls, ["sequential", "prearmed"]);
  assert.equal(result.records.length, 2); assert.equal(result.records[1].pairIndex, 1);
  assert.equal(result.records[1].error, "missing keyup");
  assert.equal(contactComparisonStats(result.records).count, 0);
});

test("warmup errors are saved and stop before measurement starts", async () => {
  let calls = 0;
  const result = await runContactComparison(async () => { calls++; throw new Error("bad reply"); }, options);
  assert.equal(calls, 1); assert.equal(result.records[0].phase, "warmup");
  assert.equal(contactComparisonStats(result.records).count, 0);
});

test("stop between methods sends no second actuation and retains the incomplete pair", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await runContactComparison(async mode => { calls++; return sample(mode); }, {
    ...options, warmup: 0, signal: controller.signal, onRecord: () => controller.abort()
  });
  assert.equal(result.aborted, true); assert.equal(calls, 1); assert.equal(result.records.length, 1);
  assert.equal(contactComparisonStats(result.records).count, 0);
});

test("invalid settings or stop from progress submit no contact", async () => {
  const measure = () => assert.fail("unexpected contact");
  await assert.rejects(runContactComparison(measure, { ...options, count: 0 }), RangeError);
  const controller = new AbortController();
  const result = await runContactComparison(measure, { ...options, signal: controller.signal,
    onProgress: () => controller.abort() });
  assert.equal(result.aborted, true); assert.equal(result.records.length, 0);
});

test("invalid reply mode/command or premature stale IN stop the comparison", async () => {
  for (const change of [{ transferOrder: "prearmed" }, { replyCommand: 0 },
    { usbReceivedAt: 99 }, { usbReceivedAt: 103 }]) {
    let calls = 0;
    const result = await runContactComparison(async mode => { calls++; return { ...sample(mode), ...change }; },
      { ...options, warmup: 0 });
    assert.equal(calls, 1); assert.match(result.records[0].error, /잘못/);
  }
});

test("comparison CSV preserves signed values and lets every interval be recomputed", async () => {
  const { records } = await runContactComparison(async mode => sample(mode), { ...options, count: 1, warmup: 0 });
  const [header, ...lines] = contactComparisonCsv(records, { hold: 20, type: "keyboard", target: "a", interval: 50 })
    .trim().split(/\r?\n/);
  const keys = header.replace(/^\uFEFF/, "").split(",");
  const rows = lines.map(line => {
    const cells = line.split(","); assert.equal(cells.length, keys.length);
    return Object.fromEntries(keys.map((k, i) => [k, cells[i]]));
  });
  assert.equal(rows[0].keydown_in_ms, "-5.000");
  assert.equal(rows[1].reply_wait_ms, "-1.000");
  assert.equal(rows[1].in_before_out_complete, "true");
  assert.equal(rows[1].total_ms, "4.000");
  for (const r of rows) {
    assert.equal(Number(r.keydown_in_ms), Number(r.keydown_at_ms) - Number(r.in_end_at_ms));
    assert.equal(Number(r.keyup_in_ms), Number(r.keyup_at_ms) - Number(r.in_end_at_ms) - Number(r.hold_ms));
    assert.equal(Number(r.keydown_handler_delay_ms), Number(r.keydown_at_ms) - Number(r.keydown_event_at_ms));
    assert.equal(r.event_timestamps_valid, "true");
  }
  const bad = contactComparisonCsv([{ ...records[0], downEventAt: 0 }], { hold: 20 });
  const cells = bad.trim().split(/\r?\n/)[1].split(",");
  assert.equal(cells[keys.indexOf("keydown_event_at_ms")], "0.000");
  assert.equal(cells[keys.indexOf("keydown_event_in_ms")], "");
  assert.equal(cells[keys.indexOf("event_timestamps_valid")], "false");
  assert.match(contactComparisonCsv([{ error: 'bad,"reply"', mode: "prearmed" }], { hold: 20 }), /"bad,""reply"""/);
});
