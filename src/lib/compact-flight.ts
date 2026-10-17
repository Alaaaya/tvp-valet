import type {FlightUpdate} from './flights';
export interface CompactFlight {time:string|null;delay:number}
/** Single headline time for the flight box: actual, else estimated, else scheduled, else recorded; null when no data. */
export function compactFlight(f:FlightUpdate|undefined,recorded?:string|null):CompactFlight{
  const time=f?.actual||f?.estimated||f?.scheduled||recorded||null;
  return {time,delay:f?.delayMinutes||0};
}
