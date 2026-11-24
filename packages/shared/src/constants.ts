// Gameplay and simulation constants shared by client, server and agents.

export const TICK_RATE_HZ = 20;
/** Physics sub-steps per server tick, so the server integrates at the client's 60 Hz. */
export const SUBSTEPS_PER_TICK = 3;
export const PATCH_RATE_HZ = 20;
export const INTERPOLATION_DELAY_MS = 100;

export const WALK_SPEED = 4.5; // m/s
export const RUN_SPEED = 8; // m/s
/** Carrying a bag moves a player at 80% speed (SPEC.md section 11). */
export const BAG_SPEED_FACTOR = 0.8;
export const GRAVITY = -20; // m/s^2
export const MAX_FALL_SPEED = 40;

export const CHARACTER_RADIUS = 0.4;
/** Half the height of the capsule's cylindrical section. */
export const CHARACTER_HALF_HEIGHT = 0.5;
/** Centre height of the capsule when standing on the ground. */
export const CHARACTER_CENTER_Y = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS;

// Phases (SPEC.md section 11). Durations in seconds; lobby lasts until enough humans are ready.
export const PHASE_ORDER = ["lobby", "plan", "prepare", "heist", "getaway", "payout", "ended"] as const;
export const PHASE_SECONDS = { plan: 90, prepare: 120, heist: 180, getaway: 90, payout: 30 } as const;
export const MIN_HUMANS_TO_START = 2;

// Heist rules.
export const VAULT_SECONDS_HACKER = 20;
export const VAULT_SECONDS_OTHER = VAULT_SECONDS_HACKER * 3;
export const VAULT_RADIUS = 2.5;
export const VAULT_BAGS = 4;
export const BAG_VALUE = 50_000;
export const MARINA_RADIUS = 7;

// Vehicles: arcade handling, no gears or damage.
export const CAR_MAX_SPEED = 20; // m/s
export const CAR_MAX_REVERSE = 6;
export const CAR_ACCEL = 9;
export const CAR_BRAKE = 18;
export const CAR_DRAG = 2.5;
export const CAR_STEER_RATE = 1.8; // rad/s at speed
export const CAR_ENTER_RADIUS = 4;
