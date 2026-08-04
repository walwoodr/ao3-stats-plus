// Wraps the already-rendered real-geometry rows (shapes.html, produced from
// the actual markerShapes.tsx/seriesStyles.ts/colorTokens.ts) into a full
// comparison page: each of the 4 base rows (light/dark x chart/legend
// scale) repeated under 4 filters - none (baseline), CSS grayscale(1)
// (achromatopsia approximation, same technique Testing's illustrative pass
// used), and SVG feColorMatrix filters for protanopia/deuteranopia using
// the SAME Machado-2009 matrices already hardcoded (and EXTERNAL-UNVERIFIED
// - tagged) in colorTokens.cvd.test.ts - this is the same math Chrome
// DevTools' "Emulate vision deficiencies" panel is documented to use, so
// applying it here approximates that panel without requiring an actual
// live DevTools session. Tritanopia is checked via the automated ΔE gate
// already (colorTokens.cvd.test.ts) and is not the decisive case for shape
// (achromatopsia is, per the plan) - protan/deutan are included here as the
// two color-CVD spot checks most likely to visually compress hue
// differences; achromatopsia (grayscale) is the primary shape-only check.
import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync("/tmp/usds-manual-cvd-pass/shapes.html", "utf8");

function extractRow(id) {
  const marker = `id="${id}"`;
  const start = raw.indexOf(marker);
  const divStart = raw.lastIndexOf("<div", start);
  // Find the matching closing </div> for this top-level row div by counting.
  let depth = 0;
  let i = divStart;
  while (i < raw.length) {
    if (raw.startsWith("<div", i)) {
      depth += 1;
      i += 4;
    } else if (raw.startsWith("</div>", i)) {
      depth -= 1;
      i += 6;
      if (depth === 0) break;
    } else {
      i += 1;
    }
  }
  return raw.slice(divStart, i);
}

const ROWS = [
  ["row-light-chart", "Light, chart scale (size=4, ~8px)"],
  ["row-light-legend", "Light, legend scale (size=5, ~10px)"],
  ["row-dark-chart", "Dark, chart scale (size=4, ~8px)"],
  ["row-dark-legend", "Dark, legend scale (size=5, ~10px)"],
];

const FILTERS = [
  ["none", "Baseline (no filter)"],
  ["grayscale(1)", "Achromatopsia approximation (CSS grayscale) - the decisive case"],
  ["url(#protanopia)", "Protanopia (Machado-2009 matrix, same as colorTokens.cvd.test.ts)"],
  ["url(#deuteranopia)", "Deuteranopia (Machado-2009 matrix, same as colorTokens.cvd.test.ts)"],
  ["url(#tritanopia)", "Tritanopia (Machado-2009 matrix, same as colorTokens.cvd.test.ts)"],
];

// Same coefficients as colorTokens.cvd.test.ts's CVD_MATRICES (3x3, applied
// directly here to sRGB via feColorMatrix rather than linearized - the
// standard CSS/SVG filter approach, distinct from the automated test's
// linear-light + Lab pipeline, which is why this is a visual approximation
// pass and not a substitute for that numeric gate).
const SVG_DEFS = `<svg width="0" height="0" style="position:absolute">
<defs>
<filter id="protanopia"><feColorMatrix type="matrix" values="
0.152286 1.052583 -0.204868 0 0
0.114503 0.786281 0.099216 0 0
-0.003882 -0.048116 1.051998 0 0
0 0 0 1 0"/></filter>
<filter id="deuteranopia"><feColorMatrix type="matrix" values="
0.367322 0.860646 -0.227968 0 0
0.280085 0.672501 0.047413 0 0
-0.01182 0.04294 0.968881 0 0
0 0 0 1 0"/></filter>
<filter id="tritanopia"><feColorMatrix type="matrix" values="
1.255528 -0.076749 -0.178779 0 0
-0.078411 0.930809 0.147602 0 0
0.004733 0.691367 0.3039 0 0
0 0 0 1 0"/></filter>
</defs>
</svg>`;

let body = SVG_DEFS;
for (const [rowId, rowLabel] of ROWS) {
  const rowHtml = extractRow(rowId);
  body += `<section style="margin-bottom:24px;"><h2 style="font:13px sans-serif;">${rowLabel}</h2>`;
  for (const [filter, filterLabel] of FILTERS) {
    body += `<div style="margin-bottom:6px;">
      <div style="font:10px monospace;color:#555;">${filterLabel}</div>
      <div style="filter:${filter};display:inline-block;">${rowHtml}</div>
    </div>`;
  }
  body += `</section>`;
}

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#FAF7F8;padding:16px;">${body}</body></html>`;
writeFileSync("/tmp/usds-manual-cvd-pass/filtered.html", page);
console.log("written filtered.html");
