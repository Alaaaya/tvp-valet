import {describe,it,expect} from 'vitest';
import {buildPatch,toDraft} from './booking-edit-view';
import {blank} from '../model';
import {displayComment,uniqueNoteLines} from './comments';
describe('display-only imported note lines',()=>{
 it('shows repeated Destination = Hurghada once without altering the source',()=>{
  const booking=Object.freeze({comment:'Destination = Hurghada\nDestination = Hurghada\nParkingPro source uuid'});
  const before=JSON.stringify(booking);
  expect(displayComment(booking.comment,true).text).toBe('Destination = Hurghada');
  expect(JSON.stringify(booking)).toBe(before);
  expect(displayComment(booking.comment).text).toBe('Destination = Hurghada\nDestination = Hurghada');
 });
 it('compares trimmed CRLF lines but retains first content and blank lines',()=>{
  expect(uniqueNoteLines('  Destination = Hurghada  \r\nDestination = Hurghada\r\n\t\r\nCall first\r\n Call first ')).toBe('  Destination = Hurghada  \n\t\nCall first');
 });
 it('preserves case, order, punctuation, and meaningful different lines',()=>{
  expect(uniqueNoteLines('Destination = Hurghada\nCall first\ndestination = Hurghada\nDestination = Ankara\nCall first\nCall first!')).toBe('Destination = Hurghada\nCall first\ndestination = Hurghada\nDestination = Ankara\nCall first!');
 });
 it('does not deduplicate unrelated separate JSON comment fields or bookings',()=>{
  const raw=JSON.stringify({source:'ParkingPro',comment:'Call first\nCall first',comments:'Call first',notes:'Call first\nCall first'});
  expect(displayComment(raw,true).text).toBe('Call first\nCall first\nCall first');
  expect(displayComment(raw,true).text).toBe('Call first\nCall first\nCall first');
  expect(displayComment('Call first\n'+JSON.stringify({source:'ParkingPro',notes:'Call first'}),true).text).toBe('Call first\nCall first');
 });
 it('never changes edit/save payloads',()=>{
  const booking={...blank(),comment:'Destination = Hurghada\nDestination = Hurghada\nParkingPro source uuid'};
  displayComment(booking.comment,true);
  expect(buildPatch(booking,toDraft(booking),'admin')).toEqual({});
  const patch=buildPatch(booking,{...toDraft(booking),phone:'+49123'},'admin');
  expect(patch).toEqual({phone:'+49123'});
  expect(booking.comment.match(/Destination = Hurghada/g)).toHaveLength(2);
 });
 it('does not alter ordinary comments or edit preview and handles empty notes',()=>{
  expect(displayComment('Call first\nCall first',true).text).toBe('Call first\nCall first');
  expect(uniqueNoteLines('')).toBe('');
  expect(displayComment('ParkingPro source uuid',true).text).toBe('');
 });
});
