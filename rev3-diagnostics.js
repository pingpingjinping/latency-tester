"use strict";

// Only standard WebUSB open/claim/transferIn/release/close. No transferOut,
// controlTransferOut, reset, firmware update or bootloader commands.
const DEVICE_ID = Object.freeze({ vendorId: 0x5249, productId: 0x4c65 });
const $ = id => document.getElementById(id);
const state = { device: null, busy: false };
const lines = [];
const hex = n => "0x" + n.toString(16).toUpperCase().padStart(2, "0");
const formatBytes = view => Array.from(
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
  hex
).join(" ");

function write(message) {
  lines.push(message);
  $("log").textContent = lines.join("\n");
}
function busy(value) {
  state.busy = value;
  $("identify").disabled = value || !navigator.usb;
  $("receive").disabled = value || !state.device || !navigator.usb;
}
function exceptionText(error) {
  return error instanceof Error ? error.name + ": " + error.message : String(error);
}
function describe(device) {
  write("장치: " + (device.productName || "(제품명 없음)"));
  write("제조사: " + (device.manufacturerName || "(제조사명 없음)"));
  write("VID/PID: " + hex(device.vendorId) + "/" + hex(device.productId));
  write("USB 버전: " + device.usbVersionMajor + "." + device.usbVersionMinor + "." + device.usbVersionSubminor);
  write("장치 버전: " + device.deviceVersionMajor + "." + device.deviceVersionMinor + "." + device.deviceVersionSubminor);
  write("구성 개수: " + device.configurations.length);
  for (const config of device.configurations) {
    write("구성 #" + config.configurationValue + " / " + (config.configurationName || "이름 없음"));
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        write("  Interface " + iface.interfaceNumber +
          " alt " + alt.alternateSetting +
          " class " + hex(alt.interfaceClass) +
          " sub " + hex(alt.interfaceSubclass) +
          " protocol " + hex(alt.interfaceProtocol));
        for (const endpoint of alt.endpoints) {
          write("    " + endpoint.direction.toUpperCase() +
            " EP" + endpoint.endpointNumber +
            " " + endpoint.type +
            " " + endpoint.packetSize + "B");
        }
      }
    }
  }
  write("기기 일련번호는 로그에 포함하지 않습니다.");
}

async function pickDevice() {
  const authorized = await navigator.usb.getDevices();
  return authorized.find(
    d => d.vendorId === DEVICE_ID.vendorId && d.productId === DEVICE_ID.productId
  ) || await navigator.usb.requestDevice({ filters: [DEVICE_ID] });
}

async function identify() {
  if (state.busy || !navigator.usb) return;
  busy(true);
  let device = null;
  try {
    device = await pickDevice();
    if (!device) {
      write("장치 선택이 취소됐습니다.");
      return;
    }
    await device.open();
    state.device = device;
    write("\n=== Rev3 장치 확인 ===");
    describe(device);
    $("status").textContent = "장치 확인 성공 · 선택됨";
  } catch (error) {
    state.device = null;
    write("장치 확인 실패: " + exceptionText(error));
    $("status").textContent = "장치 확인 실패";
  } finally {
    if (device?.opened) {
      try { await device.close(); } catch (error) { write("장치 닫기: " + exceptionText(error)); }
    }
    busy(false);
  }
}

async function receiveOne() {
  if (state.busy || !state.device || !navigator.usb) return;
  busy(true);
  const device = state.device;
  let claimed = false;
  let timedOut = false;
  try {
    await device.open();
    if (!device.configuration) throw new Error("활성 구성 정보가 없습니다.");
    const iface = device.configuration.interfaces.find(i => i.interfaceNumber === 0);
    const inEndpoint = iface?.alternate?.endpoints.find(
      e => e.direction === "in" && e.type === "interrupt" && e.endpointNumber === 1
    );
    if (!inEndpoint) throw new Error("예상한 interrupt IN EP1을 찾지 못했습니다.");
    await device.claimInterface(0);
    claimed = true;
    write("\n=== 수신 1회 (IN EP1) ===");
    write("시작: " + new Date().toISOString());
    const timeout = Symbol("timeout");
    let timer;
    try {
      const packet = device.transferIn(1, Math.min(64, inEndpoint.packetSize));
      const result = await Promise.race([
        packet,
        new Promise(resolve => { timer = setTimeout(() => resolve(timeout), 2500); })
      ]);
      if (result === timeout) {
        timedOut = true;
        write("2.5초 동안 데이터가 도착하지 않았습니다. 이는 프로토콜 오류를 의미하지 않습니다.");
      } else {
        write("수신 상태: " + result.status);
        write("길이: " + (result.data?.byteLength || 0) + "바이트");
        if (result.data) write("HEX: " + formatBytes(result.data));
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    write("수신 시도 오류: " + exceptionText(error));
  } finally {
    // In-flight transferIn cannot be AbortSignal-cancelled. On timeout,
    // request a close first to abort it, without issuing any OUT requests.
    if (timedOut) {
      try {
        await Promise.race([
          device.close(),
          new Promise(resolve => setTimeout(resolve, 1500))
        ]);
      } catch (error) { write("타임아웃 후 장치 닫기: " + exceptionText(error)); }
    } else {
      if (claimed) {
        try { await device.releaseInterface(0); }
        catch (error) { write("인터페이스 해제: " + exceptionText(error)); }
      }
      if (device.opened) {
        try { await device.close(); }
        catch (error) { write("장치 닫기: " + exceptionText(error)); }
      }
    }
    write("수신 진단 종료. OUT 명령은 보내지 않았습니다.");
    busy(false);
  }
}

$("identify").addEventListener("click", identify);
$("receive").addEventListener("click", receiveOne);
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    $("status").textContent = "진단 로그 복사 완료";
  } catch (error) {
    $("status").textContent = "복사 실패: " + exceptionText(error);
  }
});
navigator.usb?.addEventListener("disconnect", event => {
  if (event.device === state.device) {
    state.device = null;
    write("Rev3 USB 연결이 해제됐습니다.");
    $("status").textContent = "기기 연결 해제";
    busy(state.busy);
  }
});
if (!navigator.usb || !window.isSecureContext) {
  $("status").textContent = "Chrome/Edge의 localhost 보안 컨텍스트에서 실행해 주세요.";
  busy(false);
}
