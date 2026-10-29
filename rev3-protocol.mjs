// Independent implementation derived from the documented behavior observed in
// the user-provided RAKKA Rev3 website bundle, 2023-10-01.
// No original vendor source code is redistributed.
export const REV3 = Object.freeze({
  vendorId: 0x5249,
  productId: 0x4c65,
  interfaceClass: 255,
  interfaceSubclass: 76,
  interfaceProtocol: 84,
  packetSize: 64
});

export const REV3_COMMANDS = Object.freeze({
  VERSION: 0,
  SERIAL: 1,
  CONTACT_ONCE: 2
});

export function rev3Packet(command, holdTime = 0) {
  if (![REV3_COMMANDS.VERSION, REV3_COMMANDS.CONTACT_ONCE].includes(command)) {
    throw new RangeError("허용되지 않은 Rev3 명령");
  }
  if (command === REV3_COMMANDS.CONTACT_ONCE &&
    (!Number.isInteger(holdTime) || holdTime < 1 || holdTime > 200)) {
    throw new RangeError("Rev3 유지 시간은 1~200ms 정수여야 합니다.");
  }
  const bytes = new Uint8Array(REV3.packetSize);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, command);
  if (command === REV3_COMMANDS.CONTACT_ONCE) {
    view.setUint32(2, holdTime, true);
  }
  return bytes;
}

export function parseRev3Response(data, expectedCommand) {
  if (!(data instanceof DataView) || data.byteLength < 6) {
    throw new Error("Rev3 응답이 너무 짧습니다.");
  }
  const command = data.getUint8(0);
  const resultCode = data.getUint8(1);
  if (command !== expectedCommand) {
    throw new Error("Rev3 응답 명령 불일치: " + command + " (기대: " + expectedCommand + ")");
  }
  if (resultCode !== 0) throw new Error("Rev3 장치 오류: " + resultCode);
  return { command, resultCode, value: data.getUint32(2, true) };
}

function findInterface(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass !== REV3.interfaceClass ||
          alt.interfaceSubclass !== REV3.interfaceSubclass ||
          alt.interfaceProtocol !== REV3.interfaceProtocol) continue;
        const epIn = alt.endpoints.find(e => e.direction === "in" && e.type === "interrupt");
        const epOut = alt.endpoints.find(e => e.direction === "out" && e.type === "interrupt");
        if (!epIn || !epOut || epIn.packetSize < REV3.packetSize) continue;
        return {
          configValue: config.configurationValue,
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alt.alternateSetting,
          inEndpoint: epIn.endpointNumber,
          outEndpoint: epOut.endpointNumber
        };
      }
    }
  }
  throw new Error("Rev3 전용 USB 인터페이스를 찾지 못했습니다.");
}

