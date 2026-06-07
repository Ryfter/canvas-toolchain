import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildCourseHealth, walkForCourses } from './data.js';
import { renderCourseHealthPage } from './views/course_health.js';

export interface StartDashboardServerInput {
  coursesRoot: string;
  port?: number;
}

export interface DashboardServerHandle {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

export async function startDashboardServer(input: StartDashboardServerInput): Promise<DashboardServerHandle> {
  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }
    if (req.url === '/' || req.url === '') {
      try {
        const courseDirs = walkForCourses(input.coursesRoot);
        const courses = courseDirs.map((d) => buildCourseHealth(d));
        const html = renderCourseHealthPage({ coursesRoot: input.coursesRoot, courses });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(input.port ?? 0, '127.0.0.1', () => resolve());
  });

  const addr = server.address() as AddressInfo;
  const port = addr.port;
  const url = `http://127.0.0.1:${port}/`;

  const stop = (): Promise<void> => new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  return { url, port, stop };
}
