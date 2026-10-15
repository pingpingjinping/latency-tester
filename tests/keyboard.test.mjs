import test from "node:test";
import assert from "node:assert/strict";
import { keyboardRows, selectableKeys, normalizeKeyboardTarget } from "../keyboard.mjs";

test("visual keyboard covers five rows and its supported characters", () => {
  assert.equal(keyboardRows.length, 5);
  for (const key of ["a", "q", "z", "1", "0", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/", "`"]) {
    assert.ok(selectableKeys.has(key),key);
  }
  assert.equal(selectableKeys.size, 47);
});
test("keys for modifiers and Space remain disabled", () => {
  const excluded = keyboardRows.flat().filter(k => k.key === null).map(k => k.label);
  for (const key of ["Tab", "Caps", "Enter", "Shift", "Ctrl", "Space", "Backspace"]) assert.ok(excluded.includes(key),key);
});
test("selection normalizes ASCII key target and rejects modifiers", () => {
  assert.equal(normalizeKeyboardTarget("A"),"a");
  assert.equal(normalizeKeyboardTarget("5"),"5");
  assert.equal(normalizeKeyboardTarget(";"),";");
  assert.equal(normalizeKeyboardTarget("Shift"),null);
  assert.equal(normalizeKeyboardTarget(" "),null);
  assert.equal(normalizeKeyboardTarget("한"),null);
});

test("Rev1 selector is click-only and respects measurement mode", async () => {
  const { readFileSync } = await import("node:fs");
  const src = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const html=src("index.html"),app=src("app.js"),css=src("styles.css"),server=src("server.mjs");
  assert.match(html,/id="target"[^>]*readonly/);
  assert.match(html,/id="keyboard-panel"/);
  assert.match(html,/id="keyboard-layout"/);
  assert.match(app,/button\.type = "button"/);
  assert.match(app,/button\.addEventListener\("click", \(\) => selectKeyboardKey\(key\.key\)\)/);
  assert.match(app,/get\("keyboard-panel"\)\.hidden = isMouse/);
  assert.match(app,/button\.disabled = state\.running \|\| isMouse/);
  assert.match(css,/\.keyboard-key\.is-selected/);
  assert.match(server,/\["\/keyboard\.mjs", \["keyboard\.mjs"/);
});
