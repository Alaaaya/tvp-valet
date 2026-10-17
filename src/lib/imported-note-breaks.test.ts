import {expect,it} from 'vitest';
import {displayComment} from './comments';
it('normalizes imported breaks and a truncated trailing break as text without mutating input',()=>{
 const raw='Opel<br/>Vectra<BR >Call<br/\nParkingPro source uuid';
 expect(displayComment(raw,true).text).toBe('Opel\nVectra\nCall');
 expect(raw).toContain('<br/>');
 expect(displayComment(raw).text).toContain('<br/>');
});
it('normalizes JSON imported notes and deduplicates the resulting lines',()=>{
 const raw=JSON.stringify({source:'ParkingPro',notes:'Call<br />Call<br>'});
 expect(displayComment(raw,true).text).toBe('Call');
 expect(displayComment(raw).text).toBe('Call<br />Call<br>');
});
it('never interprets markup or changes ordinary comments',()=>{
 const raw='<script>alert(1)</script><br/>Call';
 expect(displayComment(raw,true).text).toBe(raw);
 expect(displayComment(raw+'\nParkingPro source uuid',true).text).toBe('<script>alert(1)</script>\nCall');
 expect(displayComment('Brake <bracket\nParkingPro source uuid',true).text).toBe('Brake <bracket');
});
