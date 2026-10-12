/**
 * Tuning numbers in one place. Units: pixels of a 1920x1080 virtual screen and seconds.
 * The player sprite is ~96 px tall at 1080p (see the design doc), the collision circle is smaller.
 */
export const CONFIG = {
  room: { width: 1800, height: 1100, wall: 48 },

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
} as const;
