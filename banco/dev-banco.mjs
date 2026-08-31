/* Il front end di sviluppo attaccato AL BANCO, non al servizio vero.

   `npm run dev` senza `PATHFINDER_DEV_API` parla con la 4173, cioè col
   magazzino in servizio: qui la variabile si impone prima di accendere
   vite, così la finestra sbagliata non esiste. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(radice, 'node_modules', 'vite', 'bin', 'vite.js');

spawn(process.execPath, [vite, '--port', '5199', '--strictPort'], {
  cwd: radice, stdio: 'inherit',
  env: { ...process.env, PATHFINDER_DEV_API: 'http://127.0.0.1:4199' },
}).on('exit', (c) => process.exit(c ?? 0));