export class Rev3Session {
  constructor(device, info) {
    this.device = device;
    this.info = info;
    this.closed = false;
  }
  get opened() {
    return !this.closed && this.device.opened;
  }
  async exchange(bytes, expectedCommand) {
    if (!this.opened) throw new Error("Rev3 연결이 해제됐습니다.");
    if (!(bytes instanceof Uint8Array) || bytes.length !== REV3.packetSize) {
      throw new Error("Rev3 패킷 크기가 잘못됐습니다.");
    }
    const startedAt = performance.now();
    let outRetried = false;
    let output = await this.device.transferOut(this.info.outEndpoint, bytes);
    if (output.status === "stall") {
      outRetried = true;
      await this.device.clearHalt("out", this.info.outEndpoint);
      output = await this.device.transferOut(this.info.outEndpoint, bytes);
    }
    if (output.status !== "ok") throw new Error("Rev3 전송 실패: " + output.status);

    const sentAt = performance.now();
    let timer;
    try {
      const response = await Promise.race([
        this.device.transferIn(this.info.inEndpoint, REV3.packetSize),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Rev3 응답 시간 초과 (2.5초)")), 2500);
        })
      ]);
      if (response.status !== "ok") throw new Error("Rev3 수신 실패: " + response.status);
      const receivedAt = performance.now();
      return { ...parseRev3Response(response.data, expectedCommand), startedAt, sentAt, receivedAt, outRetried };
    } catch (error) {
      // A timed-out WebUSB transferIn cannot be cancelled by AbortSignal.
      // Close the device to attempt cancellation and require reconnect.
      this.closed = true;
      try { await Promise.race([
        this.device.close(),
        new Promise(resolve => setTimeout(resolve, 700))
      ]); } catch {}
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  version() {
    return this.exchange(rev3Packet(REV3_COMMANDS.VERSION), REV3_COMMANDS.VERSION);
  }
  // Only the named VERSION/contact methods expose this ordering. Validate the
  // packet before queuing IN; capture each completion in its own callback.
  async #exchangePrearmed(command, holdTime = 0) {
    const packet = rev3Packet(command, holdTime);
    if (!this.opened) throw new Error("Rev3 연결이 해제됐습니다.");
    let timer, inSubmittedAt, startedAt, sentAt, receivedAt;
    try {
      inSubmittedAt = performance.now();
      const incoming = this.device.transferIn(this.info.inEndpoint, REV3.packetSize).then(response => {
        receivedAt = performance.now();
        if (response.status !== "ok") throw new Error("Rev3 수신 실패: " + response.status);
        return parseRev3Response(response.data, command);
      });
      // Handle rejection even if transferOut throws synchronously below.
      incoming.catch(() => {});
      startedAt = performance.now();
      const outgoing = this.device.transferOut(this.info.outEndpoint, packet).then(output => {
        sentAt = performance.now();
        if (output.status !== "ok") throw new Error("Rev3 전송 실패: " + output.status);
      });
      const [, reply] = await Promise.race([
        Promise.all([outgoing, incoming]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Rev3 순서 비교 시간 초과 (2.5초)")), 2500); })
      ]);
      return { ...reply, inSubmittedAt, startedAt, sentAt, receivedAt,
        outRetried: false, transferOrder: "prearmed" };
    } catch (error) {
      // Close on any failure, including failed OUT with an outstanding IN.
      // Do not retry the OUT or leave a read queued for the next measurement.
      this.closed = true;
      try { await Promise.race([this.device.close(), new Promise(resolve => setTimeout(resolve, 700))]); } catch {}
      throw error;
    } finally { clearTimeout(timer); }
  }
  versionPrearmed() {
    return this.#exchangePrearmed(REV3_COMMANDS.VERSION);
  }
  contactOnce(holdTime) {
    return this.exchange(rev3Packet(REV3_COMMANDS.CONTACT_ONCE, holdTime), REV3_COMMANDS.CONTACT_ONCE);
  }
  contactOncePrearmed(holdTime) {
    return this.#exchangePrearmed(REV3_COMMANDS.CONTACT_ONCE, holdTime);
  }
  async close() {
    this.closed = true;
    if (!this.device.opened) return;
    try { await this.device.releaseInterface(this.info.interfaceNumber); } catch {}
    try { await this.device.close(); } catch {}
  }
}

export async function connectRev3() {
  if (!navigator.usb) throw new Error("브라우저가 WebUSB를 지원하지 않습니다.");
  const matches = await navigator.usb.getDevices();
  let device = matches.find(d => d.vendorId === REV3.vendorId && d.productId === REV3.productId);
  if (!device) device = await navigator.usb.requestDevice({
    filters: [{ vendorId: REV3.vendorId, productId: REV3.productId }]
  });
  if (!device) throw new Error("Rev3 선택이 취소됐습니다.");

  let claimed = false;
  let interfaceNumber;
  try {
    if (!device.opened) await device.open();
    const info = findInterface(device);
    interfaceNumber = info.interfaceNumber;
    if (device.configuration?.configurationValue !== info.configValue) {
      await device.selectConfiguration(info.configValue);
    }
    await device.claimInterface(info.interfaceNumber);
    claimed = true;
    if (info.alternateSetting !== 0) {
      await device.selectAlternateInterface(info.interfaceNumber, info.alternateSetting);
    }
    const session = new Rev3Session(device, info);
    const version = await session.version();
    return { session, protocolVersion: version.value };
  } catch (error) {
    if (claimed) { try { await device.releaseInterface(interfaceNumber); } catch {} }
    if (device.opened) { try { await device.close(); } catch {} }
    throw error;
  }
}
