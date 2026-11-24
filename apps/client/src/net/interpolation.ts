import { INTERPOLATION_DELAY_MS } from "@neon-bay/shared";

export interface Sample {
  t: number; // receive time, ms (performance.now)
  x: number;
  y: number;
  z: number;
  heading: number;
}

const MAX_SAMPLES = 32;

/** Buffer of server snapshots for one remote entity, rendered INTERPOLATION_DELAY_MS in the past. */
export class SnapshotBuffer {
  private samples: Sample[] = [];

  push(s: Sample): void {
    const last = this.samples[this.samples.length - 1];
    // Skip duplicates so a stationary entity doesn't flood the buffer.
    if (last && last.x === s.x && last.y === s.y && last.z === s.z && last.heading === s.heading) {
      last.t = s.t;
      return;
    }
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  latest(): Sample | undefined {
    return this.samples[this.samples.length - 1];
  }

  /** Interpolated state at `now - delay`. Clamps to the oldest/newest sample outside the buffer. */
  sample(now: number, delay = INTERPOLATION_DELAY_MS): Sample | undefined {
    const at = now - delay;
    const s = this.samples;
    if (s.length === 0) return undefined;
    if (at <= s[0]!.t) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1]!;
      const b = s[i]!;
      if (at >= a.t && at <= b.t) {
        const k = b.t === a.t ? 1 : (at - a.t) / (b.t - a.t);
        let dh = b.heading - a.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        return { t: at, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, heading: a.heading + dh * k };
      }
    }
    return s[s.length - 1];
  }
}
