import test from "node:test";
import assert from "node:assert/strict";
import { Rev3Session } from "../rev3-protocol.mjs";
import { versionTiming, runVersionComparison, versionComparisonStats, versionCsv } from "../rev3-diagnostics.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function data(command = 0) {
  const result = new DataView(new ArrayBuffer(64));
  result.setUint8(0, command); result.setUint32(2, 8, true); return result;
}
const reply = mode => ({ command: 0, value: 8, startedAt: 100, sentAt: 104,
  receivedAt: mode === "prearmed" ? 112 : 120, outRetried: false,
  ...(mode === "prearmed" ? { transferOrder: mode, inSubmittedAt: 99.9 } : {}) });
const session = device => new Rev3Session(device, { inEndpoint: 1, outEndpoint: 1 });

test("prearmed version submits IN before zero-filled VERSION OUT and timestamps early IN independently", async t => {
  let now = 100; t.mock.method(performance, "now", () => now);
  const input = deferred(), output = deferred(), calls = [];
  const s = session({ opened: true,
    transferIn(endpoint, size) { calls.push("IN"); assert.equal(endpoint, 1); assert.equal(size, 64); return input.promise; },
    transferOut(endpoint, bytes) { calls.push("OUT"); assert.equal(endpoint, 1); assert.deepEqual([...bytes], Array(64).fill(0)); return output.promise; }
  });
  const pending = s.versionPrearmed();
  assert.deepEqual(calls, ["IN", "OUT"]);
  now = 104; input.resolve({ status: "ok", data: data() });
  await Promise.resolve();
  now = 112; output.resolve({ status: "ok" });
  const result = await pending;
  assert.equal(result.receivedAt, 104); assert.equal(result.sentAt, 112);
  const timing = versionTiming(result, 1);
  assert.equal(timing.replyWait, -8);
  assert.equal(timing.inElapsed, 4);
  assert.equal(timing.totalTime, 12);
  assert.equal(timing.inBeforeOutComplete, true);
});

test("prearmed version also handles OUT completing before IN", async t => {
  let now = 100; t.mock.method(performance, "now", () => now);
  const input = deferred(), output = deferred();
  const s = session({ opened: true, transferIn: () => input.promise, transferOut: () => output.promise });
  const pending = s.versionPrearmed();
  now = 108; output.resolve({ status: "ok" }); await Promise.resolve();
  now = 116; input.resolve({ status: "ok", data: data() });
  const timing = versionTiming(await pending, 1);
  assert.equal(timing.replyWait, 8); assert.equal(timing.totalTime, 16);
  assert.equal(timing.inBeforeOutComplete, false);
});

test("failed prearmed OUT closes the session and outstanding IN without retrying", async () => {
  const input = deferred(); let outs = 0, closed = false;
  const s = session({ opened: true, transferIn: () => input.promise,
    async transferOut() { outs++; return { status: "stall" }; },
    async close() { closed = true; input.reject(new Error("cancelled")); },
    clearHalt() { assert.fail("must not retry a prearmed exchange"); }
  });
  await assert.rejects(s.versionPrearmed(), /stall/);
  assert.equal(closed, true); assert.equal(s.closed, true); assert.equal(outs, 1);
});

test("a synchronous OUT exception still handles and closes the pending IN", async () => {
  const input = deferred(); let closed = false;
  const s = session({ opened: true, transferIn: () => input.promise,
    transferOut() { throw new Error("OUT failed synchronously"); },
    async close() { closed = true; input.reject(new Error("cancelled")); }
  });
  await assert.rejects(s.versionPrearmed(), /synchronously/);
  assert.equal(closed, true);
});

test("bad prearmed IN command closes the pending OUT", async () => {
  const output = deferred(); let closed = false;
  const s = session({ opened: true,
    async transferIn() { return { status: "ok", data: data(2) }; },
    transferOut: () => output.promise,
    async close() { closed = true; output.reject(new Error("cancelled")); }
  });
  await assert.rejects(s.versionPrearmed(), /불일치/);
  assert.equal(closed, true);
});

test("prearmed timeout closes both pending directions and does not submit more requests", async t => {
  const timers = [], input = deferred(), output = deferred(), calls = [];
  t.mock.method(globalThis, "setTimeout", fn => { timers.push(fn); return 0; });
  const s = session({ opened: true,
    transferIn() { calls.push("IN"); return input.promise; },
    transferOut() { calls.push("OUT"); return output.promise; },
    async close() { calls.push("close"); input.reject(new Error("cancelled")); output.reject(new Error("cancelled")); }
  });
  const pending = s.versionPrearmed(); timers[0]();
  await assert.rejects(pending, /시간 초과/);
  assert.deepEqual(calls, ["IN", "OUT", "close"]); assert.equal(s.closed, true);
});

