import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/protocol.mjs", ["protocol.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);
http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/ptg") {
    res.writeHead(308, { Location: "/ptg/" });
    res.end();
    return;
  }
  let route = routes.get(path);
  if (path === "/ptg/" || path === "/ptg/index.html") route = ["ptg/index.html", "text/html; charset=utf-8"];
  else if (/^\/ptg\/(?:assets\/[a-zA-Z0-9_.-]+|favicon\.png)$/.test(path)) {
    const ext = path.split(".").pop().toLowerCase();
    const types = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", gif: "image/gif", svg: "image/svg+xml" };
    if (types[ext]) route = [path.slice(1), types[ext]];
  }
  if (!route) {
    res.writeHead(path === "/favicon.ico" ? 204 : 404);
    res.end();
    return;
  }
  try {
    const bytes = await readFile(join(dir, route[0]));
    res.writeHead(200, {
      "Content-Type": route[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(bytes);
  } catch {
    res.writeHead(500);
    res.end("Cannot read local file");
  }
}).listen(8765, "127.0.0.1", () => console.log("Open http://127.0.0.1:8765"));
