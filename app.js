import { IDS, validateSettings, rev1Packet, calculate, stats, csv } from "./protocol.mjs";

const get = id => document.getElementById(id);
const state = { rev1: null, running: false, abort: null, records: [] };
const fmt = value => Number.isFinite(value) ? value.toFixed(2) + " ms" : "—";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function env() {
  if (!window.isSecureContext) {
    get("environment").textContent = "보안 컨텍스트가 아닙니다. localhost 주소로 실행해 주세요.";
  } else {
    get("environment").textContent = "Rev1 WebHID: " + (navigator.hid ? "지원" : "미지원") +
      " · Rev3 WebUSB: " + (navigator.usb ? "지원" : "미지원") +
      " · 인터넷 통신 없음";
  }
  get("connect1").disabled = state.running || !navigator.hid || !window.isSecureContext;
  get("probe3").disabled = state.running || !navigator.usb || !window.isSecureContext;
}

async function connectRev1() {
  if (!navigator.hid) throw new Error("WebHID가 지원되지 않습니다. Chrome/Edge를 사용하세요.");
  const devices = await navigator.hid.getDevices();
  let device = devices.find(d => d.vendorId === IDS.rev1.vendorId && d.productId === IDS.rev1.productId);
  if (!device) {
    const selected = await navigator.hid.requestDevice({ filters: [IDS.rev1] });
    device = selected[0];
  }
  if (!device) throw new Error("장치를 선택하지 않았습니다.");
  if (!device.opened) await device.open();
  state.rev1 = device;
  get("status1").textContent = "연결 완료 · " + (device.productName || "RAKKA Rev1");
  return device;
}

function collectInput(settings, signal) {
  let downAt, upAt;
  let resolveEvent, rejectEvent;
  const result = new Promise((resolve, reject) => {
    resolveEvent = resolve;
    rejectEvent = reject;
  });
  // Attach a handler immediately to avoid an unhandled rejection during USB transfer.
  result.catch(() => {});
  const isKeyboard = settings.type === "keyboard";
  const downType = isKeyboard ? "keydown" : "mousedown";
  const upType = isKeyboard ? "keyup" : "mouseup";
  const matches = e => isKeyboard
    ? typeof e.key === "string" && e.key.toLowerCase() === settings.target
    : e.button === 0;
  const onDown = e => {
    if (matches(e) && !e.repeat && downAt === undefined) downAt = performance.now();
  };
  const onUp = e => {
    if (matches(e) && downAt !== undefined && upAt === undefined) {
      upAt = performance.now();
      resolveEvent();
    }
  };
  const onAbort = () => rejectEvent(new DOMException("중단됨", "AbortError"));
  document.addEventListener(downType, onDown, true);
  document.addEventListener(upType, onUp, true);
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => rejectEvent(new Error("입력 이벤트 시간 초과")), settings.hold + 1000);
  return {
    result,
    times: () => ({ downAt, upAt }),
    cleanup() {
      clearTimeout(timer);
      document.removeEventListener(downType, onDown, true);
      document.removeEventListener(upType, onUp, true);
      signal.removeEventListener("abort", onAbort);
    }
  };
}

async function measureOnce(device, settings, signal) {
  if (signal.aborted) throw new DOMException("중단됨", "AbortError");
  const input = collectInput(settings, signal);
  try {
    // Rev1 feature report only; byte 1 is always ZERO (never enter DFU mode).
    await device.sendFeatureReport(0, rev1Packet(settings.hold));
    const sentAt = performance.now();
    await input.result;
    if (signal.aborted) throw new DOMException("중단됨", "AbortError");
    // Mirror the original read, but do not confuse it with a latency reading.
    await device.receiveFeatureReport(0);
    const t = input.times();
    return calculate(sentAt, t.downAt, t.upAt, settings.hold);
  } finally {
    input.cleanup();
  }
}

function render() {
  const rows = get("rows");
  rows.replaceChildren();
  const graph = get("graph");
  graph.replaceChildren();
  const d = stats(state.records.map(r => r.down));
  const u = stats(state.records.map(r => r.up));
  get("down-average").textContent = d ? fmt(d.avg) : "—";
  get("up-average").textContent = u ? fmt(u.avg) : "—";
  get("down-detail").textContent = d ? "최소 " + fmt(d.min) + " · P95 " + fmt(d.p95) + " · 최대 " + fmt(d.max) : "키 누름 지연";
  get("up-detail").textContent = u ? "최소 " + fmt(u.min) + " · P95 " + fmt(u.p95) + " · 최대 " + fmt(u.max) : "키 뗌 지연";
  get("download").disabled = state.records.length === 0;
  if (!state.records.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 4;
    cell.textContent = "아직 결과가 없습니다.";
    return;
  }
  const values = state.records.flatMap(row => [row.down, row.up])
    .filter(v => Number.isFinite(v) && v >= 0);
  const maximum = Math.max(1, ...values);
  for (const row of state.records) {
    const tr = rows.insertRow();
    for (const value of [row.index, fmt(row.down), fmt(row.up), row.error ? "실패: " + row.error : "성공"]) {
      tr.insertCell().textContent = String(value);
    }
    const plot = document.createElement("div");
    plot.className = "plot";
    plot.title = row.index + "회 · " + fmt(row.down) + " / " + fmt(row.up);
    for (const [kind, value] of [["down", row.down], ["up", row.up]]) {
      const bar = document.createElement("div");
      bar.className = "bar " + kind;
      bar.style.height = (Number.isFinite(value) ? Math.max(0, Math.min(100, value / maximum * 100)) : 0) + "%";
      plot.append(bar);
    }
    graph.append(plot);
  }
}

