import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};
const server = createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
    const servedRelative = relative.startsWith('assets/') ? path.join('public', relative) : relative;
    const file = path.resolve(root, servedRelative);
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Bad path');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, '0.0.0.0', () => console.log(`Cream Soda Umisea is ready at http://localhost:${port}`));
