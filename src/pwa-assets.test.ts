import {describe,expect,it} from 'vitest';
import manifestRaw from '../public/manifest.webmanifest?raw';
import html from '../index.html?raw';

describe('pwa assets',()=>{
  const m=JSON.parse(manifestRaw);
  it('manifest is relative standalone',()=>{
    expect(m.id).toBe('./');expect(m.start_url).toBe('./');expect(m.scope).toBe('./');
    expect(m.display).toBe('standalone');expect(m.theme_color).toBe('#0f6b67');
  });
  it('icons are relative and include maskable 512',()=>{
    for(const i of m.icons)expect(i.src.startsWith('icons/')).toBe(true);
    expect(m.icons.some((i:any)=>i.sizes==='512x512'&&i.purpose==='maskable')).toBe(true);
  });
  it('html links manifest via BASE_URL and has ios meta',()=>{
    expect(html).toContain('%BASE_URL%manifest.webmanifest');
    expect(html).toContain('%BASE_URL%icons/apple-touch-icon.png');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('<meta charset="utf-8">');
  });
});
