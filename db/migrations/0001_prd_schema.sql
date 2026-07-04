-- Migration 0001: PRD master schema (verbatim from GAME_PRD_MASTER_PROMPT.md section 3)

-- Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles & Economies
CREATE TABLE profiles (
    id UUID PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    trophies INT DEFAULT 0,
    mmr INT DEFAULT 1000,
    gold INT DEFAULT 500,
    gems INT DEFAULT 100,
    clan_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Active Card Inventory
CREATE TABLE user_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    card_level INT DEFAULT 1,
    cards_collected INT DEFAULT 0,
    UNIQUE(profile_id, card_id)
);

-- Time-Locked Chest Progression Slots
CREATE TABLE chest_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    slot_index INT CHECK (slot_index BETWEEN 0 AND 3),
    chest_type TEXT NOT NULL, -- 'Silver', 'Gold', 'Mega'
    unlock_start_time TIMESTAMP WITH TIME ZONE NULL,
    is_unlocking BOOLEAN DEFAULT FALSE,
    UNIQUE(profile_id, slot_index)
);

-- Clan Ecosystem
CREATE TABLE clans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_name TEXT UNIQUE NOT NULL,
    badge_id INT DEFAULT 1,
    total_trophies INT DEFAULT 0,
    required_trophies INT DEFAULT 0,
    member_count INT DEFAULT 1
);

-- Historical Record of Match Telemetry
CREATE TABLE match_history (
    match_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_1_id UUID REFERENCES profiles(id),
    player_2_id UUID REFERENCES profiles(id),
    player_1_score INT DEFAULT 0,
    player_2_score INT DEFAULT 0,
    winner_id UUID,
    replay_data_url TEXT,
    match_timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
