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

test("Rev1 selector is compact, modal, and safe while measuring", async () => {
 const {readFileSync}=await import("node:fs");
 const src=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
 const html=src("index.html"),app=src("app.js"),css=src("styles.css"),server=src("server.mjs");
 assert.match(html,/id="target" type="hidden"/);
 assert.match(html,/id="target-picker" type="button"/);
 assert.match(html,/aria-haspopup="dialog"/);
 assert.match(html,/<dialog id="keyboard-dialog"/);
 assert.match(html,/id="keyboard-close"/);
 assert.doesNotMatch(html,/<section class="panel keyboard-panel"/);
 assert.match(app,/get\("target-picker"\)\.addEventListener\("click"/);
 assert.match(app,/get\("keyboard-dialog"\)\.showModal\(\)/);
 assert.match(app,/get\("keyboard-dialog"\)\.close\(\)/);
 assert.match(app,/event\.target === get\("keyboard-dialog"\)/);
 assert.match(app,/get\("target"\)\.value = selected/);
 assert.match(app,/get\("target-selected"\)\.textContent/);
 assert.match(app,/get\("target-picker"\)\.disabled = state\.running \|\| isMouse/);
 assert.match(app,/button\.disabled = state\.running \|\| isMouse/);
 assert.match(css,/\.keyboard-dialog::backdrop/);
 assert.match(css,/\.keyboard-key\.is-selected/);
 assert.match(server,/\["\/keyboard\.mjs", \["keyboard\.mjs"/);
});
