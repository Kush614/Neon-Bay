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
/** The car body rides this far above the ground; the collider starts here. */
export const CAR_CLEARANCE = 0.3;

// Money, laundering and the exchange (SPEC.md section 11).
/** Clean cash every non-cop player starts with, so stakes can be bought in prepare. */
export const STARTING_CLEAN_CASH = 10_000;
/** Laundering turns dirty cash into clean at this rate. */
export const LAUNDER_RATE = 0.8;
/** Laundering and trading happen within this distance of the nightclub or exchange entrance. */
export const VENUE_RADIUS = 8;
export const TIP_OFF_REWARD = 20_000;
export const TIP_OFF_REVEAL_SECONDS = 30;
/** Each 1,000 traded moves a stake price by this fraction. */
export const STAKE_IMPACT_PER_1000 = 0.01;
export const CRASH_CLEAN_CASH = 600_000;
export const CRASH_DROP = 0.7;
export const CRASH_SECONDS = 10;

// Police (SPEC.md section 11).
export const ARREST_RADIUS = 2;
export const ARREST_SECONDS = 3;
export const ARREST_OUT_SECONDS = 30;
/** A cop can start an arrest this far away; the server then chases the target. */
export const ARREST_START_RADIUS = 8;
/** An arrest attempt fails past this distance or after this long. */
export const ARREST_BREAK_RADIUS = 12;
export const ARREST_ATTEMPT_SECONDS = 12;
/** Burke's price (SPEC.md section 13). Rules accept any bribe; personas decide. */
export const BRIBE_THRESHOLD = 15_000;
export const ROADBLOCK_SECONDS = 60;
/** A roadblock must be placed within this distance of a road centreline. */
export const ROADBLOCK_ROAD_RADIUS = 6;
export const BACKUP_COOLDOWN_SECONDS = 30;
/** A dropped bag can be picked up from this close. */
export const BAG_PICKUP_RADIUS = 2.5;

/** In-game radio: one news bulletin every this many seconds once the plan phase starts. */
export const RADIO_INTERVAL_SECONDS = 45;
export const RADIO_STATION = "Velvet Static 96.6 FM";
