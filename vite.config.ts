import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, Plugin, ViteDevServer } from 'vite';

/** chạy hàm Vercel trong api/*.ts khi dev (npm run dev), để không cần `vercel dev` */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([\w-]+)/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const fn = mod[req.method ?? 'GET'];
          if (!fn) { res.statusCode = 405; return res.end(); }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method, headers: req.headers as Record<string, string>,
            body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks),
          });
          const out: Response = await fn(request);
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), '')); // .env.local -> process.env cho api/
  // GitHub Pages phục vụ trang ở /<tên repo>/ ; dev và Vercel ở gốc /
  return { base: process.env.VITE_BASE || '/', plugins: [react(), devApi()] };
});
