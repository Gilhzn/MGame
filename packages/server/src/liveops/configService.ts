import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLiveOpsConfig, type LiveOpsConfig } from '@overlord/protocol';

const DEFAULT_PATH = fileURLToPath(new URL('../../../../config/liveops.json', import.meta.url));

/**
 * The single centralized LiveOps config (PRD 6): loaded and validated at
 * boot, served verbatim over `GET /config`, and stamped into every match
 * (configVersion) so replays bind to the exact tuning they ran under.
 */
export class LiveOpsConfigService {
  private config: LiveOpsConfig;

  constructor(path: string | null = null) {
    const raw = readFileSync(path ?? DEFAULT_PATH, 'utf8');
    this.config = parseLiveOpsConfig(JSON.parse(raw));
  }

  get(): LiveOpsConfig {
    return this.config;
  }

  version(): string {
    return this.config.liveops_version;
  }

  /** Test hook / hot-reload entry point. */
  replace(config: LiveOpsConfig): void {
    this.config = parseLiveOpsConfig(config);
  }
}
