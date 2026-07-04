import pg from 'pg';
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

// PostgreSQL (Supabase) repositories over the db/migrations schema. The server
// uses the service role; RLS policies are documented but not relied upon here.

type Pool = pg.Pool;

function profileFromRow(r: Record<string, unknown>): Profile {
  return {
    id: r['id'] as string,
    username: r['username'] as string,
    trophies: Number(r['trophies']),
    mmr: Number(r['mmr']),
    gold: Number(r['gold']),
    gems: Number(r['gems']),
    clanId: (r['clan_id'] as string | null) ?? null,
    createdAt: String(r['created_at']),
  };
}

class PgProfiles implements ProfilesRepo {
  constructor(private pool: Pool) {}

  async create(p: Profile): Promise<void> {
    await this.pool.query(
      `INSERT INTO profiles (id, username, trophies, mmr, gold, gems, clan_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.id, p.username, p.trophies, p.mmr, p.gold, p.gems, p.clanId],
    );
  }

  async byId(id: string): Promise<Profile | null> {
    const r = await this.pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
    return r.rows[0] ? profileFromRow(r.rows[0]) : null;
  }

  async byUsername(username: string): Promise<Profile | null> {
    const r = await this.pool.query('SELECT * FROM profiles WHERE username = $1', [username]);
    return r.rows[0] ? profileFromRow(r.rows[0]) : null;
  }

  async applyEconomy(id: string, d: EconomyDelta): Promise<Profile | null> {
    const r = await this.pool.query(
      `UPDATE profiles SET
         gold = GREATEST(0, gold + $2),
         gems = GREATEST(0, gems + $3),
         trophies = GREATEST(0, trophies + $4)
       WHERE id = $1 RETURNING *`,
      [id, d.gold ?? 0, d.gems ?? 0, d.trophies ?? 0],
    );
    return r.rows[0] ? profileFromRow(r.rows[0]) : null;
  }

  async setClan(id: string, clanId: string | null): Promise<void> {
    await this.pool.query('UPDATE profiles SET clan_id = $2 WHERE id = $1', [id, clanId]);
  }

  async topByTrophies(limit: number): Promise<Profile[]> {
    const r = await this.pool.query(
      'SELECT * FROM profiles ORDER BY trophies DESC, id ASC LIMIT $1',
      [limit],
    );
    return r.rows.map(profileFromRow);
  }
}

class PgUserCards implements UserCardsRepo {
  constructor(private pool: Pool) {}

  async grant(profileId: string, cardId: string, count: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_cards (profile_id, card_id, cards_collected)
       VALUES ($1, $2, $3)
       ON CONFLICT (profile_id, card_id)
       DO UPDATE SET cards_collected = user_cards.cards_collected + $3`,
      [profileId, cardId, count],
    );
  }

  async list(profileId: string): Promise<UserCard[]> {
    const r = await this.pool.query(
      'SELECT * FROM user_cards WHERE profile_id = $1 ORDER BY card_id',
      [profileId],
    );
    return r.rows.map((row) => ({
      profileId: row.profile_id,
      cardId: row.card_id,
      cardLevel: Number(row.card_level),
      cardsCollected: Number(row.cards_collected),
    }));
  }

  async get(profileId: string, cardId: string): Promise<UserCard | null> {
    const r = await this.pool.query(
      'SELECT * FROM user_cards WHERE profile_id = $1 AND card_id = $2',
      [profileId, cardId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      profileId: row.profile_id,
      cardId: row.card_id,
      cardLevel: Number(row.card_level),
      cardsCollected: Number(row.cards_collected),
    };
  }

  async upgrade(profileId: string, cardId: string, cardsConsumed: number): Promise<void> {
    await this.pool.query(
      `UPDATE user_cards
       SET card_level = card_level + 1, cards_collected = cards_collected - $3
       WHERE profile_id = $1 AND card_id = $2`,
      [profileId, cardId, cardsConsumed],
    );
  }
}

class PgChestSlots implements ChestSlotsRepo {
  constructor(private pool: Pool) {}

