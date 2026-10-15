import { FalkorDB } from 'falkordb';

export interface GraphConfig {
  host: string;
  port: number;
  graphName: string;
  username?: string;
  password?: string;
  tls: boolean;
  /** Upper bound for connect and for each named operation, in milliseconds. */
  timeoutMs: number;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GraphConfig {
  const port = Number(env['FALKORDB_PORT'] ?? 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid FALKORDB_PORT');
  const timeoutMs = Number(env['FALKORDB_TIMEOUT_MS'] ?? 3000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw new Error('Invalid FALKORDB_TIMEOUT_MS');
  const config: GraphConfig = {
    host: env['FALKORDB_HOST'] || '127.0.0.1',
    port,
    graphName: env['FALKORDB_GRAPH'] || 'wad_studio',
    tls: env['FALKORDB_TLS'] === 'true',
    timeoutMs
  };
  if (env['FALKORDB_USERNAME']) config.username = env['FALKORDB_USERNAME'];
  if (env['FALKORDB_PASSWORD']) config.password = env['FALKORDB_PASSWORD'];
  return config;
}

/** Failure classes surfaced to callers; messages never include query parameters or credentials. */
export class GraphUnavailableError extends Error {
  constructor(readonly reason: 'CONNECTION_FAILED' | 'QUERY_FAILED', message: string) {
    super(message);
    this.name = 'GraphUnavailableError';
  }
}

export type ParamValue = null | string | number | boolean | ParamValue[] | { [key: string]: ParamValue };
export type Params = { [key: string]: ParamValue };

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(onTimeout()), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Thin wrapper over the official client. Every call is bounded by timeoutMs. Any failure drops the
 * connection so the next call reconnects; nothing is cached and no fallback result is produced.
 */
export class GraphClient {
  #db: FalkorDB | null = null;
  #connecting: Promise<FalkorDB> | null = null;
  constructor(readonly config: GraphConfig) {}

  async #connection(): Promise<FalkorDB> {
    if (this.#db) return this.#db;
    if (!this.#connecting) {
      const c = this.config;
      const socket = c.tls
        ? { host: c.host, port: c.port, tls: true as const, connectTimeout: c.timeoutMs, reconnectStrategy: false as const }
        : { host: c.host, port: c.port, connectTimeout: c.timeoutMs, reconnectStrategy: false as const };
      const options = { socket, ...(c.username ? { username: c.username } : {}), ...(c.password ? { password: c.password } : {}) };
      this.#connecting = withTimeout(FalkorDB.connect(options), c.timeoutMs,
        () => new GraphUnavailableError('CONNECTION_FAILED', 'Graph connection timed out'))
        .then(db => {
          db.on('error', () => { this.#drop(); });
          this.#db = db;
          return db;
        })
        .catch(err => {
          throw err instanceof GraphUnavailableError ? err : new GraphUnavailableError('CONNECTION_FAILED', 'Graph connection failed');
        })
        .finally(() => { this.#connecting = null; });
    }
    return this.#connecting;
  }

  #drop(): void {
    const db = this.#db;
    this.#db = null;
    if (db) db.close().catch(() => undefined);
  }

  async #run<T>(mode: 'ro' | 'rw', cypher: string, params: Params): Promise<T[]> {
    const db = await this.#connection();
    const graph = db.selectGraph(this.config.graphName);
    try {
      const call = mode === 'ro' ? graph.roQuery<T>(cypher, { params }) : graph.query<T>(cypher, { params });
      const reply = await withTimeout(call, this.config.timeoutMs,
        () => new GraphUnavailableError('QUERY_FAILED', 'Graph query timed out'));
      return reply.data ?? [];
    } catch (err) {
      this.#drop();
      if (err instanceof GraphUnavailableError) throw err;
      throw new GraphUnavailableError('QUERY_FAILED', 'Graph query failed');
    }
  }

  /** Read-only named query (GRAPH.RO_QUERY). */
  read<T>(cypher: string, params: Params = {}): Promise<T[]> { return this.#run<T>('ro', cypher, params); }
  /** Write used only by the seed and explicit narrow mutation operations in this package. */
  write<T>(cypher: string, params: Params = {}): Promise<T[]> { return this.#run<T>('rw', cypher, params); }

  async close(): Promise<void> {
    const db = this.#db;
    this.#db = null;
    if (db) await withTimeout(db.close(), this.config.timeoutMs, () => new Error('close timed out')).catch(() => undefined);
  }
}
