-- Migration 0002: silent guest auth + OAuth account linking (PRD section 4.1)

-- One profile can carry multiple identities: it starts life as a 'guest'
-- identity and gains a 'google'/'apple' identity when the player links an
-- account. The merge routine re-points identities, never deletes progress.
CREATE TABLE auth_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('guest', 'google', 'apple')),
    provider_subject TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE(provider, provider_subject)
);

CREATE INDEX idx_auth_identities_profile ON auth_identities(profile_id);

CREATE TABLE refresh_tokens (
    token TEXT PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX idx_refresh_tokens_profile ON refresh_tokens(profile_id);