function setRunning(yes) {
  state.running = yes;
  get("start").disabled = yes;
  get("stop").hidden = !yes;
  for (const input of get("form").querySelectorAll("input")) input.disabled = yes;
  if (!yes) syncType();
  env();
}

function syncType() {
  get("target").disabled = state.running || document.querySelector("input[name=type]:checked").value === "mouse";
}

async function run(event) {
  event.preventDefault();
  if (state.running) return;
  let settings, device;
  try {
    settings = validateSettings({
      type: document.querySelector("input[name=type]:checked").value,
      target: get("target").value,
      hold: get("hold").value,
      interval: get("interval").value,
      count: get("count").value,
      warmup: get("warmup").value
    });
    device = state.rev1?.opened ? state.rev1 : await connectRev1();
    if (/66b7/i.test(device.productName || "") && settings.hold > 20) {
      throw new Error("구형 Rev1 펌웨어는 유지 시간을 20ms 이하로 설정해야 합니다.");
    }
  } catch (e) {
    get("progress").textContent = e.message || String(e);
    return;
  }
  state.records = [];
  render();
  const controller = new AbortController();
  state.abort = controller;
  setRunning(true);
  let count = 0;
  try {
    const total = settings.warmup + settings.count;
    for (let i = 0; i < total && !controller.signal.aborted; i++) {
      const warmup = i < settings.warmup;
      get("progress").textContent = warmup
        ? "예열 " + (i + 1) + "/" + settings.warmup
        : "측정 " + (count + 1) + "/" + settings.count;
      try {
        const result = await measureOnce(device, settings, controller.signal);
        if (!warmup) {
          count++;
          state.records.push({ index: count, ...result, error: null });
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        if (!warmup) {
          count++;
          state.records.push({ index: count, down: NaN, up: NaN, error: e.message || "오류" });
        }
      }
      if (!warmup) render();
      if (!controller.signal.aborted && i < total - 1) await sleep(settings.interval);
    }
    get("progress").textContent = (controller.signal.aborted ? "측정 중단 · " : "측정 완료 · ") + count + "회";
  } finally {
    state.abort = null;
    setRunning(false);
  }
}

async function probeRev3() {
  if (!navigator.usb) return;
  get("probe3").disabled = true;
  let device;
  let claimed = false;
  try {
    const authorized = await navigator.usb.getDevices();
    device = authorized.find(d => d.vendorId === IDS.rev3.vendorId && d.productId === IDS.rev3.productId);
    if (!device) device = await navigator.usb.requestDevice({ filters: [IDS.rev3] });
    if (!device) throw new Error("장치를 선택하지 않았습니다.");
    await device.open();
    if (!device.configuration) throw new Error("활성 USB 구성이 없습니다.");
    await device.claimInterface(0);
    claimed = true;
    const iface = device.configuration.interfaces.find(i => i.interfaceNumber === 0);
    const alternate = iface?.alternate;
    const endpoints = alternate?.endpoints.map(e => e.direction + " EP" + e.endpointNumber +
      " (" + e.type + ", " + e.packetSize + "B)").join(", ");
    get("status3").textContent = "연결 진단 성공 · Interface 0 · " +
      (endpoints || "엔드포인트 정보 없음") + " · 측정 명령 미구현";
  } catch (e) {
    get("status3").textContent = "진단 실패: " + (e.message || String(e));
  } finally {
    if (claimed) { try { await device.releaseInterface(0); } catch {} }
    if (device?.opened) { try { await device.close(); } catch {} }
    env();
  }
}

get("connect1").addEventListener("click", async () => {
  try { await connectRev1(); } catch (e) { get("status1").textContent = e.message || String(e); }
});
get("probe3").addEventListener("click", probeRev3);
get("form").addEventListener("submit", run);
get("stop").addEventListener("click", () => state.abort?.abort());
document.querySelectorAll("input[name=type]").forEach(radio => radio.addEventListener("change", syncType));
get("download").addEventListener("click", () => {
  if (!state.records.length) return;
  const blob = new Blob([csv(state.records)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "rakka-rev1-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
navigator.hid?.addEventListener("disconnect", event => {
  if (event.device === state.rev1) {
    state.abort?.abort();
    state.rev1 = null;
    get("status1").textContent = "Rev1 연결 해제됨";
  }
});
syncType();
env();
render();
