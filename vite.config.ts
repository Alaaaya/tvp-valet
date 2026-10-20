import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {resolve, relative} from 'node:path';

export function renderServiceWorker(template: string, version: string, base: string, files: string[]): string {
  return template.replace('__VERSION__', version.slice(0, 16)).replace('__BASE__', base).replace('__PRECACHE__', JSON.stringify([...new Set(files)].sort()));
}

export default defineConfig(({mode}) => {
  const root = process.cwd();
  // Include tracked inputs plus new local source/assets. Hash their actual bytes,
  // not git HEAD or build time, so dirty edits count and identical builds agree.
  const inputs = new Set<string>(execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean));
  function walk(dir: string) {
    for (const item of readdirSync(resolve(root, dir), {withFileTypes: true})) {
      const path = `${dir}/${item.name}`;
      if (item.isDirectory()) walk(path); else if (item.isFile()) inputs.add(path);
    }
  }
  walk('src'); walk('public');
  for (const path of ['index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', '.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) inputs.add(path);
  const digest = createHash('sha256');
  for (const p of ['src/offline/sw.template.js']) inputs.add(p);
  digest.update(JSON.stringify({base: process.env.VITE_BASE_PATH || '/', mode,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')).sort(([a], [b]) => a.localeCompare(b)))}));
  for (const path of [...inputs].sort()) {
    if (!/^(src\/|public\/|index\.html$|vite\.config\.ts$|package(-lock)?\.json$|tsconfig.*\.json$|\.env)/.test(path)) continue;
    try {
      const absolute = resolve(root, path);
      if (!statSync(absolute).isFile()) continue;
      const bytes = readFileSync(absolute);
      digest.update(JSON.stringify([relative(root, absolute), bytes.length])); digest.update(bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const hash = digest.digest('hex');
  return {
    plugins: [react(), {name: 'build-version', generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: JSON.stringify({hash})});
    }}, {name: 'offline-shell-sw', apply: 'build', enforce: 'post', generateBundle(_o, bundle) {
      const base = (process.env.VITE_BASE_PATH || '/').replace(/\/?$/, '/');
      const files = Object.keys(bundle).filter(f => f !== 'version.json' && f !== 'sw.js' && !f.endsWith('.map'));
      const walkPublic = (dir: string, prefix = ''): string[] => readdirSync(resolve(root, dir), {withFileTypes: true}).flatMap(i => i.isDirectory() ? walkPublic(`${dir}/${i.name}`, `${prefix}${i.name}/`) : [`${prefix}${i.name}`]);
      const all = [...files, ...walkPublic('public'), 'index.html'].filter(f => f !== 'version.json');
      const template = readFileSync(resolve(root, 'src/offline/sw.template.js'), 'utf8');
      this.emitFile({type: 'asset', fileName: 'sw.js', source: renderServiceWorker(template, hash, base, all)});
    }}],
    // NOTE hash is computed above, before this plugin runs.
    base: process.env.VITE_BASE_PATH || '/',
    define: {__BUILD_HASH__: JSON.stringify(hash)},
  };
});
