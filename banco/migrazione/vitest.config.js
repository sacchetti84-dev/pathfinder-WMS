import { defineConfig } from 'vite';

/* Come il ciclo: queste prove pretendono un servizio acceso, e quindi non
   entrano in `npm test`. Si lanciano con `node banco/migrazione/dalla-1.4.cjs`. */
export default defineConfig({
  test: {
    setupFiles: ['./banco/ciclo/ambiente-banco.js'],
    include: ['banco/migrazione/**/*.test.js'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    disableConsoleIntercept: true,
    reporters: ['verbose'],
    sequence: { concurrent: false },
  },
});
