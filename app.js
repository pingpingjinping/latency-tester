import { IDS, validateSettings, rev1Packet, calculate, stats, csv } from "./protocol.mjs";
import { keyboardRows, normalizeKeyboardTarget } from "./keyboard.mjs";

const get = id => document.getElementById(id);
const state = { rev1: null, running: false, abort: null, records: [] };
const fmt = value => Number.isFinite(value) ? value.toFixed(2) + " ms" : "—";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function env() {
  if (!window.isSecureContext) {
    get("environment").textContent = "보안 컨텍스트가 아닙니다. localhost 주소로 실행해 주세요.";
  } else {
    get("environment").textContent = "Rev1 WebHID: " + (navigator.hid ? "지원" : "미지원") +
      " · PTG Studio: 별도 백업 페이지 · Rev1 인터넷 통신 없음";
  }
  get("connect1").disabled = state.running || !navigator.hid || !window.isSecureContext;
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
  syncType();
  env();
}

function selectKeyboardKey(value) {
  if (state.running || document.querySelector('input[name=type]:checked').value !== "keyboard") return;
  const selected = normalizeKeyboardTarget(value);
  if (!selected) return;
  get("target").value = selected;
  get("target-selected").textContent = selected.toUpperCase();
  get("keyboard-selection").textContent = selected.toUpperCase();
  get("keyboard-layout").querySelectorAll(".keyboard-key[data-key]").forEach(button => {
    const active = button.dataset.key === selected;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (get("keyboard-dialog").open) get("keyboard-dialog").close();
}

function buildKeyboard() {
  const root = get("keyboard-layout");
  const fragment = document.createDocumentFragment();
  for (const keys of keyboardRows) {
    const row = document.createElement("div");
    row.className = "keyboard-row";
    for (const key of keys) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "keyboard-key";
      button.style.setProperty("--key-units", String(key.units));
      button.textContent = key.label;
      if (key.key === null) {
        button.classList.add("is-disabled");
        button.disabled = true;
        button.title = "선택할 수 없는 키";
      } else {
        button.dataset.key = key.key.toLowerCase();
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => selectKeyboardKey(key.key));
      }
      row.append(button);
    }
    fragment.append(row);
  }
  root.append(fragment);
  selectKeyboardKey(get("target").value);
}

function syncType() {
  const isMouse = document.querySelector('input[name=type]:checked').value === "mouse";
  get("target-picker").disabled = state.running || isMouse;
  if ((state.running || isMouse) && get("keyboard-dialog").open) get("keyboard-dialog").close();
  get("keyboard-layout").querySelectorAll(".keyboard-key[data-key]").forEach(button => {
    button.disabled = state.running || isMouse;
  });
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

get("connect1").addEventListener("click", async () => {
  try { await connectRev1(); } catch (e) { get("status1").textContent = e.message || String(e); }
});
get("form").addEventListener("submit", run);
get("target-picker").addEventListener("click", () => {
  if (state.running || document.querySelector('input[name=type]:checked').value !== "keyboard") return;
  if (!get("keyboard-dialog").open) get("keyboard-dialog").showModal();
});
get("keyboard-close").addEventListener("click", () => get("keyboard-dialog").close());
get("keyboard-dialog").addEventListener("click", event => {
  if (event.target === get("keyboard-dialog")) get("keyboard-dialog").close();
});
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
buildKeyboard();
syncType();
env();
render();
