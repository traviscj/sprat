import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/web',
  base: './',
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5178 },
  test: { root: '.', include: ['test/**/*.test.ts'] },
} as any);
