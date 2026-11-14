// Pure logic: chords, island graph, random walk, pitch detection, scoring. No DOM.

const LETTERS = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEG = { 0: 0, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6 }; // interval -> scale degree, for spelling

const Q = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  maj7: [0, 4, 7, 11], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], '7#5': [0, 4, 8, 10], 'maj7#5': [0, 4, 8, 11],
  '7sus4': [0, 5, 7, 10],
};
const ALIAS = { M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', '-7': 'm7', 'ø': 'm7b5', 'ø7': 'm7b5', o7: 'dim7', '°7': 'dim7',
  '-': 'm', '+': 'aug', o: 'dim', '°': 'dim', mM7: 'mMaj7', '-6': 'm6', '+7': '7#5', aug7: '7#5' };

export const noteName = m => SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

export function parseChord(s) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(s);
  const q = m && (ALIAS[m[3]] ?? m[3]), iv = m && Q[q];
  if (!iv) throw Error(`Unknown chord "${s}" (try e.g. Cmaj7 G7 Dm7 Bm7b5 F#dim7)`);
  const li = LETTERS.indexOf(m[1]), root = (NAT[li] + (m[2] === '#') - (m[2] === 'b') + 12) % 12;
  const tones = iv.map(i => (root + i) % 12), names = {};
  iv.forEach((i, k) => {
    const L = (li + (q === 'dim7' && i === 9 ? 6 : DEG[i])) % 7; // dim7 has a bb7, not a 6
    const acc = ((tones[k] - NAT[L] + 18) % 12) - 6;
    names[tones[k]] = LETTERS[L] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
  });
  return { name: s, tones, names };
}

export function parseNote(s) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(s.trim());
  if (!m) throw Error(`Bad note "${s}" (e.g. E2)`);
  return (+m[3] + 1) * 12 + NAT[LETTERS.indexOf(m[1])] + (m[2] === '#') - (m[2] === 'b');
}

export function rng(seed) { // mulberry32
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Islands = each chord's tones in range. Within an island, pitch-neighbours are always linked and a link
// skipping k notes exists with prob leap^k. Bridges go from each note to the next chord's island: the 2
// nearest notes always, the r-th nearest with prob leap^(r-1). So leap=0 is pure stepwise voice leading.
export function buildGraph(chords, low, octaves, leap, rand) {
  const high = low + 12 * octaves;
  const islands = chords.map(c => {
    const a = [];
    for (let m = low; m <= high; m++) if (c.tones.includes(m % 12)) a.push(m);
    if (!a.length) throw Error(`No ${c.name} tones in range`);
    return a;
  });
  const adj = islands.map(isl => {
    const g = new Map(isl.map(m => [m, []]));
    for (let a = 0; a < isl.length; a++)
      for (let b = a + 1; b < isl.length; b++)
        if (rand() < leap ** (b - a - 1)) { g.get(isl[a]).push(isl[b]); g.get(isl[b]).push(isl[a]); }
    return g;
  });
  const bridges = islands.map((isl, i) => {
    const next = islands[(i + 1) % islands.length];
    return new Map(isl.map(m => [m,
      [...next].sort((x, y) => Math.abs(x - m) - Math.abs(y - m)).filter((_, r) => rand() < leap ** (r - 1))]));
  });
  return { islands, adj, bridges, low, high };
}

// Returns ci => next midi note. Call with the chord index of each slot, in order (chords loop 0..n-1).
// repeat: chance to restate the same note; momentum: chance to keep moving in the same direction.
export function makeWalker(g, { repeat, momentum }, rand) {
  let prev = null, dir = 1, last = null;
  const pick = a => a[Math.floor(rand() * a.length)];
  return ci => {
    let opts;
    if (prev === null) opts = g.islands[ci];
    else if (ci !== last) opts = g.bridges[last].get(prev);
    else if (rand() < repeat) return prev;
    else opts = g.adj[ci].get(prev);
    if (!opts?.length) opts = g.islands[ci];
    const ahead = prev === null ? [] : opts.filter(m => Math.sign(m - prev) === dir);
    const next = ahead.length && rand() < momentum ? pick(ahead) : pick(opts);
    if (prev !== null && next !== prev) dir = Math.sign(next - prev);
    prev = next; last = ci;
    return next;
  };
}

// YIN pitch detector. Returns Hz or null (silence / no clear pitch).
export function detectPitch(buf, sr, gate = 0.01, minHz = 60, maxHz = 1400) {
  let rms = 0;
  for (const x of buf) rms += x * x;
  if (Math.sqrt(rms / buf.length) < gate) return null;
  const maxT = Math.floor(sr / minHz), minT = Math.floor(sr / maxHz), W = buf.length - maxT;
  const d = new Float32Array(maxT + 1);
  let sum = 0;
  for (let t = 1; t <= maxT; t++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + t]; s += x * x; }
    sum += s;
    d[t] = sum ? (s * t) / sum : 1;
  }
  let t = minT;
  while (t < maxT && d[t] >= 0.15) t++;
  if (t >= maxT) return null;
  while (t + 1 < maxT && d[t + 1] < d[t]) t++;
  const a = d[t - 1], b = d[t], c = d[t + 1], den = a + c - 2 * b;
  return sr / (den ? t + (a - c) / (2 * den) : t);
}

export const freqToMidi = f => 69 + 12 * Math.log2(f / 440);

// slots: {heard: bool, hit: seconds-after-slot-start | null}
export function summarize(slots) {
  const hits = slots.filter(s => s.hit !== null);
  return {
    n: slots.length, hit: hits.length,
    wrong: slots.filter(s => s.hit === null && s.heard).length,
    silent: slots.filter(s => !s.heard).length,
    lat: hits.length ? Math.round((1000 * hits.reduce((a, s) => a + s.hit, 0)) / hits.length) : null,
  };
}

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const TEMPLATES = { // [semitones above key, quality]; minor templates use the minor tonic as key
  'V–I': [[7, '7'], [0, 'maj7']],
  'ii–V–I': [[2, 'm7'], [7, '7'], [0, 'maj7']],
  'ii–V–i minor': [[2, 'm7b5'], [7, '7'], [0, 'm6']],
  'I–vi–ii–V': [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']],
  'iii–VI–ii–V': [[4, 'm7'], [9, '7'], [2, 'm7'], [7, '7']],
  'I–VI7–ii–V': [[0, 'maj7'], [9, '7'], [2, 'm7'], [7, '7']],
};
export function transpose(tpl, key) {
  const root = parseChord(key).tones[0], names = key.includes('b') || key === 'F' ? FLAT : SHARP;
  return tpl.map(([i, q]) => names[(root + i) % 12] + q).join(' ');
}
