import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'lib',
    lib: {
      name: 'save-svg-as-png',
      entry: 'src/index.ts',
      fileName: 'index',
      format: ['es', 'umd'],
    },
  },
});
