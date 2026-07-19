import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plain Vite React SPA - unlike the real production project (a Manifest V3 Chrome extension
// built via @crxjs/vite-plugin), this demo copy is a normal website: open a link, no install
// step. See README.md for why.
export default defineConfig({
  plugins: [react()],
});
