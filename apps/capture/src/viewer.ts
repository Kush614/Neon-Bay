// Writes index.html next to a capture: a self-contained viewer (data inlined, images by
// relative path) with box overlays, the instance mask, and the dataset statistics the
// paper used to sanity-check its labels (box centroid heatmap, labels per image).
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { CaptureObject, LabelClass } from "./labels.js";

export interface FrameSummary {
  name: string;
  conditions: string;
  camera: string;
  width: number;
  height: number;
  objects: Pick<CaptureObject, "id" | "cls" | "bbox" | "occlusion" | "truncation" | "distance">[];
}

export interface CaptureStats {
  seed: number;
  images: number;
  labels: number;
  humanLabels: 0;
  byClass: Record<LabelClass, number>;
  byConditions: Record<string, number>;
  byCamera: Record<string, number>;
  labelsPerImage: { mean: number; max: number; empty: number };
  wallSeconds: number;
}

export function computeStats(frames: FrameSummary[], seed: number, wallSeconds: number): CaptureStats {
  const count = <K extends string>(keys: K[]) => keys.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {} as Record<K, number>);
  const per = frames.map((f) => f.objects.length);
  const all = frames.flatMap((f) => f.objects);
  return {
    seed,
    images: frames.length,
    labels: all.length,
    humanLabels: 0,
    byClass: { Car: 0, Pedestrian: 0, ...count(all.map((o) => o.cls)) },
    byConditions: count(frames.map((f) => f.conditions)),
    byCamera: count(frames.map((f) => f.camera)),
    labelsPerImage: { mean: per.length ? Math.round((all.length / per.length) * 10) / 10 : 0, max: Math.max(0, ...per), empty: per.filter((n) => n === 0).length },
    wallSeconds: Math.round(wallSeconds),
  };
}

export function writeViewer(outDir: string, frames: FrameSummary[], meta: { seed: number; startedAt: string; wallSeconds: number }): CaptureStats {
  const stats = computeStats(frames, meta.seed, meta.wallSeconds);
  const data = JSON.stringify({ frames, stats, startedAt: meta.startedAt }).replace(/</g, "\\u003c");
  writeFileSync(path.join(outDir, "index.html"), HTML.replace("__DATA__", data));
  return stats;
}

