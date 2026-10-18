import {describe,it,expect} from 'vitest';
import {pushView,popView} from './view-back-stack';
describe('local view back stack',()=>{
 it('returns one level at a time through nested menu pages',()=>{const a=pushView([],'today','settings');const b=pushView(a,'settings','customers');expect(popView(b)).toEqual({view:'settings',stack:['today']});expect(popView(a)).toEqual({view:'today',stack:[]});expect(a).toEqual(['today'])});
 it('never backs beyond main and clears stack when main is selected',()=>{expect(popView([])).toEqual({view:'today',stack:[]});expect(pushView(['today'],'settings','today')).toEqual([])});
 it('does not stack duplicate current pages',()=>expect(pushView(['today'],'settings','settings')).toEqual(['today']));
});
