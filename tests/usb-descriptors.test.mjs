import test from "node:test";
import assert from "node:assert/strict";
import { parseConfigurationDescriptor, readRev3Descriptors } from "../usb-descriptors.mjs";

function config({ value = 1, iface = 0, alt = 0, intervalIn = 8, intervalOut = 16 } = {}) {
  return new Uint8Array([
    9, 2, 32, 0, 1, value, 0, 0x80, 50,
    9, 4, iface, alt, 2, 255, 76, 84, 0,
    7, 5, 0x81, 3, 64, 0, intervalIn,
    7, 5, 1, 3, 64, 0, intervalOut
  ]);
}
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
function sessionFor(bytes = config()) {
  const requests = [];
  const device = {
    vendorId: 0x5249, productId: 0x4c65, configurations: [{}],
    async controlTransferIn(setup, length) {
      requests.push({ setup, length });
      return { status: "ok", data: view(bytes.slice(0, length)) };
    },
    get serialNumber() { assert.fail("must not read a serial number"); }
  };
  return {
    opened: true, device, requests,
    info: { configValue: 1, interfaceNumber: 0, alternateSetting: 0, inEndpoint: 1, outEndpoint: 1 }
  };
}

test("configuration parsing preserves endpoint direction, raw interval and packet fields", () => {
  const bytes = config(); bytes[23] = 8; // wMaxPacketSize high byte (high-speed transaction bits).
  const { interfaces } = parseConfigurationDescriptor(view(bytes));
  const [input, output] = interfaces[0].endpoints;
  assert.equal(input.direction, "in"); assert.equal(input.address, 0x81);
  assert.equal(input.bInterval, 8); assert.equal(output.bInterval, 16);
  assert.equal(input.transferType, "interrupt"); assert.equal(input.maxPacketSize, 64);
  assert.equal(input.wMaxPacketSize, 0x0840);
});

test("descriptor parser respects DataView offsets", () => {
  const buffer = new Uint8Array(40).fill(0xff); buffer.set(config(), 4);
  const parsed = parseConfigurationDescriptor(new DataView(buffer.buffer, 4, 32));
  assert.equal(parsed.configurationValue, 1);
  assert.equal(parsed.interfaces[0].endpoints[1].direction, "out");
});

test("only configuration GET_DESCRIPTOR reads are sent, with no actuation or configuration writes", async () => {
  const session = sessionFor();
  const report = await readRev3Descriptors(session);
  assert.equal(report.status, "ok"); assert.equal(report.negotiatedSpeed, "unknown");
  assert.equal(report.selectedInterface.endpoints[0].bInterval, 8);
  assert.equal(report.reads.length, 2);
  assert.deepEqual(session.requests, [9, 32].map(length => ({ length, setup: {
    requestType: "standard", recipient: "device", request: 6, value: 0x0200, index: 0
  } })));
  assert.equal(Object.hasOwn(report, "serialNumber"), false);
  assert.equal(JSON.parse(JSON.stringify(report)).status, "ok");
});

test("active configuration is found by its value, not by assuming the first index", async () => {
  const session = sessionFor(); session.device.configurations = [{}, {}];
  session.info = { ...session.info, configValue: 7, interfaceNumber: 2, alternateSetting: 1 };
  const requests = [];
  session.device.controlTransferIn = async (setup, length) => {
    requests.push([setup.value, length]);
    const bytes = setup.value === 0x0201 ? config({ value: 7, iface: 2, alt: 1 }) : config();
    return { status: "ok", data: view(bytes.slice(0, length)) };
  };
  const report = await readRev3Descriptors(session);
  assert.equal(report.status, "ok"); assert.equal(report.configurationValue, 7);
  assert.equal(report.selectedInterface.interfaceNumber, 2);
  assert.equal(report.selectedInterface.alternateSetting, 1);
  assert.deepEqual(requests, [[0x0200, 9], [0x0201, 9], [0x0201, 32]]);
});

test("malformed lengths, orphan endpoints, duplicate addresses and endpoint counts are rejected", () => {
  const badLength = config(); badLength[18] = 0;
  const short = config().slice(0, 31);
  const badCount = config(); badCount[13] = 3;
  const duplicate = config(); duplicate[27] = 0x81;
  const reserved = config(); reserved[20] = 0xf1;
  const orphan = new Uint8Array([...config().slice(0, 9), ...config().slice(18)]); orphan[2] = orphan.length;
  for (const bytes of [badLength, short, badCount, duplicate, reserved, orphan]) {
    assert.throws(() => parseConfigurationDescriptor(view(bytes)));
  }
});

test("unsupported reads and bad data return a downloadable failed report", async () => {
  const session = sessionFor();
  session.device.controlTransferIn = async () => ({ status: "stall" });
  let report = await readRev3Descriptors(session);
  assert.equal(report.status, "failed"); assert.match(report.error, /stall/);
  const malformed = sessionFor(config().slice(0, 31));
  report = await readRev3Descriptors(malformed);
  assert.equal(report.status, "failed"); assert.equal(report.reads.length, 2);
  assert.ok(report.reads[1].hex.length > 0);
});

test("a descriptor whose selected endpoint disagrees with the connected session is not accepted", async () => {
  const session = sessionFor(); session.info.inEndpoint = 2;
  const report = await readRev3Descriptors(session);
  assert.equal(report.status, "failed"); assert.match(report.error, /불일치/);
});

test("a timed-out control read closes the session and does not queue another request", async t => {
  const timers = []; let requests = 0, closed = false;
  t.mock.method(globalThis, "setTimeout", fn => { timers.push(fn); return 0; });
  const session = sessionFor();
  session.device.controlTransferIn = async () => { requests++; return new Promise(() => {}); };
  session.device.close = async () => { closed = true; };
  const pending = readRev3Descriptors(session);
  assert.equal(timers.length, 1); timers[0]();
  const report = await pending;
  assert.equal(report.status, "failed"); assert.match(report.error, /시간 초과/);
  assert.equal(session.closed, true); assert.equal(closed, true); assert.equal(requests, 1);
});