const HTML = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neon Bay '86 · synthetic capture</title>
<style>
:root{--bg:#140c1f;--panel:#1f1530;--line:#3a2b52;--ink:#f3ecff;--dim:#a99bc4;--car:#ff4fa3;--ped:#4fd1ff;--accent:#ffd166}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:20px 28px 8px}h1{margin:0;font-size:22px;letter-spacing:.5px}h1 b{color:var(--car)}
.sub{color:var(--dim);max-width:900px;margin-top:4px}
.tiles{display:flex;gap:10px;flex-wrap:wrap;padding:12px 28px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:120px}
.tile .v{font-size:22px;font-weight:800}.tile .k{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.6px}
.tile.zero .v{color:var(--accent)}
main{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;padding:8px 28px 28px}
.stage{background:#000;border:1px solid var(--line);border-radius:8px;overflow:hidden;position:relative}
.stage img,.stage canvas{display:block;width:100%;height:auto}.stage canvas{position:absolute;inset:0}
.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
button,select{background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer}
button.on{border-color:var(--accent);color:var(--accent)}
.meta{color:var(--dim)}.legend span{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:-1px}
aside .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:12px}
aside h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--dim)}
aside canvas{width:100%;display:block}
table{width:100%;border-collapse:collapse;font-size:12px}td{padding:3px 4px;border-top:1px solid var(--line)}td.n{text-align:right;font-variant-numeric:tabular-nums}
.strip{display:flex;gap:6px;overflow-x:auto;padding:4px 28px 24px}.strip img{height:64px;border-radius:4px;border:2px solid transparent;cursor:pointer;opacity:.75}.strip img.cur{border-color:var(--accent);opacity:1}
</style></head><body>
<header><h1>Neon Bay '86 · <b>synthetic capture</b></h1>
<div class="sub">Every box below was produced by the game engine, not by a person: an instance-ID render pass gives pixel-exact masks, tight 2D boxes, occlusion and truncation, plus KITTI-style 3D labels. Pipeline after <i>Driving in the Matrix</i> (Johnson-Roberson et al., ICRA 2017). Agents playing a live heist provide part of the traffic.</div></header>
<div class="tiles" id="tiles"></div>
<main><section>
<div class="stage" id="stage"><img id="img" alt=""><canvas id="ov"></canvas></div>
<div class="bar"><button id="prev">◀</button><button id="next">▶</button>
<button id="tMask">Mask</button><button id="tBoxes" class="on">Boxes</button>
<select id="fCond"></select><select id="fCls"><option value="">All classes</option><option>Car</option><option>Pedestrian</option></select>
<span class="meta" id="meta"></span>
<span class="legend"><span style="background:var(--car)"></span>Car<span style="background:var(--ped)"></span>Pedestrian · dashed = more than half occluded</span></div>
<table id="objs"></table>
</section><aside>
<div class="card"><h3>Box centre heatmap</h3><canvas id="heat" width="320" height="180"></canvas><div class="meta">Where labelled objects sit in the frame (cf. the paper's Fig. 5).</div></div>
<div class="card"><h3>Labels per image</h3><canvas id="hist" width="320" height="140"></canvas><div class="meta">Distribution of objects per frame (cf. Fig. 6).</div></div>
<div class="card"><h3>Occlusion</h3><canvas id="occ" width="320" height="110"></canvas></div>
<div class="card"><h3>Conditions</h3><table id="conds"></table></div>
</aside></main>
<div class="strip" id="strip"></div>
<script>
const D = __DATA__;
const F = D.frames, S = D.stats;
const COL = {Car: getComputedStyle(document.documentElement).getPropertyValue('--car').trim(), Pedestrian: getComputedStyle(document.documentElement).getPropertyValue('--ped').trim()};
let showMask = false, showBoxes = true, cond = '', cls = '', idx = 0;
const tile = (v,k,z) => '<div class="tile'+(z?' zero':'')+'"><div class="v">'+v+'</div><div class="k">'+k+'</div></div>';
document.getElementById('tiles').innerHTML = tile(S.images,'images') + tile(S.labels,'labels') + tile(S.byClass.Car,'cars') + tile(S.byClass.Pedestrian,'pedestrians') + tile(S.labelsPerImage.mean,'labels / image') + tile(Object.keys(S.byConditions).length,'conditions') + tile(0,'human labels',true);
const fc = document.getElementById('fCond');
fc.innerHTML = '<option value="">All conditions</option>' + Object.keys(S.byConditions).sort().map(c => '<option>'+c+'</option>').join('');
const visible = () => F.map((f,i)=>i).filter(i => !cond || F[i].conditions === cond);
function draw() {
  const list = visible(); if (!list.length) return;
  if (!list.includes(idx)) idx = list[0];
  const f = F[idx];
  const img = document.getElementById('img'), ov = document.getElementById('ov');
  img.src = (showMask ? 'mask/' : 'image_2/') + f.name + '.png';
  ov.width = f.width; ov.height = f.height;
  const g = ov.getContext('2d'); g.clearRect(0,0,f.width,f.height);
  const objs = f.objects.filter(o => !cls || o.cls === cls);
  if (showBoxes) for (const o of objs) {
    const [x1,y1,x2,y2] = o.bbox; g.strokeStyle = COL[o.cls]; g.lineWidth = 2; g.setLineDash(o.occlusion >= .5 ? [6,4] : []);
    g.strokeRect(x1+.5,y1+.5,x2-x1-1,y2-y1-1); g.setLineDash([]);
    const t = o.cls + ' ' + o.distance.toFixed(0) + 'm'; g.font = '12px ui-sans-serif,system-ui'; const tw = g.measureText(t).width + 8;
    g.fillStyle = COL[o.cls]; g.fillRect(x1, Math.max(0,y1-16), tw, 16); g.fillStyle = '#140c1f'; g.fillText(t, x1+4, Math.max(12,y1-4));
  }
  document.getElementById('meta').textContent = f.name + ' · ' + f.conditions + ' · ' + f.camera + ' camera · ' + objs.length + ' labels';
  document.getElementById('objs').innerHTML = '<tr><td>instance</td><td>class</td><td class="n">box</td><td class="n">occluded</td><td class="n">truncated</td><td class="n">distance</td></tr>' + objs.map(o => '<tr><td>'+o.id+'</td><td style="color:'+COL[o.cls]+'">'+o.cls+'</td><td class="n">'+o.bbox.join(', ')+'</td><td class="n">'+Math.round(o.occlusion*100)+'%</td><td class="n">'+Math.round(o.truncation*100)+'%</td><td class="n">'+o.distance.toFixed(1)+' m</td></tr>').join('');
  document.querySelectorAll('.strip img').forEach(el => el.classList.toggle('cur', +el.dataset.i === idx));
  document.getElementById('tMask').classList.toggle('on', showMask); document.getElementById('tBoxes').classList.toggle('on', showBoxes);
}
function step(d){ const l = visible(); const p = l.indexOf(idx); idx = l[(p + d + l.length) % l.length]; draw(); }
document.getElementById('prev').onclick = () => step(-1); document.getElementById('next').onclick = () => step(1);
document.getElementById('tMask').onclick = () => { showMask = !showMask; draw(); };
document.getElementById('tBoxes').onclick = () => { showBoxes = !showBoxes; draw(); };
fc.onchange = e => { cond = e.target.value; strip(); draw(); };
document.getElementById('fCls').onchange = e => { cls = e.target.value; draw(); };
addEventListener('keydown', e => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); if (e.key === 'm') { showMask = !showMask; draw(); } });
function strip(){ const s = document.getElementById('strip'); s.innerHTML = visible().slice(0,400).map(i => '<img loading="lazy" data-i="'+i+'" src="image_2/'+F[i].name+'.png">').join(''); s.querySelectorAll('img').forEach(el => el.onclick = () => { idx = +el.dataset.i; draw(); }); }
// Heatmap of normalised box centres.
(function(){ const c = document.getElementById('heat'), g = c.getContext('2d'), W = 64, H = 36, bins = new Float32Array(W*H);
  for (const f of F) for (const o of f.objects) { const x = ((o.bbox[0]+o.bbox[2])/2)/f.width, y = ((o.bbox[1]+o.bbox[3])/2)/f.height; bins[Math.min(H-1,Math.floor(y*H))*W + Math.min(W-1,Math.floor(x*W))]++; }
  const max = Math.max(1, ...bins); const cw = c.width/W, ch = c.height/H; g.fillStyle = '#0b0714'; g.fillRect(0,0,c.width,c.height);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) { const v = bins[y*W+x]/max; if (!v) continue; g.fillStyle = 'rgba(255,'+Math.round(80+120*v)+','+Math.round(160-100*v)+','+(0.15+0.85*Math.sqrt(v))+')'; g.fillRect(x*cw,y*ch,cw+.5,ch+.5); } })();
