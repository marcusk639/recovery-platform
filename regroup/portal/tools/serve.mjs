// Static server for dist/, used by Playwright.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json' };

http
  .createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const file = path.join(dist, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    const isFile = file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile();
    // Portal URLs like /houses/abc/residents have no extension and load the app.
    if (!isFile && path.extname(url.pathname)) {
      response.writeHead(404).end();
      return;
    }
    const served = isFile ? file : path.join(dist, 'index.html');
    response.writeHead(200, { 'content-type': types[path.extname(served)] ?? 'application/octet-stream' });
    fs.createReadStream(served).pipe(response);
  })
  .listen(5199, '127.0.0.1');
