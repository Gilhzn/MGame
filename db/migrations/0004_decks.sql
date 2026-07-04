-- Migration 0004: active 8-card battle deck per profile (PRD 1.1).

CREATE TABLE user_decks (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    card_ids TEXT[] NOT NULL CHECK (array_length(card_ids, 1) = 8),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
