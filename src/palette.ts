/** Game palette (see "Przewodnik stylu" in the design doc): ash, ink black, one ember accent. */
export const PAL = {
  ink: 0x0a0807,
  bg: 0x0a0807,

  floor: [0x2b2520, 0x2f2823, 0x272119, 0x332b24],
  floorLine: 0x120e0b,
  wall: 0x1a1512,
  wallTop: 0x3a3029,

  shroud: 0x7d756a,
  shroudMid: 0x4a443d,
  shroudHi: 0xada392,
  ember: 0xff6a1c,
  emberHot: 0xffd090,

  guardCoat: 0x6a2c1e, // city guard livery
  guardCoatMid: 0x3e1912,
  steel: 0x8c8a82,
  steelHi: 0xd2cfc4,
  wood: 0x7a5a38,
  woodMid: 0x4e3824,
  woodHi: 0xa88456,
  gunnerCoat: 0x3a4048,
  gunnerCoatMid: 0x22262c,

  minion: 0x5c5852, // raised dead: ash-grey flesh
  minionMid: 0x2e2b28,
  soul: 0xffe6b8,

  blood: 0x5e0d0a,
  bloodDark: 0x350605,
  smoke: 0x8a8278,

  iron: 0x3a3632, // candelabra, chandelier, torch brackets
  wax: 0xe8dcc0,
  /** Stained glass of the Church of the Holy Flame. */
  glass: [0xb8321e, 0x2a4f8c, 0xd8a83a, 0x6e2a7a] as const,
  holy: 0xf4e2a8,

  enemyBullet: 0xf2e2b0,
  playerBullet: 0xff8a3a,
  telegraph: 0xc8321e,

  hudText: 0xd8c8a8,
  hudDim: 0x979480,
  /** Switched off / already bought. */
  hudFaint: 0x787f6b,
  heart: 0x9e1f14,
  heartEmpty: 0x2a1a16,
} as const;
