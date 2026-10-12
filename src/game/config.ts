/**
 * Tuning numbers in one place. Units: pixels of a 1920x1080 virtual screen and seconds.
 * The player sprite is ~96 px tall at 1080p (see the design doc), the collision circle is smaller.
 */
export const CONFIG = {
  room: { width: 1800, height: 1100, wall: 48, door: 150 },

  player: {
    radius: 20,
    speed: 300,
    maxHalves: 6, // 3 hearts, each hit costs half a heart
    hitInvuln: 1.0,
    hitKnockback: 40, // px the player is shoved when hit
  },

  /** "Rozpad w mgłę" (dodge on the right mouse button). */
  dodge: { duration: 0.38, speedMul: 2.3, cooldown: 0.7 },

  /** Starting weapon: flintlock pistol. One shot, hits hard, slow reload. Infinite ammo. */
  flintlock: {
    capacity: 1,
    damage: 4,
    bulletSpeed: 1300,
    bulletRadius: 6,
    spread: 0.035, // radians
    reload: 1.6,
    recoil: 14, // px the shot shoves the player back
    knockback: 30, // px an enemy is shoved per hit
  },

  halberdier: {
    radius: 22,
    hp: 8,
    speed: 150,
    engageRange: 190,
    windup: 0.55,
    chargeTime: 0.4,
    chargeSpeed: 650,
    recover: 0.9,
  },

  arquebusier: {
    radius: 21,
    hp: 6,
    speed: 120,
    preferredRange: 430,
    reposition: [1.0, 1.8] as const,
    aim: 0.7,
    reload: 2.4,
    bulletSpeed: 420,
    bulletRadius: 9,
  },

  /** Church pews / tables that can be toppled into cover. */
  cover: { hp: 14, flipRange: 70 },

  enemyBulletDamage: 1, // halves
  contactDamage: 1,
  /** Damage a charging halberdier or an enemy bullet deals to a minion. */
  hitOnMinion: 3,

  /** Necromancy: souls, raising the dead, minions. */
  necro: {
    soulLife: 6, // seconds a soul hovers over the corpse before fading
    soulPickup: 42, // walk this close to collect it
    echo: 6, // seconds a fresh corpse can still be raised
    raiseRange: 100,
    raiseCost: 1, // souls
    minionLimit: 3,
    minionLifetime: 30, // seconds before a minion crumbles
    maxRaises: 2, // a corpse can be raised, fall, and be raised once more
    commandTime: 4, // seconds minions obey the Q order
    commandRadius: 220, // they engage enemies this close to the ordered point
    followDistance: 110,
  },

  /** Darkness, light and the ambush that opens a fight (design doc: "Mrok i zasadzka"). */
  darkness: {
    flashTime: 0.12,
    /** Every door opens into shadow: no fixed light reaches this close to the arrival point. */
    doorShadow: 100,
    seeDistance: 90, // guards notice anyone this close, light or not
    sightRange: 720, // ...and anyone standing in light within this range
    flashSight: 350, // a muzzle flash only gives you away to guards this close
    noiseRadius: 450, // toppling a pew wakes guards within this radius
    ambushMul: 2, // the first shot from the dark
    lightDamageMul: 0.75, // the necromancer and minions hit softer in light
    minionDarkDamageMul: 1.5,
    minionLightTakenMul: 1.5,
    minionDarkDecay: 0.5, // minions crumble slower in the dark...
    minionLightDecay: 1.5, // ...and faster in light
    burnDelay: 4, // seconds in HOLY light before it starts to burn the undead necromancer
    burnInterval: 3, // then half a heart this often
    patrolSpeedMul: 0.45,
  },

  /**
   * Light sources. Rooms are bright by default; the darkness is fought for by shooting them out.
   * radius: pool of light on the floor; hp: player bullets to put it out;
   * hit: hitbox radius; lift: how high above its floor point the hitbox (the flame) sits.
   */
  lights: {
    candle: { radius: 150, hp: 1, hit: 16, lift: 14 },
    candelabra: { radius: 270, hp: 2, hit: 24, lift: 34 },
    torch: { radius: 230, hp: 1, hit: 20, lift: 30 },
    chandelier: { radius: 330, hp: 2, hit: 34, lift: 150 },
    window: { radius: 220, hp: 0, hit: 0, lift: 0 }, // can't be put out, only broken
    lantern: { radius: 150, hp: 0, hit: 0, lift: 0 },
    flash: { radius: 220, hp: 0, hit: 0, lift: 0 }, // muzzle flash
  },
  /** A damaged light keeps this share of its radius at 1 hp left (fewer candles burning). */
  lightDamagedRadius: 0.75,
  /** Shooting the chandelier's chain: it falls and crushes everything under it. */
  chandelier: { fallTime: 0.45, crushRadius: 140, crushDamage: 12 },
  /** Stained glass: holy light that burns the undead. A shot breaks it: glass rains on the guards below. */
  window: { width: 150, shardDamage: 4, brokenRadiusMul: 0.85 },
  /** Chosen guards carry a taper and relight what the necromancer put out. */
  lamplighter: { range: 800, reach: 46, relightTime: 1.6 },
} as const;
