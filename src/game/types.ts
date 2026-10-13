/**
 * Shared game types. No runtime code: every module of the simulation and the renderer
 * imports its vocabulary from here, so the systems can live in separate files.
 */
import type { Vec } from "./math.js";
import type { UnitKind, UnitDef } from "./data/units.js";
import type { WeaponId } from "./data/weapons.js";
import type { ItemId, RelicId, LegendId, CharacterId } from "./data/items.js";

export type { UnitKind, WeaponId, ItemId, RelicId, LegendId, CharacterId };

// ------------------------------------------------------------------ input
export interface InputState {
  /** Movement intent, each axis in -1..1. */
  move: Vec;
  /** Aim point in world coordinates. */
  aim: Vec;
  /** Fire button held. */
  shoot: boolean;
  /** Edge-triggered actions: true only on the step the key/button went down. */
  dodge: boolean;
  reload: boolean;
  flip: boolean;
  /** E: interact with what's nearby, otherwise raise the nearest fresh corpse. */
  interact: boolean;
  /** Q: send every minion to the aim point. */
  command: boolean;
  /** F: use the relic. */
  relic: boolean;
  /** C: the character's special (the witch's rope). */
  special: boolean;
  /** Mouse wheel / Tab: -1 / +1 to cycle weapons, 0 = none. */
  cycle: number;
  /** 1-9: pick a weapon slot directly (0-based), -1 = none. */
  slot: number;
}

// ------------------------------------------------------------------ teams
/**
 * "minion" is the necromancer's side (the player counts as one of them for targeting),
 * "enemy" the city and the Church, "feral" the occult rivals who fight everyone.
 */
export type Team = "enemy" | "minion" | "feral";
export type Side = "N" | "E" | "S" | "W";

// ------------------------------------------------------------------ player
export interface WeaponSlot {
  id: WeaponId;
  /** Shots in the gun right now. */
  loaded: number;
  /** All shots left including the loaded ones (Infinity for a starting weapon). */
  ammo: number;
  /** Seconds left of the current reload, 0 when not reloading. */
  reloadLeft: number;
  /** Seconds until the next shot is allowed. */
  cooldown: number;
  /** A starting weapon: endless ammunition, occult ones cost no souls. */
  starter?: boolean;
  /** Legend upgraded by a sacrifice at the altar: the minion's role decides the form. */
  ritual?: RitualForm;
  /** Shots left in a burst (crossbows). */
  burstLeft?: number;
  /** Seconds until a second volley (the martyrs' organ in the dark). */
  pendingVolley?: number;
  /** Kills with holy water towards the next healing (synergy "namaszczenie"). */
  holyKills?: number;
}

export type RitualForm = "guard" | "monk" | "inquisitor";

export interface Stats {
  damageMul: number;
  firearmDamageMul: number;
  reloadMul: number;
  ammoMul: number;
  minionLimit: number;
  raiseCost: number;
  /** Multiplier for the necromancer's own damage while standing in light. */
  lightDamageMul: number;
  burnDelayMul: number;
  dodgeCooldownMul: number;
  shopMul: number;
  minionDamageMul: number;
  minionLifeMul: number;
  minionHpMul: number;
  /** Chance a kill drops one more soul. */
  extraSoulChance: number;
  critChance: number;
  ambushMul: number;
  /** Added to occult soul costs (never below 1). */
  occultCostDelta: number;
  /** Extra relic charge per cleared room. */
  relicChargeBonus: number;
  /** Plague doctor: hits infect, the infected rise as minions when they die. */
  infect: boolean;
  /** Dodging reloads the current weapon. */
  dodgeReload: boolean;
  /** Bullets that pass close to a light put it out. */
  wickSnuffer: boolean;
  /** Gold dropped by the dead, as a multiplier. */
  goldMul: number;
  /** Walls every bullet of his glances off. */
  bounce: number;
  /** Synergy flags by name. */
  synergies: string[];
}