test("comparison balances AB/BA pairs and excludes both methods' warmups", async () => {
  const calls = [];
  const s = {
    async version() { calls.push("A"); return reply("sequential"); },
    async versionPrearmed() { calls.push("B"); return reply("prearmed"); },
    contactOnce() { assert.fail("must not actuate a contact"); }
  };
  const result = await runVersionComparison(s, { count: 3, warmup: 1, interval: 0 });
  assert.deepEqual(calls, ["A", "B", "B", "A", "A", "B", "B", "A"]);
  assert.equal(result.records.length, 6);
  assert.deepEqual(result.records.map(r => r.pairIndex), [1, 1, 2, 2, 3, 3]);
  const summary = versionComparisonStats(result.records);
  assert.equal(summary.count, 3); assert.equal(summary.sequential.count, 3); assert.equal(summary.prearmed.count, 3);
  assert.equal(summary.totalDifference.avg, -8);
});

test("partial, failed and retried pairs remain recorded but do not bias paired averages", () => {
  const row = (mode, pairIndex) => ({ ...versionTiming(reply(mode), pairIndex), pairIndex });
  const records = [row("sequential", 1), row("prearmed", 1), row("sequential", 2),
    { ...row("prearmed", 2), outRetried: true }, row("sequential", 3),
    { mode: "prearmed", pairIndex: 3, phase: "measure", error: "failed" }];
  const result = versionComparisonStats(records);
  assert.equal(result.count, 1); assert.equal(result.totalDifference.avg, -8);
  assert.equal(records.length, 6);
});

test("comparison cancellation between methods does not send the other method", async () => {
  const controller = new AbortController(); let calls = 0;
  const s = {
    async version() { calls++; return reply("sequential"); },
    async versionPrearmed() { assert.fail("must not submit a request after stop"); }
  };
  const result = await runVersionComparison(s, { count: 2, warmup: 0, interval: 0,
    signal: controller.signal, onRecord: () => controller.abort() });
  assert.equal(calls, 1); assert.equal(result.aborted, true); assert.equal(result.records.length, 1);
  assert.equal(versionComparisonStats(result.records).count, 0);
});

test("comparison error identifies its mode and stops all further requests", async () => {
  let calls = 0;
  const result = await runVersionComparison({
    async version() { calls++; return reply("sequential"); },
    async versionPrearmed() { calls++; throw new Error("failed receive"); }
  }, { count: 50, warmup: 0, interval: 0 });
  assert.equal(calls, 2); assert.equal(result.records.length, 2);
  assert.equal(result.records[1].mode, "prearmed");
  assert.equal(versionComparisonStats(result.records).count, 0);
  assert.match(versionCsv(result.records), /failed receive,prearmed/);
});

test("CSV preserves the original 13 columns and signed receive-before-OUT timings", () => {
  const r = { ...versionTiming({ ...reply("prearmed"), startedAt: 100, sentAt: 112, receivedAt: 104 }, 1), pairIndex: 1 };
  const [header, line] = versionCsv([r]).trim().split(/\r?\n/);
  const keys = header.replace(/^\uFEFF/, "").split(","), values = line.split(",");
  assert.equal(keys[12], "error"); assert.equal(keys[13], "mode"); assert.equal(keys.length, values.length);
  const row = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  assert.equal(row.reply_wait_ms, "-8.000"); assert.equal(row.total_ms, "12.000");
  assert.equal(row.in_elapsed_ms, "4.000"); assert.equal(row.in_before_out_complete, "true");
  assert.equal(row.mode, "prearmed"); assert.equal(Number(row.pair), 1);
});

test("comparison rejects invalid settings and stops if aborted by progress before submission", async () => {
  const controller = new AbortController();
  const s = { version() { assert.fail("unexpected request"); } };
  await assert.rejects(runVersionComparison(s, { count: 0 }), RangeError);
  const result = await runVersionComparison(s, { count: 1, warmup: 0, signal: controller.signal,
    onProgress: () => controller.abort() });
  assert.equal(result.aborted, true); assert.equal(result.records.length, 0);
});