  async list(profileId: string): Promise<ChestSlot[]> {
    const r = await this.pool.query(
      'SELECT * FROM chest_slots WHERE profile_id = $1 ORDER BY slot_index',
      [profileId],
    );
    return r.rows.map((row) => ({
      profileId: row.profile_id,
      slotIndex: Number(row.slot_index),
      chestType: row.chest_type,
      unlockStartTime: row.unlock_start_time ? new Date(row.unlock_start_time).getTime() : null,
      isUnlocking: Boolean(row.is_unlocking),
    }));
  }

  async assign(slot: ChestSlot): Promise<void> {
    await this.pool.query(
      `INSERT INTO chest_slots (profile_id, slot_index, chest_type, unlock_start_time, is_unlocking)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        slot.profileId,
        slot.slotIndex,
        slot.chestType,
        slot.unlockStartTime ? new Date(slot.unlockStartTime).toISOString() : null,
        slot.isUnlocking,
      ],
    );
  }

  async startUnlock(profileId: string, slotIndex: number, at: number): Promise<void> {
    await this.pool.query(
      `UPDATE chest_slots SET is_unlocking = TRUE, unlock_start_time = $3
       WHERE profile_id = $1 AND slot_index = $2`,
      [profileId, slotIndex, new Date(at).toISOString()],
    );
  }

  async clear(profileId: string, slotIndex: number): Promise<void> {
    await this.pool.query(
      'DELETE FROM chest_slots WHERE profile_id = $1 AND slot_index = $2',
      [profileId, slotIndex],
    );
  }
}

class PgClans implements ClansRepo {
  constructor(private pool: Pool) {}

  private fromRow(row: Record<string, unknown>): Clan {
    return {
      id: row['id'] as string,
      clanName: row['clan_name'] as string,
      badgeId: Number(row['badge_id']),
      totalTrophies: Number(row['total_trophies']),
      requiredTrophies: Number(row['required_trophies']),
      memberCount: Number(row['member_count']),
    };
  }

  async create(c: Clan): Promise<void> {
    await this.pool.query(
      `INSERT INTO clans (id, clan_name, badge_id, total_trophies, required_trophies, member_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [c.id, c.clanName, c.badgeId, c.totalTrophies, c.requiredTrophies, c.memberCount],
    );
  }

  async byId(id: string): Promise<Clan | null> {
    const r = await this.pool.query('SELECT * FROM clans WHERE id = $1', [id]);
    return r.rows[0] ? this.fromRow(r.rows[0]) : null;
  }

  async byName(name: string): Promise<Clan | null> {
    const r = await this.pool.query('SELECT * FROM clans WHERE clan_name = $1', [name]);
    return r.rows[0] ? this.fromRow(r.rows[0]) : null;
  }

  async adjustMembers(id: string, delta: number): Promise<void> {
    await this.pool.query(
      'UPDATE clans SET member_count = GREATEST(0, member_count + $2) WHERE id = $1',
      [id, delta],
    );
  }

  async top(limit: number): Promise<Clan[]> {
    const r = await this.pool.query(
      'SELECT * FROM clans ORDER BY total_trophies DESC, id ASC LIMIT $1',
      [limit],
    );
    return r.rows.map((row) => this.fromRow(row));
  }
}

class PgMatchHistory implements MatchHistoryRepo {
  constructor(private pool: Pool) {}

  async insert(m: MatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO match_history
         (match_id, player_1_id, player_2_id, player_1_score, player_2_score, winner_id, replay_data_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [m.matchId, m.player1Id, m.player2Id, m.player1Score, m.player2Score, m.winnerId, m.replayDataUrl],
    );
  }

