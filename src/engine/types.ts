export type PlayerId = 0 | 1;
export type ZoneId = 0 | 1 | 2;
export const ZONES: readonly ZoneId[] = [0, 1, 2];
export const ZONE_LABELS = ['A', 'MID', 'B'] as const;

export type CardType = 'operator' | 'gear' | 'tactic';
export type Role = 'assault' | 'tank' | 'sniper' | 'support';
export type Rarity = 'common' | 'rare' | 'epic' | 'legend';
export type WeaponClass = 'smg' | 'ar' | 'sg' | 'sr' | 'lmg' | 'knife' | 'armor';

export type Effect =
  | { kind: 'damageEnemiesInZone'; amount: number }
  | { kind: 'damageAllInZone'; amount: number }
  | { kind: 'damageUnit'; amount: number }
  | { kind: 'flashZone' }
  | { kind: 'smokeZone' }
  | { kind: 'fireZone'; amount: number; turns: number }
  | { kind: 'stim'; hp: number; aim: number }
  | { kind: 'buffZoneAllies'; atk: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'creditsNextTurn'; amount: number }
  | { kind: 'plantC4' }
  | { kind: 'recall' }
  | { kind: 'reinforce' };

export type Ability =
  | { k: 'guard' }
  | { k: 'armored' }
  | { k: 'flank' }
  | { k: 'stealth' }
  | { k: 'snipe' }
  | { k: 'spread'; n: number }
  | { k: 'pierce' }
  | { k: 'chain' }
  | { k: 'grow'; atk: number; hp: number }
  | { k: 'medic'; n: number }
  | { k: 'eco'; n: number }
  | { k: 'suppress'; n: number }
  | { k: 'leader'; n: number }
  | { k: 'trap'; n: number }
  | { k: 'knifeKill' }
  | { k: 'onDeploy'; effect: Effect }
  | { k: 'lastWords'; effect: Effect }
  | { k: 'bane' }
  | { k: 'drain' }
  | { k: 'phoenix' }
  | { k: 'ephemeral' }
  | { k: 'lonely'; n: number }
  | { k: 'crowd' }
  | { k: 'scavenge' }
  | { k: 'mimic' }
  | { k: 'berserk'; n: number }
  | { k: 'bleed'; n: number }
  /** Same-zone partner buff. `with` is a card id. */
  | { k: 'bond'; with: string; atk?: number; aim?: number };

export type TargetKind = 'zone' | 'enemyUnit' | 'allyUnit' | 'none';

export interface CardDef {
  id: string;
  name: string;
  en: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  text: string;
  flavor?: string;
  role?: Role;
  atk?: number;
  hp?: number;
  aim?: number;
  abilities?: Ability[];
  slot?: 'weapon' | 'armor';
  weaponClass?: WeaponClass;
  mods?: { atk?: number; hp?: number; aim?: number };
  target?: TargetKind;
  speed?: number;
  effect?: Effect;
}

export type StreakId = 'uav' | 'airstrike' | 'nuke';

export interface StreakDef {
  id: StreakId;
  name: string;
  en: string;
  cost: number;
  speed: number;
  target: 'zone' | 'none';
  text: string;
}

export interface ZoneModDef {
  id: string;
  name: string;
  text: string;
}

export interface Unit {
  uid: string;
  cardId: string;
  owner: PlayerId;
  zone: ZoneId;
  atk: number;
  hp: number;
  maxHp: number;
  aim: number;
  weapon?: string;
  armor?: string;
  deployedTurn: number;
  kills: number;
  tmpAim: number;
  tmpAtk: number;
  flashed: boolean;
  chainShots: number;
  /** 【不死鳥】で一度耐えたか */
  phoenixUsed?: boolean;
}

export interface FireZone {
  owner: PlayerId;
  dmg: number;
  turnsLeft: number;
}

export interface C4State {
  owner: PlayerId;
  explodeTurn: number;
}

export interface ZoneState {
  id: ZoneId;
  modId: string;
  units: [Unit[], Unit[]];
  smoked: boolean;
  fires: FireZone[];
  c4: C4State | null;
  controller: PlayerId | null;
}

export interface HandCard {
  hid: string;
  cardId: string;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  deckId: string;
  /** Original deck composition (immutable for the match). Used by AI / UAV heuristics. */
  deckList: string[];
  deck: string[];
  hand: HandCard[];
  graveyard: string[];
  credits: number;
  bonusNextTurn: number;
  sp: number;
  score: number;
  kills: number;
  headshots: number;
  /** Turn during whose planning phase this player's UAV reveals the opponent hand (-1 = none). */
  uavTurn: number;
  /** Turn at whose end this player's tactical nuke detonates (-1 = none). */
  nukeTurn: number;
}

export type Winner = PlayerId | 'draw' | null;
export type WinReason = 'score' | 'nuke' | 'turnLimit' | 'surrender' | 'disconnect';

export interface GameConfig {
  targetScore: number;
  maxTurns: number;
  maxPerZone: number;
  startHand: number;
  maxHand: number;
  creditCap: number;
}

export interface GameState {
  rng: number;
  turn: number;
  initiative: PlayerId;
  players: [PlayerState, PlayerState];
  zones: [ZoneState, ZoneState, ZoneState];
  winner: Winner;
  winReason: WinReason | null;
  nextId: number;
  config: GameConfig;
}

