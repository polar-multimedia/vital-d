import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Se publica en https://polar-multimedia.github.io/vital-d/
export default defineConfig({
  base: '/vital-d/',
  plugins: [react()],
  server: { port: 3000, host: '0.0.0.0' },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  // GitHub Pages publica la carpeta docs/ de la rama main
  build: { outDir: 'docs', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
