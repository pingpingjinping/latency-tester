const TYPES = ["control", "isochronous", "bulk", "interrupt"];
const hex = bytes => [...bytes].map(v => v.toString(16).padStart(2, "0")).join(" ");

function bytesOf(data) {
  if (!(data instanceof DataView)) throw new Error("USB 설명자 응답 데이터가 없습니다.");
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function configHeader(bytes) {
  if (bytes.length < 9 || bytes[0] < 9 || bytes[1] !== 2) throw new Error("USB 구성 설명자 헤더 오류");
  const totalLength = bytes[2] | bytes[3] << 8;
  if (totalLength < bytes[0]) throw new Error("USB 구성 설명자 길이 오류");
  return { totalLength, configurationValue: bytes[5] };
}

export function parseConfigurationDescriptor(data) {
  const bytes = bytesOf(data), header = configHeader(bytes);
  if (bytes.length !== header.totalLength) throw new Error("USB 구성 설명자가 잘렸거나 길이가 다릅니다.");
  const interfaces = [];
  let current;
  for (let offset = 0; offset < bytes.length;) {
    const length = bytes[offset], type = bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("USB 설명자 항목 길이 오류");
    if (type === 4) {
      if (length < 9) throw new Error("USB 인터페이스 설명자 길이 오류");
      current = {
        interfaceNumber: bytes[offset + 2], alternateSetting: bytes[offset + 3],
        declaredEndpointCount: bytes[offset + 4], interfaceClass: bytes[offset + 5],
        interfaceSubclass: bytes[offset + 6], interfaceProtocol: bytes[offset + 7], endpoints: []
      };
      if (interfaces.some(i => i.interfaceNumber === current.interfaceNumber && i.alternateSetting === current.alternateSetting)) {
        throw new Error("중복 USB 인터페이스 설명자");
      }
      interfaces.push(current);
    } else if (type === 5) {
      if (length < 7 || !current) throw new Error("USB 엔드포인트 설명자 오류");
      const address = bytes[offset + 2], attributes = bytes[offset + 3];
      if (!(address & 15) || address & 0x70 || current.endpoints.some(e => e.address === address)) {
        throw new Error("USB 엔드포인트 주소 오류");
      }
      const wMaxPacketSize = bytes[offset + 4] | bytes[offset + 5] << 8;
      current.endpoints.push({
        address, endpointNumber: address & 15, direction: address & 128 ? "in" : "out",
        transferType: TYPES[attributes & 3], attributes, wMaxPacketSize,
        maxPacketSize: wMaxPacketSize & 2047, bInterval: bytes[offset + 6]
      });
    }
    offset += length;
  }
  for (const iface of interfaces) {
    if (iface.endpoints.length !== iface.declaredEndpointCount) throw new Error("USB 엔드포인트 개수 불일치");
  }
  return { ...header, interfaces };
}

async function getConfig(session, index, length) {
  let timer, timedOut = false;
  try {
    const reply = await Promise.race([
      session.device.controlTransferIn({
        requestType: "standard", recipient: "device", request: 6,
        value: 0x0200 | index, index: 0
      }, length),
      new Promise((_, reject) => { timer = setTimeout(() => {
        timedOut = true; reject(new Error("USB 설명자 읽기 시간 초과 · 재연결이 필요합니다."));
      }, 2500); })
    ]);
    if (reply.status !== "ok") throw new Error("USB 설명자 읽기 실패: " + reply.status);
    return reply.data;
  } catch (error) {
    if (timedOut) {
      // A control transfer cannot be individually cancelled with AbortSignal.
      session.closed = true;
      try { await Promise.race([session.device.close(), new Promise(resolve => setTimeout(resolve, 700))]); } catch {}
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export async function readRev3Descriptors(session) {
  const report = {
    schema: "rakka-rev3-usb-descriptors-v1", status: "reading",
    vendorId: session.device.vendorId, productId: session.device.productId,
    configurationValue: session.info.configValue, negotiatedSpeed: "unknown",
    note: "bInterval 원본값입니다. 실제 주기는 연결 속도와 호스트에 따라 달라집니다.",
    reads: []
  };
  try {
    if (!session.opened) throw new Error("Rev3 연결이 해제됐습니다.");
    const count = session.device.configurations.length;
    if (!Number.isInteger(count) || count < 1 || count > 255) throw new Error("USB 구성 목록 오류");
    for (let index = 0; index < count; index++) {
      const data = await getConfig(session, index, 9);
      const headerBytes = bytesOf(data);
      report.reads.push({ descriptorIndex: index, requestedLength: 9, hex: hex(headerBytes) });
      const header = configHeader(headerBytes);
      if (header.configurationValue !== session.info.configValue) continue;
      const full = await getConfig(session, index, header.totalLength);
      report.reads.push({ descriptorIndex: index, requestedLength: header.totalLength, hex: hex(bytesOf(full)) });
      const parsed = parseConfigurationDescriptor(full);
      if (parsed.configurationValue !== header.configurationValue || parsed.totalLength !== header.totalLength) {
        throw new Error("USB 구성 설명자 응답 불일치");
      }
      report.configuration = parsed;
      report.selectedInterface = parsed.interfaces.find(i =>
        i.interfaceNumber === session.info.interfaceNumber && i.alternateSetting === session.info.alternateSetting);
      if (!report.selectedInterface) throw new Error("사용 중인 Rev3 인터페이스 설명자를 찾지 못했습니다.");
      for (const [direction, number] of [["in", session.info.inEndpoint], ["out", session.info.outEndpoint]]) {
        if (!report.selectedInterface.endpoints.some(e => e.direction === direction && e.endpointNumber === number && e.transferType === "interrupt")) {
          throw new Error("사용 중인 Rev3 엔드포인트 설명자 불일치");
        }
      }
      report.status = "ok";
      return report;
    }
    throw new Error("사용 중인 USB 구성 설명자를 찾지 못했습니다.");
  } catch (error) {
    report.status = "failed";
    report.error = error.message || String(error);
    return report;
  }
}
