import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MarkerGlyph, renderMarkerShape } from "./markerShapes";
import type { MarkerShapeName } from "./seriesStyles";

// Testing task 4 (docs/plans/usds-dataviz-color-scheme.md, section 7): the
// 10-shape marker set (6 pre-existing filled shapes + 4 new ones -
// triangle-down, cross, circle-hollow, square-hollow). New file - no prior
// markerShapes test existed. `renderMarkerShape`'s new shape names
// (triangle-down/cross/circle-hollow/square-hollow) don't exist on
// `MarkerShapeName` yet (still the 6-name union pre-Implementation), so
// every reference to them below is a genuine TypeScript error until
// Implementation task 3 extends the union - the same "red, not just at
// runtime" shape as MultiSeriesTrendChart.buildChartData.test.ts's
// not-yet-exported `buildChartData` import. `as MarkerShapeName` casts on
// the 4 new literals make that explicit rather than silently suppressing it.
const COLOR = "#123456";

// Renders a shape's raw SVG primitive wrapped in a real <svg> root so
// jsdom/RTL can query it as it would appear embedded in Recharts' own
// canvas or the legend's small standalone <svg viewBox>.
function renderShape(shape: MarkerShapeName, size = 4) {
  return render(<svg>{renderMarkerShape(shape, { cx: 10, cy: 10, size, color: COLOR })}</svg>);
}

const ALL_TEN_SHAPES: MarkerShapeName[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "plus",
  "star",
  "triangle-down" as MarkerShapeName,
  "cross" as MarkerShapeName,
  "circle-hollow" as MarkerShapeName,
  "square-hollow" as MarkerShapeName,
];

