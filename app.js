import { IDS, validateSettings, rev1Packet, calculate, stats } from "./protocol.mjs";
import { keyboardRows, normalizeKeyboardTarget } from "./keyboard.mjs";
import { connectRev3 as openRev3Session } from "./rev3-protocol.mjs";
import { collectInput, measureRev3, measurementCsv } from "./measurement.mjs";
import { DEFAULT_REV3_CALIBRATION, validateCalibration, applyRev3Calibration, fitReferenceCalibration } from "./calibration.mjs";

const get = id => document.getElementById(id);
const state = { rev1: null, rev3: null, lastRevision: "rev1", running: false, abort: null, records: [], calibration: { ...DEFAULT_REV3_CALIBRATION } };
const fmt = value => Number.isFinite(value) ? value.toFixed(2) + " ms" : "—";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const calibrationKey = "rakka-rev3-calibration-v1";

function loadCalibration() {
  try {
    const saved = globalThis.localStorage?.getItem(calibrationKey);
    if (saved) state.calibration = validateCalibration(JSON.parse(saved));
  } catch { state.calibration = { ...DEFAULT_REV3_CALIBRATION }; }
  fillCalibrationFields();
}

function fillCalibrationFields() {
  const c = state.calibration;
  get("rev3-down-offset").value = String(c.downOffset);
  get("rev3-up-offset").value = String(c.upOffset);
  get("rev3-reference-name").value = c.referenceName || "";
  get("rev3-reference-down").value = Number.isFinite(c.referenceDown) ? String(c.referenceDown) : "";
  get("rev3-reference-up").value = Number.isFinite(c.referenceUp) ? String(c.referenceUp) : "";
}

function readCalibrationFields() {
  const c = validateCalibration({ downOffset: get("rev3-down-offset").value, upOffset: get("rev3-up-offset").value });
  return c.downOffset === state.calibration.downOffset && c.upOffset === state.calibration.upOffset
    ? validateCalibration(state.calibration) : c;
}

function saveCalibration() {
  try { globalThis.localStorage?.setItem(calibrationKey, JSON.stringify(state.calibration)); } catch {}
}

function renderCalibration() {
  const rev3 = document.querySelector('input[name=revision]:checked').value === "rev3";
  get("rev3-calibration").hidden = !rev3;
  for (const id of ["rev3-down-offset", "rev3-up-offset", "rev3-reference-down", "rev3-reference-up", "rev3-reference-name"]) {
    get(id).disabled = state.running || !rev3;
  }
  get("rev3-calibration-apply").disabled = state.running || !rev3;
  get("rev3-calibration-reset").disabled = state.running || !rev3;
  get("rev3-calibration-fit").disabled = state.running || !rev3 || state.lastRevision !== "rev3" ||
    !state.records.some(r => !r.error && Number.isFinite(r.downFromIn) && Number.isFinite(r.upFromIn));
  const c = state.calibration;
  const source = c.source === "reference_fit"
    ? "기준 장비 맞춤" + (c.referenceName ? " · " + c.referenceName : "") : "수동 보정";
  get("rev3-calibration-status").textContent = source + " · 누름 +(" + c.downOffset.toFixed(3) +
    ")ms / 뗌 +(" + c.upOffset.toFixed(3) + ")ms";
}

function applyCalibrationSettings(calibration) {
  state.calibration = validateCalibration(calibration);
  state.records = state.records.map(r => r.revision === "rev3" ? applyRev3Calibration(r, state.calibration) : r);
  fillCalibrationFields(); saveCalibration(); render();
}

