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
test("site switch is integrated next to PTG's V1.3 version link",()=>{
 assert.match(txt("index.html"),/top-site-switch/);
 const html=txt("ptg/index.html");
 const js=txt("ptg/assets/index-B3lzit8o.js");
 const css=txt("ptg/assets/site-switch.css");
 assert.doesNotMatch(html,/id="ptg-site-switch"/);
 assert.match(js,/V\("a",\{href:"\/",class:"ptg-rev1-switch"/);
 const ver=js.indexOf('onClick:b[1]');
 const anchor=js.indexOf('class:"ptg-rev1-switch"',ver);
 const next=js.indexOf('V("div",w3,',ver);
 assert.ok(ver>0&&anchor>ver&&next>anchor&&anchor-ver<350,"switch follows V1.3 in the PTG header");
 assert.match(css,/\.ptg-rev1-switch/);
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
 const marker="],__vite__mapDeps=";
 const end=js.indexOf(marker);
 assert.ok(end>0,"Vite dependency array exists");
 const deps=JSON.parse(js.slice("const __vite__fileDeps=".length,end+1));
 assert.ok(deps.every(dep=>dep.startsWith("ptg/assets/")));

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

test("mouse choices sit outside image, without overlapping the picture", () => {
 const source=txt("ptg/assets/index-B3lzit8o.js");
 const css=txt("ptg/assets/site-switch.css");
 assert.match(source,/ptg-mouse-choice-left/);
 assert.match(source,/ptg-mouse-choice-right/);
 assert.doesNotMatch(source,/left--32% ptg-mouse-choice/);
 assert.doesNotMatch(source,/right--32% ptg-mouse-choice/);
 assert.match(css,/\.ptg-mouse-choice-left\s*\{[^}]*transform:translateX\(calc\(-100% - 12px\)\)/);
 assert.match(css,/\.ptg-mouse-choice-right\s*\{[^}]*transform:translateX\(calc\(100% \+ 12px\)\)/);
});
test("PTG count labels and unit suffixes are fully Korean", () => {
 const js=txt("ptg/assets/index-B3lzit8o.js");
 assert.match(js,/"샘플 횟수"/);
 assert.match(js,/"측정 횟수"/);
 assert.doesNotMatch(js,/측정 반복 횟수/);
 assert.doesNotMatch(js,/De\(" [次轮] "\)/);
 const suffixes=js.match(/De\(" 회 "\)/g)||[];
 assert.equal(suffixes.length,2);
});
