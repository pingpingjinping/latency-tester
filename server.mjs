import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/rev3-diagnostics.html", ["rev3-diagnostics.html", "text/html; charset=utf-8"]],
  ["/rev3-diagnostics.js", ["rev3-diagnostics.js", "text/javascript; charset=utf-8"]],
  ["/protocol.mjs", ["protocol.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);
http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const route = routes.get(path);
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
