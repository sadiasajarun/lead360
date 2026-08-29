import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // Lead360 runs on 5175 so it can coexist with other projects (e.g. Square_ATS) that use Vite's
  // default 5173. If you change this, keep the backend CORS_ORIGIN in sync.
  server: { port: 5175 },
});
