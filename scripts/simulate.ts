// Plays a whole show through the rules, with the host popping somebody each round.
import { reduce, initialState, answeringLength } from '../src/show/engine';
import { currentTurn } from '../src/show/timeline';
import type { ShowState } from '../src/show/types';

let now = 0;
let s: ShowState = reduce(initialState(0), { type: 'start', now });
const log: string[] = [];
let last = '';
const turns: string[] = [];
for (let step = 0; step < 20000 && s.phase !== 'end'; step += 1) {
  now += 100;
  s = reduce(s, { type: 'tick', now });
  if (s.phase === 'choosing' && now - s.phaseStart > 1500) s = reduce(s, { type: 'chooseRandom', now });
  if (s.phase === 'answering') {
    const t = currentTurn(s, now);
    if (t && turns[turns.length - 1] !== `${s.round}:${t.id}`) turns.push(`${s.round}:${t.id}`);
  }
  if (s.phase === 'deciding' && now - s.phaseStart > 1200) {
    // Try to pop without choosing first: must not work.
    const before = s.phase;
    s = reduce(s, { type: 'pop', now });
    if (s.phase !== before) throw new Error('popped without a choice');
    s = reduce(s, { type: 'select', id: s.standing[s.standing.length - 1], now });
    s = reduce(s, { type: 'pop', now });
  }
  const key = `${s.phase}/r${s.round}/${s.standing.length}`;
  if (key !== last) {
    log.push(`${(now / 1000).toFixed(1)}s ${key}`);
    last = key;
  }
}
console.log(log.join('\n'));
console.log('turns:', turns.join(' '));
console.log('winner:', s.standing, 'out:', s.out.map((o) => `${o.id}@${o.round}`).join(','));
console.log('answering length with 5:', answeringLength({ ...s, standing: ['a', 'b', 'c', 'd', 'e'] }));
