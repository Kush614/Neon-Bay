// Gameplay and simulation constants shared by client, server and agents.

export const TICK_RATE_HZ = 20;
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