  async byProfile(profileId: string, limit: number): Promise<MatchRecord[]> {
    const r = await this.pool.query(
      `SELECT * FROM match_history
       WHERE player_1_id = $1 OR player_2_id = $1
       ORDER BY match_timestamp DESC LIMIT $2`,
      [profileId, limit],
    );
    return r.rows.map((row) => ({
      matchId: row.match_id,
      player1Id: row.player_1_id,
      player2Id: row.player_2_id,
      player1Score: Number(row.player_1_score),
      player2Score: Number(row.player_2_score),
      winnerId: row.winner_id,
      replayDataUrl: row.replay_data_url,
    }));
  }
}

class PgReplays implements ReplaysRepo {
  constructor(private pool: Pool) {}

  async insert(id: string, matchId: string, replay: ReplayRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO replays (id, match_id, seed, config_version, frames, final_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, matchId, replay.seed, replay.configVersion, JSON.stringify(replay), replay.finalHash],
    );
  }

  async byId(id: string): Promise<ReplayRecord | null> {
    const r = await this.pool.query('SELECT frames FROM replays WHERE id = $1', [id]);
    const row = r.rows[0];
    if (!row) return null;
    return (typeof row.frames === 'string' ? JSON.parse(row.frames) : row.frames) as ReplayRecord;
  }
}

class PgAuth implements AuthRepo {
  constructor(private pool: Pool) {}

  async identity(provider: string, providerSubject: string): Promise<AuthIdentity | null> {
    const r = await this.pool.query(
      'SELECT * FROM auth_identities WHERE provider = $1 AND provider_subject = $2',
      [provider, providerSubject],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { profileId: row.profile_id, provider: row.provider, providerSubject: row.provider_subject };
  }

  async addIdentity(i: AuthIdentity): Promise<void> {
    await this.pool.query(
      'INSERT INTO auth_identities (profile_id, provider, provider_subject) VALUES ($1, $2, $3)',
      [i.profileId, i.provider, i.providerSubject],
    );
  }

  async identitiesByProfile(profileId: string): Promise<AuthIdentity[]> {
    const r = await this.pool.query('SELECT * FROM auth_identities WHERE profile_id = $1', [profileId]);
    return r.rows.map((row) => ({
      profileId: row.profile_id,
      provider: row.provider,
      providerSubject: row.provider_subject,
    }));
  }
}

class PgDecks implements DecksRepo {
  constructor(private pool: Pool) {}

  async get(profileId: string): Promise<string[] | null> {
    const r = await this.pool.query('SELECT card_ids FROM user_decks WHERE profile_id = $1', [profileId]);
    return r.rows[0] ? (r.rows[0].card_ids as string[]) : null;
  }

  async save(profileId: string, cardIds: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_decks (profile_id, card_ids) VALUES ($1, $2)
       ON CONFLICT (profile_id) DO UPDATE SET card_ids = $2`,
      [profileId, cardIds],
    );
  }
}

class PgTelemetry implements TelemetryRepo {
  constructor(private pool: Pool) {}

  async flag(f: AnticheatFlag): Promise<void> {
    await this.pool.query(
      `INSERT INTO anticheat_flags (profile_id, match_id, tick, reason, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [f.profileId, f.matchId, f.tick, f.reason, JSON.stringify(f.payload ?? null)],
    );
  }

  async byProfile(profileId: string): Promise<AnticheatFlag[]> {
    const r = await this.pool.query('SELECT * FROM anticheat_flags WHERE profile_id = $1', [profileId]);
    return r.rows.map((row) => ({
      profileId: row.profile_id,
      matchId: row.match_id,
      tick: Number(row.tick),
      reason: row.reason,
      payload: row.payload,
    }));
  }
}

export function createPgRepos(databaseUrl: string): Repos & { close(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return {
    profiles: new PgProfiles(pool),
    userCards: new PgUserCards(pool),
    chestSlots: new PgChestSlots(pool),
    clans: new PgClans(pool),
    matchHistory: new PgMatchHistory(pool),
    replays: new PgReplays(pool),
    auth: new PgAuth(pool),
    decks: new PgDecks(pool),
    telemetry: new PgTelemetry(pool),
    close: () => pool.end(),
  };
}
