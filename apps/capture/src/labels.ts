// Label formats written by the capture tool.

import type { CaptureFrame, CaptureObject, LabelClass } from "@neon-bay/shared";

export type { CaptureFrame, CaptureObject, LabelClass };

/** KITTI occlusion levels: 0 fully visible, 1 partly occluded, 2 largely occluded. */
export function kittiOccluded(fraction: number): 0 | 1 | 2 {
  return fraction < 0.1 ? 0 : fraction < 0.5 ? 1 : 2;
}

const f2 = (n: number) => n.toFixed(2);

/** One KITTI object-detection label line per object. */
export function kittiLines(objects: CaptureObject[]): string {
  return objects
    .map((o) =>
      [
        o.cls,
        f2(o.truncation),
        kittiOccluded(o.occlusion),
        f2(o.alpha),
        ...o.bbox.map(f2),
        ...o.dimensions.map(f2),
        ...o.location.map(f2),
        f2(o.rotationY),
      ].join(" "),
    )
    .join("\n");
}

export interface CocoDataset {
  info: { description: string; date_created: string; seed: number };
  images: { id: number; file_name: string; width: number; height: number; conditions: string; camera_mode: string }[];
  annotations: { id: number; image_id: number; category_id: number; bbox: [number, number, number, number]; area: number; iscrowd: 0; occlusion: number; truncation: number; distance: number; instance: string }[];
  categories: { id: number; name: LabelClass }[];
}

export const CATEGORIES: CocoDataset["categories"] = [
  { id: 1, name: "Car" },
  { id: 2, name: "Pedestrian" },
];

export function addToCoco(coco: CocoDataset, frame: CaptureFrame, fileName: string): void {
  coco.images.push({ id: frame.index, file_name: fileName, width: frame.width, height: frame.height, conditions: frame.conditions, camera_mode: frame.camera.mode });
  for (const o of frame.objects) {
    const [x1, y1, x2, y2] = o.bbox;
    coco.annotations.push({
      id: coco.annotations.length + 1,
      image_id: frame.index,
      category_id: CATEGORIES.find((c) => c.name === o.cls)!.id,
      bbox: [x1, y1, x2 - x1, y2 - y1],
      area: o.visiblePixels,
      iscrowd: 0,
      occlusion: o.occlusion,
      truncation: o.truncation,
      distance: o.distance,
      instance: o.id,
    });
  }
}