export interface Player {
  pos: Vec;
  vel: Vec;
  /** Extra velocity from recoil and hits, decays quickly. */
  push: Vec;
  facing: number;
  halves: number;
  maxHalves: number;
  /** Bone shirts: each absorbs one hit. */
  armor: number;
  invuln: number;
  dodgeLeft: number;
  dodgeCooldown: number;
  dodgeDir: Vec;
  weapons: WeaponSlot[];
  current: number;
  souls: number;
  gold: number;
  keys: number;
  items: ItemId[];
  relic: { id: RelicId; charge: number } | null;
  /** Weapon remains carried to an altar to be raised as a legend. */
  remains: LegendId[];
  character: CharacterId;
  stats: Stats;
  /** Witch's rope cooldown. */
  specialCooldown: number;
  alive: boolean;
  /** Kills by the necromancer's own side this run (for the grimoire and statistics). */
  kills: number;
  /** Synergies already announced (a new one gets its moment on screen). */
  seenSynergies?: string[];
  /** Seconds of being slowed (tears, ink, a sprung trap). */
  slow?: number;
}

// ------------------------------------------------------------------ units
export type UnitState =
  | "approach" | "windup" | "charge" | "recover" | "reposition" | "aim" | "fire" | "reload" | "follow"
  | "strike" | "channel" | "ring" | "flee" | "cast"
  /** Before the alarm: standing still (sleeping, praying, on watch) or walking a patrol route. */
  | "idle" | "patrol"
  /** Bosses: any named step of their script. */
  | "boss";

export interface Status {
  stun: number;
  slow: number;
  burn: number;
  fear: number;
  /** Weeping (Lamentation teeth): slow and unable to aim well. */
  weep: number;
  infected: boolean;
  /** Killed by the Ash Grimoire: rises as a short-lived mini minion. */
  ashMarked: boolean;
  /** Minions: seconds of the death knell's frenzy (double damage). */
  frenzy?: number;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  def: UnitDef;
  team: Team;
  pos: Vec;
  push: Vec;
  radius: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  timer: number;
  /** Locked direction for a charge, or aim direction while aiming. */
  dir: Vec;
  /** Short white flash after being hit (seconds). */
  flash: number;
  /** Sideways strafing preference for gunners (+1 / -1). */
  strafe: number;
  /** Minions only: seconds until the body crumbles. */
  lifetime: number;
  /** How many times this body has already been raised. */
  raises: number;
  /** Patrol route walked before the alarm. */
  route: Vec[];
  routeIdx: number;
  /** Carries a light that moves with him. */
  lantern: boolean;
  /** A tougher named variant (mini-boss): bigger, drops weapon remains. */
  elite: boolean;
  /** Carries a taper and relights what the necromancer put out. */
  lamplighter: boolean;
  /** Lamplighter: id of the light he is walking to, and seconds of work left at it. */
  task?: number;
  taskTime: number;
  /** Generic behaviour scratch values. */
  cooldown: number;
  cooldown2: number;
  burst: number;
  /** Where the unit is heading or aiming an area attack. */
  goal?: Vec;
  /** Knights: the way the shield faces. */
  facing: Vec;
  st: Status;
  /** Where a frightened unit runs from. */
  fleeFrom?: Vec;
  /** Minion raised by the Ash Grimoire: small, short-lived, outside the limit. */
  mini: boolean;
  /** Abomination stitched from several corpses. */
  stitched: number;
  /** Bosses keep their script state here. */
  boss?: BossState;
  /** Leads a formation (a sergeant, or a soldier promoted for the fight: a plume on his hat). */
  leader?: boolean;
  /** His place in a formation, if he serves in one. */
  tac?: Tactic;
  /** Walking to a corpse to burn it (its id), and how long the burning still takes. */
  pyre?: { corpse: number; t: number };
  /** A champion: an ordinary man with one gift, shown by a coloured aura (design: Elity). */
  champion?: Champion;
  /** Champion's own clock (the healer's prayer). */
  champT?: number;
  /** Raised by a summoner (his id): the summoner keeps only so many. */
  master?: number;
  /** Lying in wait (an ambush): unseen and still until the necromancer comes close or the alarm sounds. */
  hidden?: boolean;
  alive: boolean;
}