function env() {
  get("environment").textContent = !window.isSecureContext
    ? "보안 컨텍스트가 아닙니다. localhost 주소로 실행해 주세요."
    : "Rev1 WebHID: " + (navigator.hid ? "지원" : "미지원") +
      " · Rev3 WebUSB: " + (navigator.usb ? "지원" : "미지원") + " · PTG Studio 백업 · 로컬 측정";
  get("connect1").disabled = state.running || !navigator.hid || !window.isSecureContext;
  get("connect3").disabled = state.running || !navigator.usb || !window.isSecureContext;
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

async function connectRev3() {
  if (state.rev3?.opened) return state.rev3;
  const { session, protocolVersion } = await openRev3Session();
  state.rev3 = session;
  get("status3").textContent = "Rev3 연결 완료 · 프로토콜 버전 " + protocolVersion;
  return session;
}

async function measureOnce(device, revision, settings, signal) {
  if (revision === "rev3") return measureRev3(device, settings, signal);
  if (signal.aborted) throw new DOMException("중단됨", "AbortError");
  const input = collectInput(settings, signal);
  let sentAt;
  try {
    // Rev1 Feature Report byte 1 always ZERO (1 would enter DFU mode).
    await device.sendFeatureReport(0, rev1Packet(settings.hold));
    sentAt = performance.now();
    await input.result;
    if (signal.aborted) throw new DOMException("중단됨", "AbortError");
    await device.receiveFeatureReport(0);
    const t = input.times();
    return { ...calculate(sentAt, t.downAt, t.upAt, settings.hold), ...t,
      revision: "rev1", timingBasis: "out_complete", holdTime: settings.hold, usbSentAt: sentAt };
  } catch (error) {
    error.measurement = { ...input.times(), revision: "rev1", timingBasis: "out_complete",
      holdTime: settings.hold, usbSentAt: sentAt };
    throw error;
  } finally { input.cleanup(); }
}

function render() {
  const rows = get("rows"), graph = get("graph");
  rows.replaceChildren(); graph.replaceChildren();
  const rev3 = state.lastRevision === "rev3";
  get("down-average-label").textContent = rev3 ? "평균 Keydown (보정 추정)" : "평균 Keydown";
  get("up-average-label").textContent = rev3 ? "평균 Keyup (보정 추정)" : "평균 Keyup";
  get("measurement-basis").hidden = !rev3;
  if (rev3) {
    const c = state.calibration;
    get("measurement-basis").textContent = "IN 기준에 누름 " + c.downOffset.toFixed(3) + "ms / 뗌 " +
      c.upOffset.toFixed(3) + "ms를 더한 추정값입니다. " +
      "보정은 다른 테스터와 숫자대를 맞추기 위한 값이며 실제 테스터 작동 지연을 측정한 값은 아닙니다.";
  }
  renderCalibration();
  const successful = state.records.filter(r => !r.error);
  const d = stats(successful.map(r => r.down)), u = stats(successful.map(r => r.up));
  get("down-average").textContent = d ? fmt(d.avg) : "—";
  get("up-average").textContent = u ? fmt(u.avg) : "—";
  const detail = s => s ? "최소 " + fmt(s.min) + " · P95 " + fmt(s.p95) + " · 최대 " + fmt(s.max) : "—";
  get("down-detail").textContent = detail(d); get("up-detail").textContent = detail(u);
  get("download").disabled = !state.records.length;
  if (!state.records.length) {
    const cell = rows.insertRow().insertCell(); cell.colSpan = 4;
    cell.textContent = "아직 결과가 없습니다."; return;
  }
  const values = successful.flatMap(r => [r.down, r.up]).filter(Number.isFinite);
  const maximum = Math.max(1, ...values), minimum = Math.min(0, ...values), range = maximum - minimum;
  const zero = maximum / range * 100;
  graph.style.setProperty("--zero", zero + "%");
  for (const r of state.records) {
    const tr = rows.insertRow();
    for (const value of [r.phase === "warmup" ? "예열" : r.index,
      fmt(r.error ? NaN : r.down), fmt(r.error ? NaN : r.up), r.error ? "실패: " + r.error : "성공"]) {
      tr.insertCell().textContent = String(value);
    }
    if (r.error) continue;
    const plot = document.createElement("div"); plot.className = "plot";
    plot.title = r.index + "회 · " + fmt(r.down) + " / " + fmt(r.up);
    for (const [kind, value] of [["down", r.down], ["up", r.up]]) {
      const bar = document.createElement("div"); bar.className = "bar " + kind;
      // Absolute magnitude is used for drawn height only. Results remain signed.
      bar.style.height = (Number.isFinite(value) ? Math.abs(value) / range * 100 : 0) + "%";
      bar.style.top = (value >= 0 ? (maximum - value) / range * 100 : zero) + "%";
      plot.append(bar);
    }
    graph.append(plot);
  }
}

function setRunning(yes) {
  state.running = yes;
  get("start").disabled = yes; get("stop").hidden = !yes || !state.abort;
  for (const input of get("form").querySelectorAll("input")) input.disabled = yes;
  syncType(); renderCalibration(); env();
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
  const controller = new AbortController();
  state.abort = controller;
  setRunning(true);
  let settings, device;
  const revision = document.querySelector('input[name=revision]:checked').value;
  try {
    settings = validateSettings({
      type: document.querySelector("input[name=type]:checked").value,
      target: get("target").value,
      hold: get("hold").value,
      interval: get("interval").value,
      count: get("count").value,
      warmup: get("warmup").value
    });
    if (revision === "rev3") {
      settings.calibration = readCalibrationFields();
      state.calibration = settings.calibration;
      saveCalibration();
      device = await connectRev3();
    } else {
      device = state.rev1?.opened ? state.rev1 : await connectRev1();
      if (/66b7/i.test(device.productName || "") && settings.hold > 20) {
        throw new Error("구형 Rev1 펌웨어는 유지 시간을 20ms 이하로 설정해야 합니다.");
      }
    }
  } catch (e) {
    get("progress").textContent = e.message || String(e);
    state.abort = null;
    setRunning(false);
    return;
  }
  if (controller.signal.aborted) {
    get("progress").textContent = "측정 중단";
    state.abort = null;
    setRunning(false);
    return;
  }
  state.records = [];
  state.lastRevision = revision;
  // Epoch mapping is only an ETW alignment hint, not a native USB timestamp.
  const runTiming = {
    runId: crypto.randomUUID(), timeOriginEpoch: performance.timeOrigin,
    clockAnchorPerf: performance.now(), clockAnchorEpoch: Date.now()
  };
  render();
  let count = 0, failure = null;
  try {
    const total = settings.warmup + settings.count;
    for (let i = 0; i < total && !controller.signal.aborted; i++) {
      const warmup = i < settings.warmup;
      get("progress").textContent = warmup
        ? "예열 " + (i + 1) + "/" + settings.warmup
        : "측정 " + (count + 1) + "/" + settings.count;
      try {
        const result = await measureOnce(device, revision, settings, controller.signal);
        if (!warmup) {
          count++;
          state.records.push({ index: count, phase: "measure", ...result, ...runTiming, error: null });
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        if (!warmup) count++;
        if (!warmup || revision === "rev3") {
          state.records.push({ index: warmup ? 0 : count, revision, holdTime: settings.hold,
            ...e.measurement, ...runTiming, phase: warmup ? "warmup" : "measure", down: NaN, up: NaN,
            error: e.message || "오류" });
        }
        if (revision === "rev3") {
          failure = e; render(); await device.close(); break;
        }
      }
      if (!warmup) render();
      if (!controller.signal.aborted && i < total - 1) await sleep(settings.interval);
    }
    if (controller.signal.aborted && revision === "rev3") await device.close();
    get("progress").textContent = failure ? "측정 중지 · " + failure.message + " · " + count + "회 기록"
      : (controller.signal.aborted ? "측정 중단 · " : "측정 완료 · ") + count + "회";
  } finally {
    state.abort = null;
    setRunning(false);
  }
}

for (const [id, connect, status] of [["connect1", connectRev1, "status1"], ["connect3", connectRev3, "status3"]]) {
  get(id).addEventListener("click", async () => {
    if (state.running) return;
    setRunning(true);
    try { await connect(); } catch (e) { get(status).textContent = e.message || String(e); }
    finally { setRunning(false); }
  });
}
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
get("rev3-calibration-apply").addEventListener("click", () => {
  if (state.running || document.querySelector('input[name=revision]:checked').value !== "rev3") return;
  try { applyCalibrationSettings(readCalibrationFields()); }
  catch (error) { get("rev3-calibration-status").textContent = error.message; }
});
get("rev3-calibration-reset").addEventListener("click", () => {
  if (state.running || document.querySelector('input[name=revision]:checked').value !== "rev3") return;
  applyCalibrationSettings(DEFAULT_REV3_CALIBRATION);
});
get("rev3-calibration-fit").addEventListener("click", () => {
  if (state.running || state.lastRevision !== "rev3" || document.querySelector('input[name=revision]:checked').value !== "rev3") return;
  try {
    applyCalibrationSettings(fitReferenceCalibration(state.records,
      get("rev3-reference-down").value, get("rev3-reference-up").value, get("rev3-reference-name").value));
  } catch (error) { get("rev3-calibration-status").textContent = error.message; }
});
document.querySelectorAll("input[name=revision]").forEach(radio => radio.addEventListener("change", renderCalibration));
document.querySelectorAll("input[name=type]").forEach(radio => radio.addEventListener("change", syncType));
get("download").addEventListener("click", () => {
  if (!state.records.length) return;
  const blob = new Blob([measurementCsv(state.records)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "rakka-" + state.lastRevision + "-" + new Date().toISOString().slice(0, 10) + ".csv";
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
navigator.usb?.addEventListener("disconnect", event => {
  if (event.device === state.rev3?.device) {
    state.abort?.abort();
    state.rev3 = null;
    get("status3").textContent = "Rev3 연결 해제됨";
  }
});
loadCalibration();
buildKeyboard();
syncType();
env();
render();
