// Engine sound from a real dyno recording (C7 Corvette Grand Sport, naturally aspirated).
//   node build-audio.mjs "<recording.mp3>"  ->  ../assets/c7-dyno.mp3 + the rpm tables inlined in ../index.html
// The page plays short grains of this file, picked by rpm and repitched, so the REV button drives the real car.
// Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node build-audio.mjs <recording.mp3>'); process.exit(1); }
const root = new URL('../', import.meta.url), path = (f) => new URL(f, root).pathname.replace(/^\/(\w:)/, '$1');
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Where things are in this recording (seconds). Firing frequency = rpm / 15 for a V8 (4 firings per revolution).
const ON = { from: 6.45, to: 14.75, track: [6.6, 14.6], hz: 165 };   // wide-open pull, ~2,350 -> 6,500 rpm
const OFF = { from: 15.3, to: 20.1, track: [15.4, 19.9], hz: 385 };  // off throttle, rollers coasting down, ~5,800 -> 3,900 rpm
const GAP = 0.15, DT = 0.05, SR = 22050;

/* ---------- rpm tracking: follow the firing-frequency ridge in an STFT ---------- */
const tmp = mkdtempSync(join(tmpdir(), 'c7-'));
ff(['-i', SRC, '-ac', '1', '-ar', String(SR), '-f', 'f32le', join(tmp, 'pcm.f32')]);
const raw = readFileSync(join(tmp, 'pcm.f32')), x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const N = 8192;
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, h = len / 2;
    for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), p = i + k, q = p + h;
      const vr = re[q] * c - im[q] * s, vi = re[q] * s + im[q] * c; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; } }
}
function magAt(t) {
  const st = Math.round(t * SR) - N / 2, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (x[st + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im); return (k) => Math.hypot(re[k], im[k]);
}
function track([t0, t1], hz) {
  const out = []; let prev = hz;
  for (let t = t0; t <= t1 + 1e-6; t += DT) {
    const m = magAt(t), lo = Math.floor(prev * 0.93 / SR * N), hi = Math.ceil(prev * 1.09 / SR * N);
    let bk = lo, bv = 0; for (let k = lo; k <= hi; k++) { const v = m(k); if (v > bv) { bv = v; bk = k; } }
    const a = m(bk - 1), c = m(bk + 1), d = (a - c) / (2 * (a - 2 * bv + c));
    prev = (bk + (isFinite(d) ? d : 0)) * SR / N; out.push(prev * 15);
  }
  // smooth, then force monotonic so every rpm maps to one place in the clip
  const sm = out.map((_, i) => { let s = 0, n = 0; for (let j = i - 3; j <= i + 3; j++) if (out[j]) { s += out[j]; n++; } return s / n; });
  const up = sm[sm.length - 1] > sm[0];
  for (let i = 1; i < sm.length; i++) sm[i] = up ? Math.max(sm[i], sm[i - 1] + 1) : Math.min(sm[i], sm[i - 1] - 1);
  return sm.map(Math.round);
}
const onRpm = track(ON.track, ON.hz), offRpm = track(OFF.track, OFF.hz);
rmSync(tmp, { recursive: true, force: true });

/* ---------- cut the two segments into one small mono mp3, peak-normalized ---------- */
const OUT = path('assets/c7-dyno.mp3');
const peak = +/max_volume: (-?[\d.]+) dB/.exec(execFileSync('ffmpeg', ['-hide_banner', '-i', SRC, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) || '')?.[1] || 0;
const gain = -1 - peak; // to -1 dBFS
ff(['-i', SRC, '-filter_complex',
  `[0:a]aformat=channel_layouts=mono,atrim=${ON.from}:${ON.to},asetpts=N/SR/TB,afade=t=in:d=0.02,afade=t=out:st=${(ON.to - ON.from - 0.02).toFixed(2)}:d=0.02[a];` +
  `anullsrc=r=44100:cl=mono,atrim=0:${GAP}[g];` +
  `[0:a]aformat=channel_layouts=mono,atrim=${OFF.from}:${OFF.to},asetpts=N/SR/TB,afade=t=in:d=0.02,afade=t=out:st=${(OFF.to - OFF.from - 0.02).toFixed(2)}:d=0.02[b];` +
  `[a][g][b]concat=n=3:v=0:a=1,aresample=44100,volume=${gain.toFixed(1)}dB[o]`,
  '-map', '[o]', '-c:a', 'libmp3lame', '-q:a', '4', OUT]);

// file times of the first table entry in each segment
const table = { dt: DT,
  on: { t0: +(ON.track[0] - ON.from).toFixed(3), rpm: onRpm },
  off: { t0: +(ON.to - ON.from + GAP + OFF.track[0] - OFF.from).toFixed(3), rpm: offRpm } };
const htmlFile = path('index.html');
const html = readFileSync(htmlFile, 'utf8'), re = /(\/\/ <engine-samples>)[\s\S]*?(\/\/ <\/engine-samples>)/;
if (!re.test(html)) throw new Error('engine-samples markers not found in index.html');
writeFileSync(htmlFile, html.replace(re, `$1\nvar ENGINE_SAMPLES = ${JSON.stringify(table)};\n$2`.replace(/\n/g, html.includes('\r\n') ? '\r\n' : '\n')));
console.log(`on ${onRpm[0]}-${onRpm.at(-1)} rpm (${onRpm.length}), off ${offRpm[0]}-${offRpm.at(-1)} rpm (${offRpm.length}), gain ${gain.toFixed(1)} dB ->`, OUT);
