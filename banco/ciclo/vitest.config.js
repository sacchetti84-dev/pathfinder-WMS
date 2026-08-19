import { defineConfig } from 'vite';

/* Il ciclo NON entra in `npm test`: quelle prove girano da ferme, queste
   pretendono il banco acceso sulla 4199. Due configurazioni, due comandi. */
export default defineConfig({
  test: {
    setupFiles: ['./banco/ciclo/ambiente-banco.js'],
    include: ['banco/ciclo/**/*.test.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    disableConsoleIntercept: true,
    reporters: ['verbose'],
    sequence: { concurrent: false },
  },
});