/** The gifts of champions (like Isaac's): each shows as a coloured aura round the feet. */
export type Champion = "swift" | "armored" | "explosive" | "splitting" | "healer" | "shadow" | "vengeful";

/** A trial room's state: the waves still to come and the reward at the end. */
export interface Trial {
  active: boolean;
  done: boolean;
  /** The waves, each a list of [kind, champion gift or ""]. */
  waves: [UnitKind, Champion | ""][][];
  wave: number;
  /** Seconds until the next wave walks in. */
  t: number;
  depth: number;
}

/** A soldier's part in his squad (see tactics.ts). */
export interface Tactic {
  squad: number;
  /** Where the formation wants him to stand right now. */
  slot?: Vec;
  /** Line: his rank (0 or 1; the ranks fire in turn and swap places). */
  rank?: number;
  /** Flankers go round the side (-1 / +1) before they strike; 0 once there. */
  flank?: number;
}

export type SquadKind = "line" | "wedge" | "procession";

/** A formation: a leader and the men who follow his word (design: Taktyka wrogów). */
export interface Squad {
  id: number;
  kind: SquadKind;
  leader: number;
  members: number[];
  phase: "form" | "volley" | "reload" | "advance" | "charge" | "recover";
  timer: number;
  /** Line: the rank that fires next (countermarch). */
  rank: number;
  /** Where the line stands and which way it faces (smoothed, so the men don't dance). */
  center?: Vec;
  dir?: Vec;
  /** Procession: the holy light carried at its head. */
  light?: number;
  /** Line: seconds from one volley to the next. */
  wait?: number;
}

export interface BossState {
  phase: number;
  step: string;
  t: number;
  n: number;
  /** Seconds until the next attack in the rotation. */
  next: number;
  angle: number;
  intro: number;
  /** The last attack, so the rotation does not repeat itself. */
  prev?: string;
  /** Anything else a script needs. */
  mem: Record<string, number>;
}

export interface Corpse {
  id: number;
  kind: UnitKind;
  pos: Vec;
  /** Which way the body fell (for drawing). */
  dir: Vec;
  /** Seconds left while it can still be raised. */
  echo: number;
  raises: number;
  /** Corpses of fallen minions are drawn darker. */
  fromMinion: boolean;
  /** Bigger bodies (elites, bosses) can't be raised. */
  big: boolean;
}

export interface Soul {
  id: number;
  pos: Vec;
  life: number;
}

// ------------------------------------------------------------------ light
export type LightKind =
  | "candle" | "candelabra" | "torch" | "chandelier" | "window" | "brazier" | "pyre" | "streetlamp"
  | "lantern" | "flash" | "fire" | "censer" | "carried";

export interface Light {
  id: number;
  kind: LightKind;
  /** Centre of the pool of light on the floor (the stand of a candelabra, the spot under a chandelier). */
  pos: Vec;
  radius: number;
  /** Radius when whole; damage shrinks `radius`, relighting restores it. */
  baseRadius: number;
  on: boolean;
  hp: number;
  maxHp: number;
  /** Holy light (stained glass, pyres) burns the undead necromancer. Ordinary light only reveals him. */
  holy: boolean;
  /** Torches and windows hang on a wall. */
  wall?: Side;
  /** Chandelier: seconds until it hits the floor; fallen once it has. */
  falling?: number;
  fallen?: boolean;
  /** Window: the glass is shot out. */
  broken?: boolean;
  /** Moving lights follow the unit that carries them (or the zone that burns). */
  owner?: number;
  ownerZone?: number;
  /** Muzzle flashes last a moment; carried lights go out for a while when snuffed. */
  life?: number;
  /** Seconds the light stays dark before it can burn again (snuffed lanterns). */
  dimmed?: number;
}

// ------------------------------------------------------------------ bullets & areas
export type BulletLook =
  | "ball" | "pellet" | "bolt" | "orb" | "ember" | "holy" | "tooth" | "bone" | "shard" | "wave"
  | "bomb" | "flask" | "torch" | "fireball" | "rosette" | "cross" | "ash" | "coin" | "page" | "note" | "tear" | "stone"
  | "trap" | "book" | "rat";

