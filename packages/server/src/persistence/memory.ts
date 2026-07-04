import type { ReplayRecord } from '@overlord/sim';
import type {
  AnticheatFlag,
  AuthIdentity,
  AuthRepo,
  ChestSlot,
  ChestSlotsRepo,
  Clan,
  ClansRepo,
  DecksRepo,
  EconomyDelta,
  MatchHistoryRepo,
  MatchRecord,
  Profile,
  ProfilesRepo,
  Repos,
  ReplaysRepo,
  TelemetryRepo,
  UserCard,
  UserCardsRepo,
} from './types.js';

// In-memory repositories: the default for dev and tests, and the reference
// behavior the pg implementations must match.

class MemoryProfiles implements ProfilesRepo {
  private rows = new Map<string, Profile>();

  async create(profile: Profile): Promise<void> {
    if (this.rows.has(profile.id)) throw new Error('duplicate profile id');
    for (const p of this.rows.values()) {
      if (p.username === profile.username) throw new Error('duplicate username');
    }
    this.rows.set(profile.id, { ...profile });
  }

  async byId(id: string): Promise<Profile | null> {
    const p = this.rows.get(id);
    return p ? { ...p } : null;
  }

  async byUsername(username: string): Promise<Profile | null> {
    for (const p of this.rows.values()) if (p.username === username) return { ...p };
    return null;
  }

  async applyEconomy(id: string, delta: EconomyDelta): Promise<Profile | null> {
    const p = this.rows.get(id);
    if (!p) return null;
    p.gold = Math.max(0, p.gold + (delta.gold ?? 0));
    p.gems = Math.max(0, p.gems + (delta.gems ?? 0));
    p.trophies = Math.max(0, p.trophies + (delta.trophies ?? 0));
    return { ...p };
  }

  async setClan(id: string, clanId: string | null): Promise<void> {
    const p = this.rows.get(id);
    if (p) p.clanId = clanId;
  }

  async topByTrophies(limit: number): Promise<Profile[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.trophies - a.trophies || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((p) => ({ ...p }));
  }
}

class MemoryUserCards implements UserCardsRepo {
  private rows = new Map<string, UserCard>();

  private key(profileId: string, cardId: string): string {
    return `${profileId}:${cardId}`;
  }

  async grant(profileId: string, cardId: string, count: number): Promise<void> {
    const k = this.key(profileId, cardId);
    const existing = this.rows.get(k);
    if (existing) existing.cardsCollected += count;
    else this.rows.set(k, { profileId, cardId, cardLevel: 1, cardsCollected: count });
  }

  async list(profileId: string): Promise<UserCard[]> {
    return [...this.rows.values()]
      .filter((c) => c.profileId === profileId)
      .sort((a, b) => a.cardId.localeCompare(b.cardId))
      .map((c) => ({ ...c }));
  }

  async get(profileId: string, cardId: string): Promise<UserCard | null> {
    const c = this.rows.get(this.key(profileId, cardId));
    return c ? { ...c } : null;
  }

  async upgrade(profileId: string, cardId: string, cardsConsumed: number): Promise<void> {
    const c = this.rows.get(this.key(profileId, cardId));
    if (!c) throw new Error('card not owned');
    c.cardsCollected -= cardsConsumed;
    c.cardLevel += 1;
  }
}

class MemoryChestSlots implements ChestSlotsRepo {
  private rows: ChestSlot[] = [];

  async list(profileId: string): Promise<ChestSlot[]> {
    return this.rows
      .filter((s) => s.profileId === profileId)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((s) => ({ ...s }));
  }

  async assign(slot: ChestSlot): Promise<void> {
    if (this.rows.some((s) => s.profileId === slot.profileId && s.slotIndex === slot.slotIndex)) {
      throw new Error('slot occupied');
    }
    this.rows.push({ ...slot });
  }

  async startUnlock(profileId: string, slotIndex: number, at: number): Promise<void> {
    const s = this.rows.find((r) => r.profileId === profileId && r.slotIndex === slotIndex);
    if (!s) throw new Error('no chest in slot');
    s.isUnlocking = true;
    s.unlockStartTime = at;
  }

