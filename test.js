// node test.js
import assert from 'node:assert/strict';
import { parseChord, parseNote, buildGraph, makeWalker, detectPitch, freqToMidi, summarize, rng, transpose, TEMPLATES, makeOnsets, noteLabel } from './core.js';

const sp = s => { const c = parseChord(s); return c.tones.map(t => c.names[t]).join(' '); };
assert.equal(sp('Bbmaj7'), 'Bb D F A');
assert.equal(sp('D7'), 'D F# A C');
assert.equal(sp('Dm7b5'), 'D F Ab C');
assert.equal(sp('Bdim7'), 'B D F Ab');
assert.equal(sp('Cdim7'), 'C Eb Gb Bbb');
assert.equal(sp('C7#5'), 'C E G# Bb');
assert.throws(() => parseChord('H7'));
assert.equal(parseNote('E2'), 40);
assert.equal(transpose(TEMPLATES['ii–V–I'], 'Bb'), 'Cm7 F7 Bbmaj7');

const chords = ['G7', 'Cmaj7', 'Am7'].map(parseChord), r = rng(1);
const g = buildGraph(chords, 40, 2, 0.35, r);
assert.deepEqual(g.islands[0], [41, 43, 47, 50, 53, 55, 59, 62]); // G7 tones E2..E4
g.islands.forEach((isl, i) => isl.slice(1).forEach((m, k) => assert(g.adj[i].get(isl[k]).includes(m)))); // stepwise always linked

for (const p of [{ repeat: 0, momentum: 0 }, { repeat: 0.5, momentum: 1 }]) {
  const walk = makeWalker(g, p, r);
  let prev = null, prevCi = null;
  for (let b = 0; b < 300; b++) for (let k = 0; k < 4; k++) {
    const ci = b % 3, m = walk(ci);
    assert(g.islands[ci].includes(m));
    if (prev !== null) assert(ci !== prevCi ? g.bridges[prevCi].get(prev).includes(m) : m === prev || g.adj[ci].get(prev).includes(m));
    prev = m; prevCi = ci;
  }
}

for (const hz of [82.41, 196, 440, 987.8]) { // guitar-ish tone with harmonics
  const sr = 48000, buf = new Float32Array(2048).map((_, i) =>
    [1, 0.6, 0.4, 0.25].reduce((a, amp, h) => a + 0.2 * amp * Math.sin(2 * Math.PI * hz * (h + 1) * i / sr), 0));
  assert(Math.abs(freqToMidi(detectPitch(buf, sr)) - freqToMidi(hz)) < 0.1, `pitch ${hz}`);
}
assert.equal(detectPitch(new Float32Array(2048), 48000), null);

assert.deepEqual(summarize([{ heard: true, hit: 0.1 }, { heard: true, hit: null }, { heard: false, hit: null }, { heard: true, hit: 0.3 }]),
  { n: 4, hit: 2, wrong: 1, silent: 1, lat: 200 });
assert.equal(noteLabel(parseChord('Abm7'), 59), 'Cb4');
assert.equal(noteLabel(parseChord('G#7'), 60), 'B#3');
assert.equal(noteLabel(parseChord('G7'), 59), 'B3');

{ // onsets: feed 15 ms frames of [level, midi]
  const run = frames => { const on = makeOnsets(); return frames.map(([l, m], i) => on(l, m, i * 0.015, 0.01)).filter(Boolean).map(e => e.midi); };
  const ring = (m, n, l = 0.2) => Array(n).fill([l, m]);
  assert.deepEqual(run(ring(55, 40)), [55]); // one pick, long sustain -> one event
  assert.deepEqual(run([...ring(55, 10), ...ring(57, 10)]), [55, 57]); // legato pitch change
  assert.deepEqual(run([...ring(55, 10, 0.05), ...ring(55, 10, 0.3)]), [55, 55]); // re-pick same note
  assert.deepEqual(run([...ring(null, 3, 0.001), [0.1, null], [0.05, null], ...ring(null, 10, 0.001)]), []); // click bleed, no pitch
  assert.deepEqual(run([...ring(55, 10), ...ring(null, 3, 0.001), ...ring(55, 10)]), [55, 55]); // silence then same note
}
console.log('ok');
