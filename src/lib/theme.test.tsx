import {describe,it,expect} from 'vitest';
import {readTheme,writeTheme,THEME_KEY} from './theme';
describe('local opt-in theme',()=>{
 it('defaults to classic for absent and unrecognized values',()=>{
 for(const value of [null,'','classic','dark','<script>'])expect(readTheme({getItem:()=>value})).toBe('classic');
 expect(readTheme()).toBe('classic');
 });
 it('reads only explicit nana',()=>expect(readTheme({getItem:()=> 'nana'})).toBe('nana'));
 it('survives blocked local storage',()=>{
 expect(readTheme({getItem:()=>{throw Error('blocked')}})).toBe('classic');
 expect(()=>writeTheme({setItem:()=>{throw Error('blocked')}},'nana')).not.toThrow();
 });
 it('writes only a device preference',()=>{
 const values:Record<string,string>={};writeTheme({setItem:(k,v)=>{values[k]=v}},'nana');
 expect(values).toEqual({[THEME_KEY]:'nana'});
 });
});
