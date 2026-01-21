import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
        watch: { usePolling: false }
      },
      plugins: [react()],
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
