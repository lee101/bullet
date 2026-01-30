import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function errorLoggerPlugin(): Plugin {
  const logPath = path.resolve(__dirname, 'logs/client-errors.log');
  return {
    name: 'error-logger',
    configureServer(server) {
      server.middlewares.use('/api/error', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const line = `[${new Date().toISOString()}] ${data.level || 'error'}: ${data.message}${data.stack ? '\n' + data.stack : ''}\n`;
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
            fs.appendFileSync(logPath, line);
            console.error('[client]', data.message);
          } catch {}
          res.statusCode = 200;
          res.end('ok');
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
        watch: { usePolling: false }
      },
      plugins: [errorLoggerPlugin(), react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: 'esnext',
        minify: 'esbuild',
        rollupOptions: {
          output: {
            manualChunks: {
              'engine': ['./engine/GameEngine.ts', './engine/WorldGenerator.ts'],
              'audio': ['./engine/AudioManager.ts'],
              'ui': ['./components/HUD.tsx', './components/ShopUI.tsx', './components/MainMenu.tsx']
            }
          }
        },
        reportCompressedSize: true,
        chunkSizeWarningLimit: 500
      }
    };
});