export type BulletEffect = "stun" | "slow" | "burn" | "fear" | "weep" | "ash" | "execute" | "split";

export interface Lob {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  /** What happens on landing. */
  land: "explode" | "fire" | "fireRing" | "holyRing" | "plague" | "keg" | "oil" | "trap" | "miasma" | "ink" | "stone" | "flare";
  radius: number;
  height: number;
}

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  /** Damage to units. */
  damage: number;
  /** Damage to the player in half hearts (holy water doubles it). */
  halves: number;
  /** Which side fired it: it hurts everyone not on that side. */
  side: Team;
  /** Fired by the necromancer himself (ambush, crits, shooting out lights, items). */
  fromPlayer: boolean;
  life: number;
  look: BulletLook;
  /** Fired from the dark before the alarm: an ambush. */
  ambush?: boolean;
  crit?: boolean;
  /** Units it can still pass through. */
  pierce?: number;
  /** Units already hit (so a piercing ball hits each once). */
  hit?: number[];
  /** Holy water: double damage to the undead. */
  holy?: boolean;
  /** Turn rate towards the nearest hostile (rad/s). */
  homing?: number;
  /** Speed change per second (negative slows down). */
  accel?: number;
  minSpeed?: number;
  /** Curving bullets (rad/s). */
  spin?: number;
  /** Seconds before the bullet starts to move (pattern set-ups). */
  delay?: number;
  effect?: BulletEffect;
  effectTime?: number;
  knock?: number;
  /** Lobbed projectile: flies over everything and lands at `to`. */
  lob?: Lob;
  /** Small blast on hit (monk ritual legend). */
  blast?: number;
  /** Weapon that fired it (for effects and sounds). */
  weapon?: WeaponId;
  /** A chain hook: hitting the necromancer drags him towards this point. */
  pullTo?: Vec;
  /** Colour hint for the renderer. */
  tint?: number;
  /** Walls it can still glance off (glass shards). */
  bounce?: number;
  /** Snuffs the flames it passes (the lamplighter's snuffer). */
  snuff?: boolean;
}

export type ZoneKind = "fire" | "plague" | "exorcism" | "slam" | "holyfire" | "blast" | "glass" | "trap" | "ink" | "rite";

/** A lasting or telegraphed area on the floor. */
export interface Zone {
  id: number;
  kind: ZoneKind;
  pos: Vec;
  radius: number;
  /** Seconds left; the zone is removed at 0. */
  life: number;
  maxLife: number;
  /** Seconds of warning before it hurts (the red ring you have to leave). */
  warn: number;
  /** The warning it started with (for drawing how close it is). */
  warnMax?: number;
  /** Who it spares: its own side. "none" hurts everyone. */
  side: Team | "none";
  /** Damage per second to units inside. */
  dps: number;
  /** Damage dealt once when the warning runs out. */
  burst: number;
  /** Half hearts it costs the player (once per contact, with the usual invulnerability). */
  halves: number;
  /** Hurts only the undead (exorcism): minions and the necromancer. */
  undeadOnly?: boolean;
  /** Light it gives off while burning. */
  light?: number;
  /** Fire that never goes out (burning oil). */
  permanent?: boolean;
  /** Seconds until the next damage tick. */
  tick?: number;
  /** Fired by the necromancer (kills count as his, ambush rules...). */
  fromPlayer?: boolean;
}

// ------------------------------------------------------------------ things on the floor
export type PickupKind =
  | "gold" | "ammo" | "ammoBox" | "heart" | "halfHeart" | "key" | "armor" | "echo"
  | "weapon" | "item" | "relic" | "remains" | "note";

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: Vec;
  vel: Vec;
  /** Gold amount, echo amount, note index... */
  value: number;
  /** Weapon / item / relic / legend id. */
  ref?: string;
  /** In the fence's shop: costs this much gold. */
  price?: number;
  /** Seconds before it can be collected (drops fly out first). */
  delay: number;
}

