// @vitest-environment jsdom
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({signed:vi.fn(async()=> 'https://fixture/media')}));
vi.mock('./handover-api',()=>({signedMediaUrl:m.signed}));
import {useSignedUrls} from './gallery';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('ordinary prune allows same media to return, confirmed-delete retirement does not',async()=>{let hook!:ReturnType<typeof useSignedUrls>;function Test(){hook=useSignedUrls();return null}const host=document.createElement('div'),root=createRoot(host);const item={id:'id',path:'b/p.png',kind:'photo' as const,mime_type:'image/png',captured_at:'',size_bytes:1};await act(async()=>root.render(<Test/>));await act(async()=>{await hook.ensure(item)});expect(m.signed).toHaveBeenCalledTimes(1);await act(async()=>hook.prune([]));await act(async()=>{await hook.ensure(item)});expect(m.signed).toHaveBeenCalledTimes(2);expect(hook.map.id).toBeTruthy();await act(async()=>hook.evict(item.id));await act(async()=>{await hook.ensure(item)});expect(m.signed).toHaveBeenCalledTimes(2);expect(hook.map.id).toBeUndefined();await act(async()=>root.unmount())});
