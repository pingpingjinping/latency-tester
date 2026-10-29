import test from "node:test";
import assert from "node:assert/strict";
import {
  REV3, REV3_COMMANDS, rev3Packet, parseRev3Response, Rev3Session
} from "../rev3-protocol.mjs";

function response(command, value = 0, resultCode = 0) {
  const buffer = new ArrayBuffer(64);
  const view = new DataView(buffer);
  view.setUint8(0, command);
  view.setUint8(1, resultCode);
  view.setUint32(2, value, true);
  return view;
}

test("Rev3 connection uses observed vendor interface and 64-byte report", () => {
  assert.equal(REV3.vendorId, 0x5249);
  assert.equal(REV3.productId, 0x4c65);
  assert.equal(REV3.interfaceClass, 255);
  assert.equal(REV3.interfaceSubclass, 76);
  assert.equal(REV3.interfaceProtocol, 84);
  assert.equal(REV3.packetSize, 64);
});
test("Rev3 measurement packet places contact command at 0 and little-endian hold at 2", () => {
  const packet = rev3Packet(REV3_COMMANDS.CONTACT_ONCE, 20);
  assert.equal(packet.byteLength, 64);
  assert.deepEqual([...packet.slice(0, 10)], [2, 0, 20, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...rev3Packet(REV3_COMMANDS.CONTACT_ONCE, 200).slice(0, 6)], [2, 0, 200, 0, 0, 0]);
  assert.deepEqual([...rev3Packet(REV3_COMMANDS.VERSION).slice(0, 8)], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.throws(() => rev3Packet(REV3_COMMANDS.CONTACT_ONCE, 0), RangeError);
  assert.throws(() => rev3Packet(3, 20), RangeError);
  assert.throws(() => rev3Packet(REV3_COMMANDS.SERIAL), RangeError);
});
test("Rev3 reply verifies command and resultCode before data", () => {
  assert.deepEqual(parseRev3Response(response(0, 42), 0), { command: 0, resultCode: 0, value: 42 });
  assert.throws(() => parseRev3Response(response(2, 20, 3), 2), /오류: 3/);
  assert.throws(() => parseRev3Response(response(0, 20), 2), /불일치/);
  assert.throws(() => parseRev3Response(new DataView(new ArrayBuffer(2)), 0), /짧습니다/);
});
test("Rev3 WebUSB records pre-OUT, post-OUT and post-IN timestamps", async t => {
  let now = 100;
  t.mock.method(performance, "now", () => now);
  const events = [];
  const usb = {
    opened: true,
    async transferOut(endpoint, packet) {
      events.push("OUT");
      assert.equal(endpoint, 1);
      assert.equal(packet.length, 64);
      assert.equal(packet[0], 2);
      assert.equal(new DataView(packet.buffer).getUint32(2, true), 20);
      now = 104;
      return { status: "ok" };
    },
    async transferIn(endpoint, size) {
      events.push("IN");
      assert.equal(endpoint, 1);
      assert.equal(size, 64);
      now = 120;
      return { status: "ok", data: response(2, 20) };
    }
  };
  const session = new Rev3Session(usb, { inEndpoint: 1, outEndpoint: 1 });
  const result = await session.contactOnce(20);
  assert.deepEqual(events, ["OUT", "IN"]);
  assert.equal(result.value, 20);
  assert.equal(result.startedAt, 100);
  assert.equal(result.sentAt, 104);
  assert.equal(result.receivedAt, 120);
  assert.equal(result.outRetried, false);
});

test("Rev3 OUT stall recovery is flagged without changing the measurement packet", async t => {
  let now = 100, attempt = 0;
  t.mock.method(performance, "now", () => now);
  const events = [];
  const usb = {
    opened: true,
    async transferOut(_endpoint, packet) {
      events.push("OUT");
      assert.deepEqual([...packet.slice(0, 6)], [2, 0, 20, 0, 0, 0]);
      now += 4;
      return { status: ++attempt === 1 ? "stall" : "ok" };
    },
    async clearHalt(direction, endpoint) {
      assert.equal(direction, "out");
      assert.equal(endpoint, 1);
      events.push("clear");
      now += 20;
    },
    async transferIn() { events.push("IN"); now += 16; return { status: "ok", data: response(2, 20) }; }
  };
  const result = await new Rev3Session(usb, { inEndpoint: 1, outEndpoint: 1 }).contactOnce(20);
  assert.deepEqual(events, ["OUT", "clear", "OUT", "IN"]);
  assert.equal(result.outRetried, true);
  assert.equal(result.startedAt, 100);
  assert.equal(result.sentAt, 128);
  assert.equal(result.receivedAt, 144);
});
test("Rev3 getVersion uses command 0 and decodes little-endian version", async () => {
  const usb = {
    opened: true,
    async transferOut(_endpoint, packet) {
      assert.equal(packet[0], 0);
      return { status: "ok" };
    },
    async transferIn() { return { status: "ok", data: response(0, 0x01020304) }; }
  };
  const session = new Rev3Session(usb, { inEndpoint: 1, outEndpoint: 1 });
  assert.equal((await session.version()).value, 0x01020304);
});
