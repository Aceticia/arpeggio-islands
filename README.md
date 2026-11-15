# Arpeggio islands

A browser trainer for arpeggiating through chord changes. You type a progression and get a random path through each chord's tones. A metronome keeps time, and the microphone checks that you play the right note on the beat.

Each chord is drawn as an **island**: every one of its tones in your range, scattered at random positions so that pitch order is lost. Each note links to a few of its nearest neighbours on screen, with no crossing lines, so a step along a link can be any interval rather than just up or down the arpeggio. **Bridges** connect each note to two notes of the next chord. A bouncing ball shows the next note, and **New graph** reshuffles everything.

No build step and no dependencies: plain HTML plus one ES module.

## Run

```bash
uv run --no-project python -m http.server 8765
```

Then open <http://localhost:8765>. Any static file server works. Open the app through a server, not as a file: ES modules don't load from `file://`, and the browser only allows microphone access on `localhost` or HTTPS.

## Use

1. **Chords**: type 1–8 chords (`G7 Cmaj7`, `Dm7 G7 Cmaj7`), or pick a template (ii–V–I, I–vi–ii–V, …) and a key.
2. **Range**: set the lowest note (`E2` for guitar) and the number of octaves.
3. **Start** (or press Space). After one bar of count-in, play the highlighted note on each beat.

### Practice settings

| Setting | What it does |
| --- | --- |
| BPM / Notes | Tempo and note value (whole note to 16th notes, plus triplets). One bar per chord. |
| Mode | **Guided path**: play the exact note shown. **Free**: any tone of the current chord counts. |
| Links | How many nearest notes each note links to (1–5). More links give more choices at each step. |
| Repeats | Chance of playing the same note again. |
| Momentum | Chance of continuing in the same direction. |
| New graph | Reshuffle note positions and links. |
| Listen & score | Use the mic to score each note as hit, wrong or silent, and measure your reaction time. |
| Play aloud | A synth plays the target notes (in free mode, the chord on each bar). Scoring turns off while this is on. |
| Record audio | Records the session. A download link appears on the result card. |
| Latency +ms | Add this if notes you play on time score as late or wrong. Bluetooth headphones need about 200. |
| Mic gate | Mic level below this counts as silence. |

**Tuner** shows the detected note and how many cents it is off.

### Chord symbols

Roots `A`–`G` with an optional `#` or `b`, followed by a quality:

- **Triads**: (major), `m`, `dim`, `aug`, `sus2`, `sus4`
- **Sevenths**: `maj7`, `7`, `m7`, `m7b5`, `dim7`, `mMaj7`, `7#5`, `maj7#5`, `7b5`, `7sus4`
- **Sixths**: `6`, `m6`, `6/9`
- **Extended and altered**: `add9`, `madd9`, `9`, `maj9`, `m9`, `9sus4`, `7b9`, `7#9`, `7#11`, `maj7#11`, `m11`, `7b13`, `13`

Common alternative names work too: `M7`/`Δ`, `-7`, `ø`, `°7`/`o7`, `+`, `sus`, `7sus`, `69`, …

Note names are spelled for each chord, so C7#11 shows F#, Bb7b9 shows Cb, and Cdim7 shows Bbb.

### Progress

When a session ends, choose whether to save it. The **Progress** grid shows your best notes per minute (BPM × notes per beat) for each template in each key. A session only counts toward the grid if it was guided, ran for at least 4 loops and hit at least 85% of notes. Click a cell to load that progression. History, your daily streak and your settings are stored in the browser's `localStorage`.

## Files

- `index.html`: UI, audio scheduling, mic input, visuals and progress tracking
- `core.js`: logic with no DOM code: chord parsing and spelling, the island graph, the random walk, YIN pitch detection, onset detection and scoring
- `test.js`: tests for `core.js`

## Test

```bash
node test.js
```
