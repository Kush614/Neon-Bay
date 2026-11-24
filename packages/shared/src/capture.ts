// Synthetic-data capture (opt-in demo, outside the SPEC milestones). Shared by the client's
// capture rig, which produces frames, and apps/capture, which writes them to disk.

export type LabelClass = "Car" | "Pedestrian";

export interface CaptureObject {
  id: string;
  cls: LabelClass;
  /** Tight 2D box from visible pixels: [x1, y1, x2, y2] in image pixels, origin top-left. */
  bbox: [number, number, number, number];
  visiblePixels: number;
  /** Pixels the object would cover with nothing in front of it. */
  fullPixels: number;
  /** Fraction hidden by other objects, 0 to 1. */
  occlusion: number;
  /** Fraction of the projected 3D box outside the image, 0 to 1. */
  truncation: number;
  distance: number;
  /** KITTI camera coordinates (x right, y down, z forward) of the object's bottom centre, metres. */
  location: [number, number, number];
  /** KITTI order: height, width, length (metres). */
  dimensions: [number, number, number];
  rotationY: number;
  alpha: number;
}

export interface CaptureFrame {
  index: number;
  conditions: string;
  camera: { mode: string; position: [number, number, number]; target: [number, number, number]; fov: number };
  width: number;
  height: number;
  /** PNG data URLs. */
  rgb: string;
  mask: string;
  objects: CaptureObject[];
  renderMs: number;
}

/** What the client exposes on `window.__neonBayCapture` in capture mode. */
export interface CaptureApi {
  frame: (index: number) => Promise<CaptureFrame>;
  labelledCount: () => number;
}
