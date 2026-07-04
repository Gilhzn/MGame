import type { ReplayRecord } from '@overlord/sim';

export interface Profile {
  id: string;
  username: string;
  trophies: number;
  mmr: number;
  gold: number;
  gems: number;
  clanId: string | null;
  createdAt: string;
}

export interface UserCard {
  profileId: string;
  cardId: string;
  cardLevel: number;
  cardsCollected: number;
}

export interface ChestSlot {
  profileId: string;
  slotIndex: number; // 0..3
  chestType: string; // 'Silver' | 'Gold' | 'Mega'
  unlockStartTime: number | null; // epoch ms
  isUnlocking: boolean;
}

export interface Clan {
  id: string;
  clanName: string;
  badgeId: number;
  totalTrophies: number;
  requiredTrophies: number;
  memberCount: number;
}

export interface MatchRecord {
  matchId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId: string | null;
  replayDataUrl: string | null;
}

export interface AuthIdentity {
  profileId: string;
  provider: 'guest' | 'google' | 'apple';
  providerSubject: string;
}

export interface AnticheatFlag {
  profileId: string;
  matchId: string | null;
  tick: number;
  reason: string;
  payload: unknown;
}

export interface EconomyDelta {
  gold?: number;
  gems?: number;
  trophies?: number;
}

export interface ProfilesRepo {
  create(profile: Profile): Promise<void>;
  byId(id: string): Promise<Profile | null>;
  byUsername(username: string): Promise<Profile | null>;
  applyEconomy(id: string, delta: EconomyDelta): Promise<Profile | null>;
  setClan(id: string, clanId: string | null): Promise<void>;
  topByTrophies(limit: number): Promise<Profile[]>;
}

export interface UserCardsRepo {
  grant(profileId: string, cardId: string, count: number): Promise<void>;
  list(profileId: string): Promise<UserCard[]>;
  get(profileId: string, cardId: string): Promise<UserCard | null>;
  /** Consume `cards` and bump level by one. Caller validates curves/gold. */
  upgrade(profileId: string, cardId: string, cardsConsumed: number): Promise<void>;
}

export interface ChestSlotsRepo {
  list(profileId: string): Promise<ChestSlot[]>;
  assign(slot: ChestSlot): Promise<void>;
  startUnlock(profileId: string, slotIndex: number, at: number): Promise<void>;
  clear(profileId: string, slotIndex: number): Promise<void>;
}

export interface ClansRepo {
  create(clan: Clan): Promise<void>;
  byId(id: string): Promise<Clan | null>;
  byName(name: string): Promise<Clan | null>;
  adjustMembers(id: string, delta: number): Promise<void>;
  top(limit: number): Promise<Clan[]>;
}

export interface MatchHistoryRepo {
  insert(match: MatchRecord): Promise<void>;
  byProfile(profileId: string, limit: number): Promise<MatchRecord[]>;
}

export interface ReplaysRepo {
  insert(id: string, matchId: string, replay: ReplayRecord): Promise<void>;
  byId(id: string): Promise<ReplayRecord | null>;
}

export interface AuthRepo {
  identity(provider: string, providerSubject: string): Promise<AuthIdentity | null>;
  addIdentity(identity: AuthIdentity): Promise<void>;
  identitiesByProfile(profileId: string): Promise<AuthIdentity[]>;
}

export interface DecksRepo {
  get(profileId: string): Promise<string[] | null>;
  save(profileId: string, cardIds: string[]): Promise<void>;
}

export interface TelemetryRepo {
  flag(flag: AnticheatFlag): Promise<void>;
  byProfile(profileId: string): Promise<AnticheatFlag[]>;
}

export interface Repos {
  profiles: ProfilesRepo;
  userCards: UserCardsRepo;
  chestSlots: ChestSlotsRepo;
  clans: ClansRepo;
  matchHistory: MatchHistoryRepo;
  replays: ReplaysRepo;
  auth: AuthRepo;
  decks: DecksRepo;
  telemetry: TelemetryRepo;
}