  async clear(profileId: string, slotIndex: number): Promise<void> {
    this.rows = this.rows.filter(
      (r) => !(r.profileId === profileId && r.slotIndex === slotIndex),
    );
  }
}

class MemoryClans implements ClansRepo {
  private rows = new Map<string, Clan>();

  async create(clan: Clan): Promise<void> {
    for (const c of this.rows.values()) {
      if (c.clanName === clan.clanName) throw new Error('duplicate clan name');
    }
    this.rows.set(clan.id, { ...clan });
  }

  async byId(id: string): Promise<Clan | null> {
    const c = this.rows.get(id);
    return c ? { ...c } : null;
  }

  async byName(name: string): Promise<Clan | null> {
    for (const c of this.rows.values()) if (c.clanName === name) return { ...c };
    return null;
  }

  async adjustMembers(id: string, delta: number): Promise<void> {
    const c = this.rows.get(id);
    if (c) c.memberCount = Math.max(0, c.memberCount + delta);
  }

  async top(limit: number): Promise<Clan[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.totalTrophies - a.totalTrophies || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((c) => ({ ...c }));
  }
}

class MemoryMatchHistory implements MatchHistoryRepo {
  private rows: MatchRecord[] = [];

  async insert(match: MatchRecord): Promise<void> {
    this.rows.push({ ...match });
  }

  async byProfile(profileId: string, limit: number): Promise<MatchRecord[]> {
    return this.rows
      .filter((m) => m.player1Id === profileId || m.player2Id === profileId)
      .slice(-limit)
      .map((m) => ({ ...m }));
  }
}

class MemoryReplays implements ReplaysRepo {
  private rows = new Map<string, ReplayRecord>();

  async insert(id: string, _matchId: string, replay: ReplayRecord): Promise<void> {
    this.rows.set(id, replay);
  }

  async byId(id: string): Promise<ReplayRecord | null> {
    return this.rows.get(id) ?? null;
  }
}

class MemoryAuth implements AuthRepo {
  private rows: AuthIdentity[] = [];

  async identity(provider: string, providerSubject: string): Promise<AuthIdentity | null> {
    const i = this.rows.find((r) => r.provider === provider && r.providerSubject === providerSubject);
    return i ? { ...i } : null;
  }

  async addIdentity(identity: AuthIdentity): Promise<void> {
    if (await this.identity(identity.provider, identity.providerSubject)) {
      throw new Error('identity already linked');
    }
    this.rows.push({ ...identity });
  }

  async identitiesByProfile(profileId: string): Promise<AuthIdentity[]> {
    return this.rows.filter((r) => r.profileId === profileId).map((r) => ({ ...r }));
  }
}

class MemoryDecks implements DecksRepo {
  private rows = new Map<string, string[]>();

  async get(profileId: string): Promise<string[] | null> {
    const d = this.rows.get(profileId);
    return d ? [...d] : null;
  }

  async save(profileId: string, cardIds: string[]): Promise<void> {
    this.rows.set(profileId, [...cardIds]);
  }
}

class MemoryTelemetry implements TelemetryRepo {
  private rows: AnticheatFlag[] = [];

  async flag(flag: AnticheatFlag): Promise<void> {
    this.rows.push({ ...flag });
  }

  async byProfile(profileId: string): Promise<AnticheatFlag[]> {
    return this.rows.filter((f) => f.profileId === profileId).map((f) => ({ ...f }));
  }
}

export function createMemoryRepos(): Repos {
  return {
    profiles: new MemoryProfiles(),
    userCards: new MemoryUserCards(),
    chestSlots: new MemoryChestSlots(),
    clans: new MemoryClans(),
    matchHistory: new MemoryMatchHistory(),
    replays: new MemoryReplays(),
    auth: new MemoryAuth(),
    decks: new MemoryDecks(),
    telemetry: new MemoryTelemetry(),
  };
}