export type ChestTier = "wood" | "iron" | "reliquary";

export interface Chest {
  id: number;
  tier: ChestTier;
  pos: Vec;
  hp: number;
  opened: boolean;
  /** Smashed open by force: the contents may be ruined. */
  broken: boolean;
  /** Opens into teeth. */
  mimic: boolean;
}

export type InteractKind = "altar" | "fence" | "stairs" | "bell" | "note" | "secret" | "station" | "sarcophagus" | "echoAltar" | "skull" | "ledger" | "hatch" | "codex" | "trial";

export interface Interactable {
  id: number;
  kind: InteractKind;
  pos: Vec;
  radius: number;
  used: boolean;
  /** Station id, note index, character id... */
  ref?: string;
  /** Hidden until revealed (secret walls). */
  hidden?: boolean;
  /** Secret wall: shots left to break through; which wall it is in. */
  hp?: number;
  side?: Side;
  /** Presentation only: how the crypt shows it (a sarcophagus "owned", "buyable", "sealed", "chosen"). */
  look?: string;
}

export interface Cover {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** pew/table/coffin can be toppled; tomb/pillar/crate always stop bullets; barrels explode. */
  kind: CoverKind;
  flipped: boolean;
  hp: number;
  broken: boolean;
}

export type CoverKind = "pew" | "table" | "coffin" | "cart" | "stall" | "tomb" | "pillar" | "crate" | "powder" | "oil" | "shelf" | "organ" | "pavise";

/** A doorway in one of the four walls, leading to another room of the floor. */
export interface Door {
  side: Side;
  /** Id of the room on the other side. */
  to: number;
  /** Hidden passage, opened by breaking the cracked wall. */
  secret?: boolean;
  /** Where along its wall the doorway opens (0..1, the middle by default). */
  at?: number;
}

