import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {MediaGallery} from './gallery';
describe('gallery addTile',()=>{
  it('demo: addTile first inside mg-grid',()=>{const h=r(<MediaGallery bookingId="b" demo refreshKey={0} local={[{name:'a',url:'http://x/a.jpg'}]} addTile={<label className="upload" id="plus">+</label>}/>);expect(h.indexOf('mg-grid')).toBeLessThan(h.indexOf('id="plus"'));expect(h.indexOf('id="plus"')).toBeLessThan(h.indexOf('<a '))});
  it('live: addTile first inside mg-grid',()=>{const h=r(<MediaGallery bookingId="b" demo={false} refreshKey={0} local={[]} addTile={<label className="upload" id="plus">+</label>}/>);expect(h).toMatch(/class="mg-grid"><label[^>]*id="plus"/)});
  it('unchanged without addTile',()=>{expect(r(<MediaGallery bookingId="b" demo refreshKey={0} local={[]}/>)).toBe('<div class="mg-grid"></div>')});
});
