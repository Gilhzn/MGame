export interface ServerEnv {
  port: number;
  jwtSecret: string;
  databaseUrl: string | null; // null → in-memory repositories
  liveOpsPath: string | null; // null → repo default config/liveops.json
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    port: env.PORT ? Number(env.PORT) : 8080,
    jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
    databaseUrl: env.DATABASE_URL ?? null,
    liveOpsPath: env.LIVEOPS_PATH ?? null,
  };
}