// ------------------------------------------------------------------ events
export type GameEvent =
  | { type: "shot"; pos: Vec; dir: Vec; side: Team; weapon?: WeaponId; fromPlayer: boolean; silent?: boolean }
  | { type: "enemyHit"; pos: Vec; dir: Vec; enemy: number; ambush: boolean; amount: number; crit: boolean }
  | { type: "enemyDeath"; pos: Vec; dir: Vec; kind: UnitKind; ambush: boolean; team: Team; elite: boolean; boss: boolean }
  | { type: "minionHit"; pos: Vec; dir: Vec; unit: number; amount: number }
  | { type: "minionDeath"; pos: Vec; dir: Vec; kind: UnitKind; crumbled: boolean }
  | { type: "playerHit"; pos: Vec; dir: Vec; armor: boolean }
  | { type: "playerDeath"; pos: Vec }
  | { type: "dodge"; pos: Vec; dir: Vec }
  | { type: "reloadStart"; pos: Vec; weapon: WeaponId }
  | { type: "reloadDone"; pos: Vec; weapon: WeaponId }
  | { type: "empty"; pos: Vec }
  | { type: "noSouls"; pos: Vec }
  | { type: "weaponSwitch"; weapon: WeaponId }
  | { type: "coverFlip"; cover: number; pos: Vec }
  | { type: "coverHit"; cover: number; pos: Vec }
  | { type: "coverBreak"; cover: number; pos: Vec; kind: CoverKind }
  /** A squad leader's word: "Fire!", "Forward!", "Pikes!" (the order is shown over his head). */
  | { type: "squadOrder"; pos: Vec; order: "volley" | "charge" | "advance" | "chant" }
  /** The leader fell: his men lose the formation. */
  | { type: "squadBroken"; pos: Vec }
  /** The Church burnt a body before it could be raised. */
  | { type: "corpseBurned"; pos: Vec }
  /** A paviser set his great shield in the ground. */
  | { type: "pavise"; pos: Vec }
  /** The butcher's hook flew out (and caught someone, or not). */
  | { type: "hook"; from: Vec; to: Vec; hit: boolean }
  /** Something crawled out of a summoning circle, or walked in with a trial's wave. */
  | { type: "summon"; pos: Vec }
  /** A trial room: it began, a wave came in, it was won. */
  | { type: "trial"; stage: "start" | "wave" | "done"; wave: number; waves: number; pos: Vec }
  /** Men walked in through a door (a wave, help from next door, the bell's answer, the hunt). */
  | { type: "reinforcements"; pos: Vec; first: boolean }
  /** An ambusher burst out of hiding. */
  | { type: "ambushOut"; pos: Vec }
  /** The last stand began, ran out, or was won. */
  | { type: "hold"; stage: "start" | "over" | "won"; left: number }
  /** The cultists' circle went dark with the last of them. */
  | { type: "riteBroken"; pos: Vec }
  /** The hunt reached this room. */
  | { type: "hunt"; pos: Vec }
  /** A champion's gift showed itself on his death (a blast, a split, a ring of light). */
  | { type: "championDeath"; pos: Vec; champion: Champion }
  | { type: "explosion"; pos: Vec; radius: number }
  | { type: "fire"; pos: Vec; radius: number }
  | { type: "bulletWall"; pos: Vec }
  | { type: "shieldBlock"; pos: Vec }
  | { type: "telegraph"; enemy: number }
  | { type: "soulPickup"; pos: Vec; souls: number }
  | { type: "raise"; pos: Vec; kind: UnitKind; unit: number; free?: boolean }
  | { type: "raiseFail"; pos: Vec; reason: "noSouls" | "limit" }
  | { type: "command"; pos: Vec }
  | { type: "alarm"; pos: Vec; by: number }
  | { type: "bark"; pos: Vec }
  | { type: "bell"; pos: Vec; done: boolean }
  | { type: "exorcism"; pos: Vec; radius: number; warn: boolean }
  | { type: "heal"; pos: Vec }
  | { type: "lightHit"; pos: Vec; light: number; kind: LightKind }
  | { type: "lightOut"; pos: Vec; light: number; kind: LightKind }
  | { type: "chandelierFall"; pos: Vec; light: number }
  | { type: "chandelierCrash"; pos: Vec; light: number }
  | { type: "windowBreak"; pos: Vec; light: number }
  | { type: "relight"; pos: Vec; light: number; by: number }
  | { type: "burn"; pos: Vec }
  | { type: "exit"; door: Door }
  | { type: "doorsShut" }
  | { type: "enterRoom"; room: number; side: Side }
  | { type: "roomCleared" }
  | { type: "pickup"; pos: Vec; kind: PickupKind; value: number; ref?: string }
  | { type: "buy"; pos: Vec; price: number }
  | { type: "tooPoor"; pos: Vec }
  | { type: "chestOpen"; pos: Vec; tier: ChestTier }
  | { type: "chestBreak"; pos: Vec; ruined: boolean }
  | { type: "needKey"; pos: Vec }
  | { type: "mimic"; pos: Vec }
  | { type: "relicUse"; pos: Vec; relic: RelicId }
  | { type: "relicReady"; relic: RelicId }
  | { type: "relicNotReady" }
  | { type: "itemGet"; pos: Vec; item: string; kind: "weapon" | "item" | "relic" | "remains" }
  | { type: "synergy"; pos: Vec; id: string }
  | { type: "trap"; pos: Vec }
  | { type: "legend"; pos: Vec; legend: LegendId }
  | { type: "ritual"; pos: Vec; form: RitualForm }
  | { type: "abomination"; pos: Vec; corpses: number }
  | { type: "secretOpen"; pos: Vec }
  | { type: "stairs" }
  | { type: "hatch"; secret: string }
  | { type: "note"; index: number }
  | { type: "station"; ref: string }
  | { type: "bossIntro"; boss: UnitKind }
  | { type: "bossPhase"; boss: UnitKind; phase: number }
  | { type: "bossDeath"; boss: UnitKind; pos: Vec }
  | { type: "special"; pos: Vec; target: Vec }
  | { type: "floorCleared" }
  | { type: "shrine"; pos: Vec; halves: number; souls: number };
