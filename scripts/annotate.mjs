// node scripts/annotate.mjs in.png out.png '[{"x":..,"y":..,"w":..,"h":..,"n":1,"t":"label"}]' [legend-title]
// Draws numbered callout boxes over a screenshot via an HTML/SVG overlay rendered by headless Chrome.
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
const [inp, out, json, title = ''] = process.argv.slice(2);
const calls = JSON.parse(json);
const b64 = readFileSync(inp).toString('base64');
const { width, height } = (() => { const b = readFileSync(inp); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; })();
const legendH = 26 + calls.length * 18;
const html = `<!doctype html><body style="margin:0;background:#0b0e11;font:13px ui-monospace,Menlo,monospace;color:#d7dde3">
<div style="position:relative;width:${width}px;height:${height + legendH}px">
<img src="data:image/png;base64,${b64}" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px">
<svg style="position:absolute;left:0;top:0" width="${width}" height="${height}">
${calls.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="#d29922" stroke-width="2" rx="4"/>
<circle cx="${c.x + c.w - 2}" cy="${c.y + 2}" r="11" fill="#d29922"/><text x="${c.x + c.w - 2}" y="${c.y + 7}" text-anchor="middle" font-size="13" font-weight="700" fill="#000">${c.n}</text>`).join('')}
</svg>
<div style="position:absolute;left:0;top:${height}px;width:${width}px;padding:4px 10px;border-top:1px solid #333">${title ? `<b style="color:#d29922">${title}</b><br>` : ''}
${calls.map(c => `<span style="display:inline-block;width:${Math.floor(width / 2) - 20}px"><b style="color:#d29922">${c.n}</b> ${c.t}</span>`).join('')}</div></div></body>`;
const tmp = resolve('/tmp/annot.html'); writeFileSync(tmp, html);
execSync(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=${width},${height + legendH} --screenshot=${resolve(out)} file://${tmp} 2>/dev/null`);
unlinkSync(tmp); console.log(out);