export type UnitRef = { uid: string } | { hid: string };

export type Action =
  | { t: 'deploy'; hid: string; zone: ZoneId }
  | { t: 'gear'; hid: string; target: UnitRef }
  | { t: 'tactic'; hid: string; zone?: ZoneId; target?: UnitRef }
  | { t: 'move'; uid: string; zone: ZoneId }
  | { t: 'streak'; id: StreakId; zone?: ZoneId }
  | { t: 'resupply' };

export interface Plan {
  actions: Action[];
}

/** A played action as revealed to both players (card ids instead of private hand ids). */
export type PublicPlay =
  | { t: 'deploy'; cardId: string; zone: ZoneId; uid: string }
  | { t: 'gear'; cardId: string; uid: string }
  | { t: 'tactic'; cardId: string; zone?: ZoneId; uid?: string }
  | { t: 'move'; uid: string; zone: ZoneId }
  | { t: 'streak'; id: StreakId; zone?: ZoneId }
  | { t: 'resupply' };

export interface UnitSnap {
  uid: string;
  cardId: string;
  owner: PlayerId;
  zone: ZoneId;
  atk: number;
  hp: number;
  maxHp: number;
  aim: number;
  weapon?: string;
  armor?: string;
  flashed: boolean;
  stealth: boolean;
  fresh: boolean;
  kills: number;
}

export interface ZoneSnap {
  id: ZoneId;
  modId: string;
  units: [UnitSnap[], UnitSnap[]];
  smoked: boolean;
  fire: [number, number];
  c4: C4State | null;
  controller: PlayerId | null;
}

export interface PlayerSnap {
  score: number;
  credits: number;
  sp: number;
  kills: number;
  handCount: number;
}

export interface BoardSnap {
  turn: number;
  zones: ZoneSnap[];
  players: [PlayerSnap, PlayerSnap];
}

export type DamageSource = 'tactic' | 'fire' | 'trap' | 'c4' | 'toxic' | 'splash' | 'streak' | 'deploy';

export type GameEventBody =
  | { e: 'reveal'; plays: [PublicPlay[], PublicPlay[]] }
  | { e: 'move'; p: PlayerId; uid: string; from: ZoneId; to: ZoneId }
  | { e: 'deploy'; p: PlayerId; uid: string; cardId: string; zone: ZoneId }
  | { e: 'equip'; p: PlayerId; uid: string; cardId: string }
  | { e: 'tactic'; p: PlayerId; cardId: string; zone?: ZoneId; uid?: string; fizzle?: boolean }
  | { e: 'streak'; p: PlayerId; id: StreakId; zone?: ZoneId }
  | { e: 'flash'; uids: string[]; zone?: ZoneId }
  | { e: 'smoke'; zone: ZoneId }
  | { e: 'fire'; zone: ZoneId; p: PlayerId }
  | { e: 'damage'; uid: string; amount: number; source: DamageSource; zone: ZoneId }
  | { e: 'heal'; uid: string; amount: number }
  | { e: 'buff'; uids: string[]; label: string }
  | { e: 'combatStart' }
  | { e: 'shot'; p: PlayerId; from: string; to: string; dmg: number; hs: boolean; kill: boolean; fromZone: ZoneId; toZone: ZoneId; tier: number; extra?: boolean }
  | { e: 'kill'; uid: string; cardId: string; victimOwner: PlayerId; by?: string; byCardId?: string; byPlayer?: PlayerId; weapon?: string; hs: boolean; source: 'shot' | DamageSource }
  | { e: 'multikill'; p: PlayerId; count: number; ace: boolean }
  | { e: 'recall'; p: PlayerId; uid: string; cardId: string }
  | { e: 'draw'; p: PlayerId; count: number }
  | { e: 'c4Plant'; p: PlayerId; zone: ZoneId }
  | { e: 'c4Defuse'; p: PlayerId; zone: ZoneId }
  | { e: 'c4Explode'; p: PlayerId; zone: ZoneId }
  | { e: 'score'; p: PlayerId; zone: ZoneId; pts: number }
  | { e: 'nukeArmed'; p: PlayerId }
  | { e: 'nukeFizzle'; p: PlayerId }
  | { e: 'nuke'; p: PlayerId }
  | { e: 'turnStart'; turn: number }
  | { e: 'gameOver'; winner: Winner; reason: WinReason };

export type GameEvent = GameEventBody & { snap: BoardSnap };

export interface OpponentView {
  id: PlayerId;
  name: string;
  deckId: string;
  deckList: string[];
  handCount: number;
  deckCount: number;
  credits: number;
  sp: number;
  score: number;
  kills: number;
  headshots: number;
  hand?: HandCard[];
  graveyard: string[];
  /** The opponent's UAV is revealing my hand this planning phase. */
  uavActive: boolean;
  nukeTurn: number;
}

export type SelfView = Omit<PlayerState, 'deck'> & { deckCount: number };

export interface GameView {
  me: PlayerId;
  turn: number;
  initiative: PlayerId;
  config: GameConfig;
  zones: ZoneState[];
  self: SelfView;
  opp: OpponentView;
  winner: Winner;
  winReason: WinReason | null;
}
