import { LocalPersistence } from './local.js';
import { RemotePersistence } from './remote.js';

import type { Persistenza } from '../../types/contratto.js';

const Persistence: Persistenza = (() => {
  const forzato = new URLSearchParams(location.search).get('db');
  if (forzato === 'local') return LocalPersistence;
  if (forzato === 'remote') return RemotePersistence;
  const servito = location.protocol === 'http:' || location.protocol === 'https:';
  return servito ? RemotePersistence : LocalPersistence;
})();

export { Persistence, LocalPersistence, RemotePersistence };
