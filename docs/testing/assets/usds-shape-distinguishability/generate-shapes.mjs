// Generates a static HTML artifact rendering all 10 marker shapes from
// docs/plans/usds-dataviz-color-scheme.md, at chart scale (size=4, ~8px)
// and legend scale (size=5, ~10px), in both light and dark palette colors,
// and under a grayscale (achromatopsia-approximation) CSS filter - for a
// real, screenshot-verified visual distinguishability pass (Testing task
// 11). Geometry mirrors the plan's stated shape descriptions (illustrative
// for this verification pass only - Implementation retains freedom in
// exact coordinates as long as shapes stay distinct).
//
// Reference/reproduction script, not wired into any build or test runner -
// kept alongside the screenshots it produced (see
// ../../usds-shape-distinguishability-pass.md) as a record of exactly how
// they were generated. Re-running it requires adjusting the hardcoded
// /tmp output path below and then screenshotting the resulting HTML
// (e.g. via `npx playwright screenshot`) - it was originally run from
// `frontend/` so Playwright's locally-installed Chromium build was used.

const LIGHT_SERIES = [
  ["#9F1239", "wine circle"],
  ["#C2410C", "orange square"],
  ["#854D0E", "amber triangle-up"],
  ["#15803D", "green diamond"],
  ["#0F766E", "teal plus"],
  ["#0369A1", "azure star"],
  ["#4338CA", "indigo triangle-down"],
  ["#A21CAF", "magenta cross"],
  ["#334155", "slate circle-hollow"],
  ["#7C2D12", "brown square-hollow"],
];

const DARK_SERIES = [
  ["#E8879E", "wine circle"],
  ["#FDBA74", "orange square"],
  ["#FCD34D", "amber triangle-up"],
  ["#86EFAC", "green diamond"],
  ["#5EEAD4", "teal plus"],
  ["#7DD3FC", "azure star"],
  ["#818CF8", "indigo triangle-down"],
  ["#F0ABFC", "magenta cross"],
  ["#CBD5E1", "slate circle-hollow"],
  ["#D2B48C", "brown square-hollow"],
];

const SHAPES = [
  "circle",
  "square",
  "triangle-up",
  "diamond",
  "plus",
  "star",
  "triangle-down",
  "cross",
  "circle-hollow",
  "square-hollow",
];

function starPoints(cx, cy, outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function shapeMarkup(shape, cx, cy, size, color) {
  switch (shape) {
    case "circle":
      return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="${color}"/>`;
    case "square":
      return `<rect x="${cx - size}" y="${cy - size}" width="${size * 2}" height="${size * 2}" fill="${color}"/>`;
    case "triangle-up":
      return `<polygon points="${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}" fill="${color}"/>`;
    case "diamond":
      return `<polygon points="${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}" fill="${color}"/>`;
    case "plus": {
      const arm = size * 0.6;
      return (
        `<rect x="${cx - arm / 2}" y="${cy - size}" width="${arm}" height="${size * 2}" fill="${color}"/>` +
        `<rect x="${cx - size}" y="${cy - arm / 2}" width="${size * 2}" height="${arm}" fill="${color}"/>`
      );
    }
    case "star":
      return `<polygon points="${starPoints(cx, cy, size, size * 0.4)}" fill="${color}"/>`;
    case "triangle-down":
      return `<polygon points="${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}" fill="${color}"/>`;
    case "cross": {
      const arm = size * 0.6;
      return `<g transform="rotate(45 ${cx} ${cy})"><rect x="${cx - arm / 2}" y="${cy - size}" width="${arm}" height="${size * 2}" fill="${color}"/><rect x="${cx - size}" y="${cy - arm / 2}" width="${size * 2}" height="${arm}" fill="${color}"/></g>`;
    }
    case "circle-hollow":
      return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="none" stroke="${color}" stroke-width="${size * 0.35}"/>`;
    case "square-hollow":
      return `<rect x="${cx - size}" y="${cy - size}" width="${size * 2}" height="${size * 2}" fill="none" stroke="${color}" stroke-width="${size * 0.35}"/>`;
    default:
      return "";
  }
}

function row(series, size, cardColor, grayscale, label, rowId) {
  const cellW = 64;
  const svgs = SHAPES.map((shape, i) => {
    const color = series[i][0];
    const cx = cellW / 2;
    const cy = 24;
    return `<div style="display:inline-block;width:${cellW}px;text-align:center;">
      <svg width="${cellW}" height="48" style="background:${cardColor};${grayscale ? "filter:grayscale(1);" : ""}">
        ${shapeMarkup(shape, cx, cy, size, color)}
      </svg>
      <div style="font:10px monospace;color:#888;">${shape}</div>
    </div>`;
  }).join("\n");
  return `<div id="${rowId}" style="margin-bottom:8px;display:inline-block;"><div style="font:12px sans-serif;font-weight:bold;">${label}</div><div>${svgs}</div></div>`;
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>USDS 10-shape distinguishability check</title></head>
<body style="font-family:sans-serif;padding:16px;background:#FAF7F8;">
<h1 style="font-size:16px;">USDS dataviz 10-shape distinguishability - light mode</h1>
${row(LIGHT_SERIES, 4, "#FFFFFF", false, "Light mode, chart scale (size=4, ~8px)", "row-light-chart")}
${row(LIGHT_SERIES, 5, "#FFFFFF", false, "Light mode, legend scale (size=5, ~10px)", "row-light-legend")}
${row(LIGHT_SERIES, 4, "#FFFFFF", true, "Light mode, chart scale, GRAYSCALE (achromatopsia approximation)", "row-light-chart-gray")}
${row(LIGHT_SERIES, 5, "#FFFFFF", true, "Light mode, legend scale, GRAYSCALE (achromatopsia approximation)", "row-light-legend-gray")}
<h1 style="font-size:16px;">USDS dataviz 10-shape distinguishability - dark mode</h1>
<div style="background:#201A1E;padding:8px;">
${row(DARK_SERIES, 4, "#2B232A", false, "Dark mode, chart scale (size=4, ~8px)", "row-dark-chart")}
${row(DARK_SERIES, 5, "#2B232A", false, "Dark mode, legend scale (size=5, ~10px)", "row-dark-legend")}
${row(DARK_SERIES, 4, "#2B232A", true, "Dark mode, chart scale, GRAYSCALE (achromatopsia approximation)", "row-dark-chart-gray")}
${row(DARK_SERIES, 5, "#2B232A", true, "Dark mode, legend scale, GRAYSCALE (achromatopsia approximation)", "row-dark-legend-gray")}
</div>
</body></html>`;

import { writeFileSync } from "node:fs";
writeFileSync("/tmp/usds-shape-check/shapes.html", html);
console.log("written");