describe("renderMarkerShape: full 10-shape set", () => {
  it("renders something (not null/undefined) for all 10 shapes, including the 4 new ones", () => {
    ALL_TEN_SHAPES.forEach((shape) => {
      const { container } = renderShape(shape);
      expect(container.querySelector("svg")?.children.length).toBeGreaterThan(0);
    });
  });

  it("renders every shape using the given color somewhere in its subtree (fill or stroke)", () => {
    ALL_TEN_SHAPES.forEach((shape) => {
      const { container } = renderShape(shape);
      const usesColor = Array.from(container.querySelectorAll("*")).some(
        (el) => el.getAttribute("fill") === COLOR || el.getAttribute("stroke") === COLOR,
      );
      expect(usesColor, `shape "${shape}" should render using color ${COLOR}`).toBe(true);
    });
  });

  describe("pre-existing filled shapes (unchanged geometry)", () => {
    it("renders circle as a filled <circle>", () => {
      const { container } = renderShape("circle");
      const circle = container.querySelector("circle");
      expect(circle).not.toBeNull();
      expect(circle?.getAttribute("fill")).toBe(COLOR);
    });

    it("renders square as a filled <rect>", () => {
      const { container } = renderShape("square");
      const rect = container.querySelector("rect");
      expect(rect).not.toBeNull();
      expect(rect?.getAttribute("fill")).toBe(COLOR);
    });

    it("renders triangle as a filled <polygon>", () => {
      const { container } = renderShape("triangle");
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("fill")).toBe(COLOR);
    });

    it("renders diamond as a filled <polygon>", () => {
      const { container } = renderShape("diamond");
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("fill")).toBe(COLOR);
    });

    it("renders plus as two filled rects (cross-arms)", () => {
      const { container } = renderShape("plus");
      const rects = container.querySelectorAll("rect");
      expect(rects.length).toBeGreaterThanOrEqual(2);
      rects.forEach((rect) => expect(rect.getAttribute("fill")).toBe(COLOR));
    });

    it("renders star as a filled <polygon>", () => {
      const { container } = renderShape("star");
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("fill")).toBe(COLOR);
    });
  });

  describe("new shape: triangle-down", () => {
    it("renders as a filled <polygon>", () => {
      const { container } = renderShape("triangle-down" as MarkerShapeName);
      const polygon = container.querySelector("polygon");
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute("fill")).toBe(COLOR);
    });

    it("uses different point coordinates from the upward triangle (genuinely inverted, not a copy)", () => {
      const upPoints = renderShape("triangle")
        .container.querySelector("polygon")
        ?.getAttribute("points");
      const downPoints = renderShape("triangle-down" as MarkerShapeName)
        .container.querySelector("polygon")
        ?.getAttribute("points");

      expect(upPoints).toBeTruthy();
      expect(downPoints).toBeTruthy();
      expect(downPoints).not.toBe(upPoints);
    });
  });

  describe("new shape: cross", () => {
    it("renders distinct markup from the plus shape (not an accidental reuse)", () => {
      const plusHtml = renderShape("plus").container.querySelector("svg")?.innerHTML;
      const crossHtml = renderShape("cross" as MarkerShapeName).container.querySelector(
        "svg",
      )?.innerHTML;

      expect(plusHtml).toBeTruthy();
      expect(crossHtml).toBeTruthy();
      expect(crossHtml).not.toBe(plusHtml);
    });
  });

  describe('new hollow shapes: fill="none" + stroke (plan\'s explicit geometry)', () => {
    it('renders circle-hollow as a single <circle fill="none" stroke=color>', () => {
      const { container } = renderShape("circle-hollow" as MarkerShapeName);
      const circle = container.querySelector("circle");
      expect(circle).not.toBeNull();
      expect(circle?.getAttribute("fill")).toBe("none");
      expect(circle?.getAttribute("stroke")).toBe(COLOR);
    });

    it('renders square-hollow as a single <rect fill="none" stroke=color>', () => {
      const { container } = renderShape("square-hollow" as MarkerShapeName);
      const rect = container.querySelector("rect");
      expect(rect).not.toBeNull();
      expect(rect?.getAttribute("fill")).toBe("none");
      expect(rect?.getAttribute("stroke")).toBe(COLOR);
    });

    it("scales the hollow stroke width with `size` rather than using a fixed constant", () => {
      const chartScale = renderShape("circle-hollow" as MarkerShapeName, 4).container.querySelector(
        "circle",
      );
      const legendScale = renderShape(
        "circle-hollow" as MarkerShapeName,
        5,
      ).container.querySelector("circle");

      const chartStrokeWidth = Number(chartScale?.getAttribute("stroke-width"));
      const legendStrokeWidth = Number(legendScale?.getAttribute("stroke-width"));

      expect(Number.isNaN(chartStrokeWidth)).toBe(false);
      expect(Number.isNaN(legendStrokeWidth)).toBe(false);
      expect(legendStrokeWidth).toBeGreaterThan(chartStrokeWidth);
    });

    it("crossing content can show through a hollow marker (fill=none, not just a visually-transparent fill)", () => {
      const { container } = renderShape("square-hollow" as MarkerShapeName);
      const rect = container.querySelector("rect");
      // Explicitly "none", not e.g. "transparent" or a low-opacity fill -
      // the plan's stated reason a hollow marker lets crossing lines show
      // through in dense charts.
      expect(rect?.getAttribute("fill")).toBe("none");
    });
  });

  it("gives every one of the 10 shapes visually distinct markup (no two shapes render identical SVG)", () => {
    const htmls = ALL_TEN_SHAPES.map(
      (shape) => renderShape(shape).container.querySelector("svg")?.innerHTML,
    );
    expect(new Set(htmls).size).toBe(ALL_TEN_SHAPES.length);
  });
});

describe("MarkerGlyph", () => {
  it("renders each of the 10 shapes at legend scale without throwing", () => {
    ALL_TEN_SHAPES.forEach((shape) => {
      expect(() => render(<MarkerGlyph shape={shape} color={COLOR} size={5} />)).not.toThrow();
    });
  });

  it("stays aria-hidden (its accessible name is the legend's worded text, not the glyph)", () => {
    const { container } = render(<MarkerGlyph shape="circle" color={COLOR} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("sizes its viewport from the `size` prop (viewport = size*2+2, matching the pre-existing 6-shape convention)", () => {
    const { container } = render(<MarkerGlyph shape="circle" color={COLOR} size={5} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "12");
    expect(svg).toHaveAttribute("height", "12");
  });

  it("renders a hollow shape's fill=none/stroke=color glyph at legend scale", () => {
    const { container } = render(
      <MarkerGlyph shape={"circle-hollow" as MarkerShapeName} color={COLOR} size={5} />,
    );
    const circle = container.querySelector("circle");
    expect(circle?.getAttribute("fill")).toBe("none");
    expect(circle?.getAttribute("stroke")).toBe(COLOR);
  });
});
