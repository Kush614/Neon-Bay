import { describe, expect, it } from "vitest";
import { addToCoco, CATEGORIES, kittiLines, kittiOccluded, type CaptureFrame, type CocoDataset } from "./labels.js";

const frame: CaptureFrame = {
  index: 3,
  conditions: "dusk",
  camera: { mode: "street", position: [0, 1.5, 0], target: [0, 1, 10], fov: 60 },
  width: 960,
  height: 540,
  rgb: "",
  mask: "",
  renderMs: 5,
  objects: [
    { id: "car_saltwind", cls: "Car", bbox: [100, 200, 180, 250], visiblePixels: 3000, fullPixels: 4000, occlusion: 0.25, truncation: 0, distance: 12.3, location: [1.5, 1.6, 12.2], dimensions: [1.4, 2, 4.4], rotationY: -1.57, alpha: -1.69 },
  ],
};

describe("capture labels", () => {
  it("maps occlusion fractions onto KITTI's levels", () => {
    expect([0, 0.09, 0.1, 0.49, 0.5, 0.95].map(kittiOccluded)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("writes KITTI's 15 fields per object", () => {
    const line = kittiLines(frame.objects);
    expect(line.split(" ")).toHaveLength(15);
    expect(line).toBe("Car 0.00 1 -1.69 100.00 200.00 180.00 250.00 1.40 2.00 4.40 1.50 1.60 12.20 -1.57");
  });

  it("writes COCO boxes as x, y, width, height", () => {
    const coco: CocoDataset = { info: { description: "", date_created: "", seed: 1 }, images: [], annotations: [], categories: CATEGORIES };
    addToCoco(coco, frame, "image_2/000003.png");
    expect(coco.images[0]).toMatchObject({ id: 3, conditions: "dusk" });
    expect(coco.annotations[0]).toMatchObject({ image_id: 3, category_id: 1, bbox: [100, 200, 80, 50], area: 3000 });
  });
});
