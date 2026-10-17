/** Explicit retained QA fixture ids. No heuristics, never mutates data. */
export const QA_FIXTURE_IDS: readonly string[]=['f3f0a658-b0ee-4c9c-9c45-934bebeecce7','785e090a-f3c4-4e8d-b786-3140e633cf77'];
export const isQaFixtureId=(id:string):boolean=>QA_FIXTURE_IDS.includes(id);
export const withoutQaFixtures=<T extends {id:string}>(rows:readonly T[]):T[]=>rows.filter(r=>!isQaFixtureId(r.id));
