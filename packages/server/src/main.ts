import { createServer } from 'node:http';
import { FakeOAuthVerifier } from './auth/oauthLink.js';
import { loadEnv } from './config/env.js';
import { Router } from './http/router.js';
import { LiveOpsConfigService } from './liveops/configService.js';
import { ChestService } from './meta/chestService.js';
import { createMemoryRepos } from './persistence/memory.js';
import { createPgRepos } from './persistence/pg.js';
import { registerRoutes } from './routes/registerRoutes.js';
import { systemClock } from './util/clock.js';
import { Gateway } from './ws/gateway.js';

const env = loadEnv();
const clock = systemClock;
const repos = env.databaseUrl ? createPgRepos(env.databaseUrl) : createMemoryRepos();
const liveops = new LiveOpsConfigService(env.liveOpsPath);
const chests = new ChestService(repos, liveops, clock);
// Real Google/Apple verification is deliberately stubbed (docs/architecture.md).
const verifier = new FakeOAuthVerifier();

const router = new Router(env.jwtSecret, clock);
registerRoutes(router, { repos, liveops, chests, verifier, jwtSecret: env.jwtSecret, clock });

const httpServer = createServer(router.listener());
new Gateway({ httpServer, jwtSecret: env.jwtSecret, repos, liveops, clock });

httpServer.listen(env.port, () => {
  console.log(
    `[overlord] server up on :${env.port} — liveops ${liveops.version()}, ` +
      `persistence ${env.databaseUrl ? 'postgres' : 'memory'}`,
  );
});
