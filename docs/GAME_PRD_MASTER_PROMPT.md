# EXECUTIVE ARCHITECTURE & PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Project Codename:** Project Overlord / Hybrid RTS-FPS Battler
**Target Platforms:** Mobile (iOS & Android)
**Client Game Engine:** Unity (C#) or Godot (C#)
**Backend Infrastructure:** Node.js + TypeScript + WebSockets (or Nakama Server) + Supabase (PostgreSQL)
**Asset Pipeline:** Blender (Python API Automation) + Image-to-3D AI Generative Tooling

---

## 1. GAME OVERVIEW & CORE HYBRID MECHANICS

### 1.1 The Tactical Layer (Bird's-Eye RTS Grid)
- **The Arena:** Played on a strict 12x24 grid layout. Each player owns a 12x11 home territory, separated by a 12x2 neutral river zone with two bridges.
- **Resource System (Elixir):** Passive regeneration at a baseline of 1 point per 2.8 seconds. Generates at 2x speed during the final 60 seconds of a match. Maximum cap is 10 Elixir points.
- **Card Deployment:** Players maintain an active hand of 4 cards drawn from an 8-card deck. Dragging and dropping a unit card onto valid home territory consumes Elixir and spawns the unit instance.

### 1.2 The Action Layer (Possession Mechanic)
- **The Core Loop:** At the exact moment of spawning a unit, the player can perform a "Hold & Release" gesture. The camera dynamically drops from the RTS perspective into a First-Person (FPS) or Over-The-Shoulder (TPS) viewport.
- **The Psychological Bluff:** The opposing player receives absolutely zero network flags or visual indicators showing that a unit is human-controlled. The human player must strategically choose whether to mimic uniform AI pathfinding patterns or execute manual tactical ambushes.
- **Possession Lifecycle:** Possession is allowed *only* at the unit's creation timestamp. Once the possessed unit's HP drops to 0, the camera instantly snaps back to the bird's-eye RTS tactical view.
- **Dual-Weapon Loadout (Manual Play Only):** While AI units follow fixed attack patterns and uniform fire rates, a possessed unit unlocks a high-agency dual-weapon loadout:
  - **Weapon Alpha (Standard):** Rapid fire, low individual damage, easy recoil, instant projectile/hitscan.
  - **Weapon Beta (Premium Skill):** High-risk, high-reward. Long reload or charge time, heavy recoil, immense critical damage multiplier when hitting the head hitbox (`Headshot_Bone`).

---

## 2. SERVER-AUTHORITATIVE NETCODE & ANTI-CHEAT SECURITY

### 2.1 Networking Simulation & Sync
- **Tick Rate:** The master game server runs a deterministic simulation loop at a fixed 20 ticks per second (50ms interval framework).
- **Client-Side Prediction:** When a player controls a unit in FPS mode, the client immediately updates local transforms based on local input vectors (joystick/aim) to ensure latency-free, fluid movement.
- **Server Reconciliation:** The client buffers its inputs along with a monotonic Tick ID. The server validates incoming inputs against the simulation state. If the server-computed position diverges from the client's predicted position beyond an acceptable threshold ($>0.15\text{ units}$), the server forces a correction packet, and the client smoothly lerps/snaps to the authoritative state.
- **Lag Compensation (Rewind Time):** For FPS projectile hit detection, the server maintains a circular buffer of the past 1 second of entity position histories. When a client sends a `Shoot` command with a timestamp, the server rewinds its collision meshes to that exact tick to evaluate if the raycast genuinely intersected a target's head/body hitbox.

### 2.2 Advanced Anti-Cheat Framework
- **Input Sanity Validation:** The server tracks rotational delta vectors ($\Delta\theta$). If an angular shift occurs faster than humanly possible (e.g., $180^\circ$ snap within 1 tick) accompanied by a critical headshot, the packet is invalidated, the action is dropped, and a telemetry flag is raised for potential Aimbot injection.
- **Network Fog of War:** To negate Maphacks/Wallhacks, the server actively culls entity state distribution. If an entity is hidden within the river's stealth bushes or behind objective buildings relative to Player A's visibility graph, its position vectors are completely stripped from Player A's network packets until a visibility event occurs.

---

## 3. MASTER DATABASE & PERSISTENCE SCHEMA (POSTGRESQL / SUPABASE)

The database architecture handles silent authentication, persistence, metagame economies, and clan structures cleanly.

```sql
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
```

## 4. LOBBY, ADVANCED UI/UX, & UX STEPS

### 4.1 Onboarding & Authentication Architecture
 * **Step 1 (Silent Onboarding):** On fresh application boot, the engine looks for a local secure storage device token. If absent, it queries the backend /auth/guest endpoint, which inserts a guest GUID into the database and returns a short-lived JWT token. The player bypasses all log-in screens straight to the gameplay loop.
 * **Step 2 (Account Hardening Account Link):** Within the settings panel, players can trigger an OAuth flow (Sign in with Google or Sign in with Apple). This invokes a backend merge routine updating the auth credentials without erasing the guest account's database metadata or card inventory.

### 4.2 Main UI Dashboard Framework
 * **Top Bar Widget:** Flat horizontal container layout displaying Profile Name, Level XP, Trophy Counter, Gold Count, Gem Count, and Settings Gear button.
 * **Center Carousel:** A realtime 3D rendered viewport showcasing the user's favorite combat card character in an idle animation pose. Flanked by a dominant, large screen center "BATTLE" action button.
 * **Bottom Navigation Dock:** 5 structural icons switching between Shop, Card Deck Builder, Core Lobby Dashboard, Clan Hub, and Global Leaderboards.
 * **Chest Progression Trays:** Located directly beneath the central 3D scene, showing 4 horizontal asset slots populated by obtained chests, rendering dynamic real-time text tickers indicating countdown sequences (e.g., 02h:45m:12s).

### 4.3 First Time User Experience (FTUE) Scripted Machine
 * **Phase A (Forced Deployment):** Locking all menu inputs except for a single pulsing card instance. Forcing user to drag it to grid coordinates (6, 4).
 * **Phase B (Forced Possession):** Time-scaling the match down to TimeScale = 0.05 (Slow-Motion) immediately upon unit touchdown. An animated finger prompt overlays the screen, forcing a prolonged tap on the unit.
 * **Phase C (Action Integration):** Camera swoops into FPS viewpoint. An immobile placeholder target is placed in the distance. The right-hand virtual stick is highlighted, guiding the player to pan their crosshair to the target's head marker and fire Weapon Beta.
 * **Phase D (Return & Complete):** Target dies. Unit expires. Camera lerps smoothly back up to sky view. Time scale returns to 1.0, and normal input control loops resume against a low-tier training bot.

## 5. ART PIPELINE & AUTOMATION ENGINES

### 5.1 Procedural Board Generation Script (Blender 4.x Python API)
Execute this module directly inside Blender's script console to automatically build the basic geometric layout of the arena tiles. See `tools/blender/generate_arena.py` in this repository.

### 5.2 Client Engine Modular Character Assembly
Characters are completely assembled at runtime from detached modular parts to optimize memory profiles.
 * **Base Mesh Classes:** Heavy_Humanoid_Rig, Agile_Humanoid_Rig, Monstrous_Beast_Rig.
 * **Socket Attachment System:** Transform bones feature dedicated attachment nodes: Socket_Head, Socket_Back, Socket_Hand_R.
 * **Runtime Assembly Engine:** When a unit is loaded, an injection script attaches the cosmetic meshes (e.g., Knight_Helmet_V3 to Socket_Head) and binds the corresponding weapon mesh, camera offsets, and crosshair UI profiles directly onto the target rig.

## 6. LIVEOPS CONFIGURATION, PROGRESSION CURVES & GACHA SYSTEM
The entire game configuration is driven by a single centralized JSON config file fetched over HTTP upon app start. See `config/liveops.json` in this repository (the PRD's example registry entry `unit_royal_archer` is preserved verbatim; additional units extend the same schema to fill the 8-card deck requirement).

## 7. ADVANCED GAME SYSTEMS & ARCHITECTURAL PATTERNS

### 7.1 Input-Based Replay Engine
To keep data footprints minimal, matches are not recorded as video frames. Instead, they use a deterministic input stream capture pattern.

```typescript
interface ReplayFrame {
  tickId: number;
  playerId: string;
  inputEventCode: number; // 1 = Spawn, 2 = Possess, 3 = Move, 4 = Shoot
  payload: {
    vectorX?: number;
    vectorY?: number;
    entityId?: string;
    gridX?: number;
    gridY?: number;
  }
}
```

To replay a match, the engine boots a clean, blank instance of the arena map, initializes the pseudo-random seeds identically, and transparently streams the ReplayFrame data array sequentially back through the simulation engine.

### 7.2 Spatial Audio Routing Controller
 * The client engine maintains a centralized AudioListenerSwitchManager.
 * **RTS Camera Default:** The listener is anchored to the global ortho-camera sky array, capturing a wide, non-spatialized 2D stereo spectrum.
 * **FPS Transition Handler:** The moment PossessUnit clears, the listener's structural transform is reparented directly to the camera rig inside the possessed model's head bone. All environmental sounds (explosions, enemy footfalls, spell casts) are re-routed through a high-fidelity 3D spatial HRTF calculation node.

### 7.3 Addressables Asset Streaming Pipeline
 * The local installation footprint is decoupled via **Unity Addressables** or **Godot Asset Bundles**.
 * Core local storage stores only localized UI translation grids (supporting RTL fonts for Hebrew/Arabic), base rigs, and initial tutorial layers.
 * Map arenas, premium card models, and high-tier audio configurations are hosted on remote endpoints (e.g., AWS S3 CDN). They are dynamically fetched, downloaded, and allocated into RAM memory caches on the fly during the matchmaking sequence.

### 7.4 Telemetry, Hard Re-sync & Diagnostics
 * The network layer continually monitors a running hash of critical game metrics (Total entities, Active Elixir, Individual entity HP pools).
 * If a hash mismatch occurs between client and server states, a DesyncException is intercepted. Rather than crashing the instance, the server fires a complete master state snapshot package over the pipeline. The client purges its local simulation timeline, overrides its coordinates instantly with the server snapshot within one frame, and seamlessly resumes play.

## 8. STEP-BY-STEP IMPLEMENTATION FLOW
When initializing this project, you must write modular, production-ready code executing through these phases sequentially:
 1. **Phase 1 (Backend Foundation):** Build the Node.js/TypeScript server setup using WebSockets. Implement the 20Hz clock loop, room allocation queues, and base Supabase database abstraction handlers.
 2. **Phase 2 (Client Network Integration):** Build the client-side state interpolation engine. Connect to the WebSocket stream, process incoming positions smoothly, and eliminate jitter.
 3. **Phase 3 (Possession Pipeline):** Build the camera transition scripts, state handoffs from local AI to direct player inputs, and input tracking configurations.
 4. **Phase 4 (Meta-game & UI):** Implement the silent authentication sequence, lobby menus, card decks, and LiveOps JSON configuration parsers.
 5. **Phase 5 (Polish & Systems):** Inject anti-cheat vector checks, spatial audio managers, and the deterministic replay playback system.
