import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.css': 'text/css; charset=utf-8',
};

export async function startStaticServer(root) {
  const normalizedRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      const rawPath = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      const relativePath = rawPath === '/' ? 'renderer/index.html' : rawPath.replace(/^\/+/, '');
      const filename = path.resolve(normalizedRoot, relativePath);
      if (!filename.startsWith(`${normalizedRoot}${path.sep}`) && filename !== normalizedRoot) throw new Error('Path outside static root');
      const file = await stat(filename);
      if (!file.isFile()) throw new Error('Not a file');
      response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(filename)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(filename).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to create loopback static server');
  return {
    url: `http://127.0.0.1:${address.port}/renderer/index.html`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
