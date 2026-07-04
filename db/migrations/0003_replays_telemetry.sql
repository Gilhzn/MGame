-- Migration 0003: deterministic input-stream replays (PRD 7.1) + anti-cheat telemetry (PRD 2.2)

CREATE TABLE replays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID REFERENCES match_history(match_id) ON DELETE CASCADE,
    seed BIGINT NOT NULL,
    config_version TEXT NOT NULL,
    frames JSONB NOT NULL, -- ReplayFrame[]: {tickId, playerId, inputEventCode 1|2|3|4, payload}
    final_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX idx_replays_match ON replays(match_id);

CREATE TABLE anticheat_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    match_id UUID,
    tick INT NOT NULL,
    reason TEXT NOT NULL, -- e.g. 'AIMBOT_ROTATION_SNAP'
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX idx_anticheat_flags_profile ON anticheat_flags(profile_id);
