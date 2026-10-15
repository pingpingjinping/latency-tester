import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const load = f => readFileSync(new URL("../"+f,import.meta.url));
const txt = f => load(f).toString("utf8");
test("captured mouse image is a PNG",()=>{
 const b=load("ptg/assets/mouse-CdkQfT0w.png");
 assert.ok(b.length>200000);
 assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);
});
test("both site switches are present",()=>{
 assert.match(txt("index.html"),/top-site-switch/);
 assert.match(txt("ptg/index.html"),/ptg-site-switch/);
});
test("PTG UI labels are in Korean",()=>{
 const js=txt("ptg/assets/index-B3lzit8o.js");
 for(const x of ["마우스 선택 영역","측정 시작","왼쪽 버튼","측정 설정"]) assert.ok(js.includes(x),x);
});
test("PTG Vite preloads do not double-prefix slashes",()=>{
 const js=txt("ptg/assets/index-BZEgvNeM.js");
 // Vite's rE helper prepends '/'; deps themselves must not start with '/'.
 assert.ok(js.includes('rE=function(e){return"/"+e}'));
 assert.ok(js.startsWith('const __vite__fileDeps=["ptg/assets/'));
 const match=js.match(/^const __vite__fileDeps=(\\[[^\\]]+\\])/);
 assert.ok(match, "Vite dependency array exists");
 assert.ok(JSON.parse(match[1]).every(dep=>dep.startsWith("ptg/assets/")));
});
test("loading stylesheet is local",()=>{
 assert.ok(txt("server.mjs").includes("resource"));
 assert.ok(txt("ptg/index.html").includes("/ptg/resource/loading.css"));
});

test("mouse button selection is reactive and distinct mouse events are filtered", () => {
 const js=txt("ptg/assets/index-B3lzit8o.js");
 assert.match(js,/testMode:"kb",mouseButton:"left"/);
 assert.match(js,/c=x=>\{o\.mouseButton=x\}/);
 assert.match(js,/E\.button===\(o\.mouseButton==="right"\?2:0\)/);
 assert.match(js,/"aria-pressed":o\.mouseButton==="left"/);
 assert.match(js,/"aria-pressed":o\.mouseButton==="right"/);
 assert.match(js,/ptg-mouse-choice-selected/);
 assert.doesNotMatch(js,/c=x=>\{console\.log\(x\)\}/);
});
