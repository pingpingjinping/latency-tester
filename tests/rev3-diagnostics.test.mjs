import test from "node:test";
import assert from "node:assert/strict";
import { Rev3Session } from "../rev3-protocol.mjs";
import { versionTiming, runVersionDiagnostics, versionStats, versionCsv } from "../rev3-diagnostics.mjs";

const reply = (wait = 16) => ({ command: 0, value: 1, startedAt: 100, sentAt: 112,
  receivedAt: 112 + wait, outRetried: false });

test("version diagnostic captures intervals without an actuation command", async t => {
  let now = 100;
  t.mock.method(performance, "now", () => now);
  const sent = [];
  const device = {
    opened: true,
    async transferOut(_endpoint, packet) {
      sent.push([...packet]); now += 12; return { status: "ok" };
    },
    async transferIn() {
      now += 16;
      const data = new DataView(new ArrayBuffer(64)); data.setUint32(2, 42, true);
      return { status: "ok", data };
    }
  };
  const session = new Rev3Session(device, { outEndpoint: 1, inEndpoint: 1 });
  const callbacks = [];
  const result = await runVersionDiagnostics(session, {
    count: 3, warmup: 2, interval: 0, onRecord: row => callbacks.push(row)
  });
  assert.equal(sent.length, 5);
  for (const packet of sent) assert.deepEqual(packet, Array(64).fill(0));
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map(r => r.index), [1, 2, 3]);
  assert.deepEqual(callbacks, result.records);
  for (const r of result.records) {
    assert.equal(r.protocolVersion, 42);
    assert.equal(r.outDuration, 12); assert.equal(r.replyWait, 16); assert.equal(r.totalTime, 28);
  }
});

test("diagnostic validates settings before any request", async () => {
  const session = { version() { assert.fail("must not request USB"); } };
  for (const options of [{ count: 0 }, { count: 101 }, { warmup: -1 }, { interval: 101 }, { count: 1.5 }]) {
    await assert.rejects(runVersionDiagnostics(session, options), RangeError);
  }
});

test("stopping before or during a request never submits the next one", async () => {
  const controller = new AbortController(); let calls = 0, finished = false;
  const session = { async version() { calls++; controller.abort(); finished = true; return reply(); } };
  const result = await runVersionDiagnostics(session, { count: 50, warmup: 0, interval: 0, signal: controller.signal });
  assert.equal(finished, true); assert.equal(calls, 1);
  assert.equal(result.aborted, true); assert.deepEqual(result.records, []);
  await runVersionDiagnostics(session, { signal: controller.signal });
  assert.equal(calls, 1);
});

test("stopping after a stored sample preserves partial results", async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await runVersionDiagnostics({ async version() { calls++; return reply(); } }, {
    count: 50, warmup: 0, interval: 0, signal: controller.signal, onRecord: () => controller.abort()
  });
  assert.equal(calls, 1); assert.equal(result.aborted, true); assert.equal(result.records.length, 1);
});

test("a failed exchange stops the run and preserves the error after successful samples", async () => {
  let calls = 0;
  const result = await runVersionDiagnostics({ async version() {
    if (++calls === 3) throw new Error('bad,"reply"\nline'); return reply();
  } }, { count: 5, warmup: 0, interval: 0 });
  assert.equal(calls, 3); assert.equal(result.records.length, 3);
  assert.equal(versionStats(result.records).count, 2);
  assert.equal(versionStats(result.records).failed, 1);
  assert.match(versionCsv(result.records), /"bad,""reply""\nline"/);
});

test("warmup failure is visible and never counted as a measurement", async () => {
  const result = await runVersionDiagnostics({ async version() { throw new Error("disconnected"); } });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].phase, "warmup"); assert.equal(result.records[0].index, 0);
  assert.equal(versionStats(result.records).count, 0);
  assert.equal(versionStats(result.records).reply, null);
});

test("retries are retained but excluded from summary statistics", () => {
  const rows = [versionTiming(reply(10), 1), versionTiming(reply(20), 2),
    versionTiming({ ...reply(100), outRetried: true }, 3)];
  const s = versionStats(rows);
  assert.equal(s.count, 2); assert.equal(s.retried, 1); assert.equal(s.reply.avg, 15); assert.equal(s.reply.median, 15);
  assert.equal(s.reply.min, 10); assert.equal(s.reply.max, 20);
  const lines = versionCsv(rows).trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.match(lines[3], /100\.000,112\.000,true,/);
});

test("invalid response commands and reversed or missing timestamps do not become successful timings", () => {
  for (const change of [{ command: 2 }, { startedAt: 113 }, { sentAt: 129 }, { receivedAt: NaN }]) {
    assert.throws(() => versionTiming({ ...reply(), ...change }, 1));
  }
});

test("diagnostic CSV is separate, reconstructable and preserves partial records", () => {
  const record = versionTiming(reply(), 1);
  const [header, line] = versionCsv([record]).trim().split(/\r?\n/);
  const keys = header.replace(/^\uFEFF/, "").split(",");
  const cells = line.split(","); assert.equal(cells.length, keys.length);
  const row = Object.fromEntries(keys.map((key, i) => [key, cells[i]]));
  assert.equal(Number(row.command_id), 0); assert.equal(row.status, "ok");
  assert.equal(Number(row.in_end_at_ms) - Number(row.out_end_at_ms), Number(row.reply_wait_ms));
  assert.equal(Number(row.out_end_at_ms) - Number(row.out_start_at_ms), Number(row.out_duration_ms));
  assert.equal(Number(row.in_end_at_ms) - Number(row.out_start_at_ms), Number(row.total_ms));
});