function bars(id, values, labels, color){ const c = document.getElementById(id), g = c.getContext('2d'); const max = Math.max(1,...values); const bw = c.width/values.length; g.clearRect(0,0,c.width,c.height);
  values.forEach((v,i) => { const h = (c.height-18)*v/max; g.fillStyle = color; g.fillRect(i*bw+1, c.height-16-h, bw-2, h); });
  g.fillStyle = '#a99bc4'; g.font = '10px ui-sans-serif,system-ui'; labels.forEach((l,i) => { if (l !== '') g.fillText(l, i*bw+2, c.height-4); }); }
(function(){ const per = F.map(f => f.objects.length), max = Math.max(1, ...per), n = Math.min(25, max+1), h = new Array(n).fill(0);
  per.forEach(p => h[Math.min(n-1, Math.floor(p/(max+1)*n))]++); bars('hist', h, h.map((_,i)=> i%4===0 ? String(Math.round(i*(max+1)/n)) : ''), '#ff4fa3'); })();
(function(){ const h = new Array(10).fill(0); F.forEach(f => f.objects.forEach(o => h[Math.min(9, Math.floor(o.occlusion*10))]++)); bars('occ', h, h.map((_,i)=> i%2===0 ? i*10+'%' : ''), '#4fd1ff'); })();
document.getElementById('conds').innerHTML = Object.entries(S.byConditions).sort((a,b)=>b[1]-a[1]).map(([k,v]) => '<tr><td>'+k+'</td><td class="n">'+v+' images</td></tr>').join('') + Object.entries(S.byCamera).map(([k,v]) => '<tr><td>'+k+' camera</td><td class="n">'+v+'</td></tr>').join('');
strip(); draw();
</script></body></html>`;
