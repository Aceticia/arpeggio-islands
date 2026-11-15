// Pure logic: chords, island graph, random walk, pitch detection, scoring. No DOM.

const LETTERS = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEG = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, // interval -> scale degree, for spelling
  13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 20: 5, 21: 5 }; // tensions: b9 9 #9 11 #11 b13 13

const Q = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  maj7: [0, 4, 7, 11], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], '7#5': [0, 4, 8, 10], 'maj7#5': [0, 4, 8, 11],
  '7sus4': [0, 5, 7, 10], '7b5': [0, 4, 6, 10], sus2: [0, 2, 7], sus4: [0, 5, 7],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '6/9': [0, 4, 7, 9, 14], 9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14], '9sus4': [0, 5, 7, 10, 14], '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 18], 'maj7#11': [0, 4, 7, 11, 18], m11: [0, 3, 7, 10, 14, 17], '7b13': [0, 4, 7, 10, 20],
  13: [0, 4, 7, 10, 14, 21],
};
const ALIAS = { M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', '-7': 'm7', 'ø': 'm7b5', 'ø7': 'm7b5', o7: 'dim7', '°7': 'dim7',
  '-': 'm', '+': 'aug', o: 'dim', '°': 'dim', mM7: 'mMaj7', '-6': 'm6', '+7': '7#5', aug7: '7#5',
  sus: 'sus4', '7sus': '7sus4', '9sus': '9sus4', add2: 'add9', '69': '6/9', M9: 'maj9', 'Δ9': 'maj9', '-9': 'm9', '-11': 'm11' };

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

// Islands = each chord's tones in range, scattered at random 2D points so pitch order means nothing.
// Within an island, pairs are tried shortest-first and linked if the line crosses no other link and
// clears every other note, and one end is among the other's `links` nearest -- or the link joins two
// separate pieces, so the island stays connected. Bridges go from each note to the 2 notes of the next
// island at the nearest height. Positions are in SVG px: island i spans x 0..BOX.w, y 0..g.h.
export const BOX = { w: 180, gap: 120, clear: 22 };
export function buildGraph(chords, low, octaves, links, rand) {
  const high = low + 12 * octaves;
  const islands = chords.map(c => {
    const a = [];
    for (let m = low; m <= high; m++) if (c.tones.includes(m % 12)) a.push(m);
    if (!a.length) throw Error(`No ${c.name} tones in range`);
    return a;
  });
  const h = Math.max(160, 30 * Math.max(...islands.map(a => a.length)));
  const pos = islands.map(isl => scatter(isl.length, BOX.w, h, rand));
  const adj = islands.map((isl, i) => link(isl, pos[i], links));
  const bridges = islands.map((isl, i) => {
    const j = (i + 1) % islands.length, dy = (a, b) => Math.abs(pos[j][b][1] - pos[i][a][1]);
    return new Map(isl.map((m, a) => [m, islands[j].map((_, b) => b).sort((x, y) => dy(a, x) - dy(a, y)).slice(0, 2).map(b => islands[j][b])]));
  });
  return { islands, pos, adj, bridges, low, high, h };
}

// Best-candidate sampling: random points that don't clump.
function scatter(n, w, h, rand) {
  const p = [];
  for (let k = 0; k < n; k++) {
    let best, bd = -1;
    for (let c = 0; c < 30; c++) {
      const q = [rand() * w, rand() * h], d = Math.min(Infinity, ...p.map(o => Math.hypot(o[0] - q[0], o[1] - q[1])));
      if (d > bd) { bd = d; best = q; }
    }
    p.push(best);
  }
  return p;
}

const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
export const crosses = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};

function link(isl, p, k) {
  const n = isl.length, d = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]);
  const idx = [...Array(n).keys()], near = idx.map(a => idx.filter(b => b !== a).sort((x, y) => d(a, x) - d(a, y)).slice(0, k));
  const pairs = idx.flatMap(a => idx.filter(b => b > a).map(b => [a, b])).sort(([a, b], [c, e]) => d(a, b) - d(c, e));
  const comp = [...idx], find = a => comp[a] === a ? a : (comp[a] = find(comp[a]));
  const edges = [], g = new Map(isl.map(m => [m, []]));
  for (const [a, b] of pairs) {
    if (find(a) === find(b) && !near[a].includes(b) && !near[b].includes(a)) continue;
    if (edges.some(([c, e]) => crosses(p[a], p[b], p[c], p[e]))) continue; // shared endpoint -> orient 0 -> no cross
    if (idx.some(c => c !== a && c !== b && segDist(p[c], p[a], p[b]) < BOX.clear)) continue;
    edges.push([a, b]); comp[find(a)] = find(b);
    g.get(isl[a]).push(isl[b]); g.get(isl[b]).push(isl[a]);
  }
  return g;
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

export function rms(buf) {
  let s = 0;
  for (const x of buf) s += x * x;
  return Math.sqrt(s / buf.length);
}

// YIN pitch detector. Returns Hz or null (silence / no clear pitch).
export function detectPitch(buf, sr, gate = 0.01, minHz = 60, maxHz = 1400) {
  if (rms(buf) < gate) return null;
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

// Turns per-frame (level, midi) readings into played-note events {midi, t}, so a ringing note
// counts once. A new event needs a stable pitch (2 frames agree) plus either a pitch change or a
// level jump vs ~3 frames ago (a re-pick). t is the time of the level jump when there was one.
// A jump with no pitch following it (metronome bleed, string noise) expires after 100 ms.
export function makeOnsets() {
  let prev = null, last = null, onsetAt = null, lastAt = -1;
  const hist = [0, 0, 0];
  return (level, midi, now, gate) => {
    if (level > gate && level > 1.5 * hist[0] && now - lastAt > 0.07) onsetAt ??= now;
    hist.push(level); hist.shift();
    if (level < gate) last = null;
    if (onsetAt !== null && now - onsetAt > 0.1) onsetAt = null;
    const stable = midi !== null && midi === prev;
    prev = midi;
    if (!stable || (onsetAt === null && midi === last)) return null;
    const t = onsetAt ?? now;
    onsetAt = null; last = midi; lastAt = now;
    return { midi, t };
  };
}

// Label a midi note with the chord's spelling; octave follows the letter (B#3 = C4, Cb4 = B3).
export function noteLabel(chord, m) {
  const name = chord.names[((m % 12) + 12) % 12], acc = (name.match(/#/g)?.length ?? 0) - (name.match(/b/g)?.length ?? 0);
  return name + (Math.floor((m - acc) / 12) - 1);
}

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

export const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F']; // circle of fifths
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
