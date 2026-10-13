/**
 * Tuning numbers in one place. Units: pixels of a 1920x1080 virtual screen and seconds.
 * Units and weapons have their own tables in data/units.ts and data/weapons.ts.
 * The player sprite is ~96 px tall at 1080p (see the design doc), the collision circle is smaller.
 */
export const CONFIG = {
  room: { width: 1800, height: 1100, wall: 48, door: 150 },

  player: {
    radius: 20,
    speed: 300,
    hitInvuln: 1.0,
    hitKnockback: 40, // px the player is shoved when hit
  },

  /** "Rozpad w mgłę" (dodge on the right mouse button). */
  dodge: { duration: 0.38, speedMul: 2.3, cooldown: 0.7 },

  /** Crits: a lucky shot hits this much harder (an ambush is always a crit). */
  crit: { mul: 1.75 },

  /** Pews, tables and coffins topple into cover; tombs and crates always stop bullets; barrels blow up. */
  cover: { hp: 14, stoneHp: 30, barrelHp: 3, flipRange: 70 },
  barrel: { blastRadius: 130, blastDamage: 12, fireRadius: 90, fireTime: 6, oilRadius: 130 },

  enemyBulletDamage: 1, // halves
  contactDamage: 1,
  /** Damage an enemy bullet deals to a minion. */
  hitOnMinion: 3,

  /** Elite guards (mini-bosses): tougher, bigger, they drop weapon remains. */
  elite: { hpMul: 2.6, sizeMul: 1.2 },

  /** Necromancy: souls, raising the dead, minions. */
  necro: {
    soulLife: 6, // seconds a soul hovers over the corpse before fading
    soulPickup: 42, // walk this close to collect it
    echo: 6, // seconds a fresh corpse can still be raised
    raiseRange: 100,
    minionLifetime: 30, // seconds before a minion crumbles
    miniLifetime: 12, // ash-grimoire minis
    maxRaises: 2, // a corpse can be raised, fall, and be raised once more
    commandTime: 4, // seconds minions obey the Q order
    commandRadius: 220, // they engage enemies this close to the ordered point
    followDistance: 110,
    abominationCorpses: 3, // corpses stitched into an abomination
    abominationCost: 3, // souls
    abominationRange: 170,
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
    lightDamageMul: 0.75, // minions hit softer in light (the necromancer's own value is in his stats)
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
    brazier: { radius: 260, hp: 2, hit: 26, lift: 22 },
    pyre: { radius: 300, hp: 3, hit: 34, lift: 40 }, // the Church's stake: holy fire
    window: { radius: 220, hp: 0, hit: 0, lift: 0 }, // can't be put out, only broken
    lantern: { radius: 150, hp: 0, hit: 0, lift: 0 },
    censer: { radius: 170, hp: 0, hit: 0, lift: 0 }, // incense smoke that drives the dark away
    carried: { radius: 170, hp: 0, hit: 0, lift: 0 }, // a torch in a peasant's hand
    fire: { radius: 160, hp: 0, hit: 0, lift: 0 }, // burning oil and flasks
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

  /** Pickups and the economy. */
  loot: {
    magnet: 150, // gold flies to you from this far
    pickupRange: 46,
    interactRange: 90,
    ammoDropChance: 0.12,
    keyDropChance: 0.03,
    heartDropChance: 0.03,
    roomRewardChance: 0.35, // a cleared room leaves something behind
    ammoShare: 0.3, // a small ammo pickup refills this share of the current weapon
    chestBreakRuin: 0.5, // chance a smashed chest's contents are ruined
    mimicChance: 0.07,
    priceRise: 0.12, // shop prices grow this much per floor
  },

  /** Legends' curses. */
  curses: { heavySpeedMul: 0.85, slowReloadMul: 1.3 },

  /** The witch's rope (and the hangman's rope relic). */
  rope: { range: 520, cooldown: 4, stun: 1 },
} as const;
