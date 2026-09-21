import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Node resolves module URLs through symlinks; argv[1] can still contain /current.
export function isMainModule(moduleUrl) {
  try { return Boolean(process.argv[1]) && moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; } // stdin / --eval imports have no entrypoint file.
}
