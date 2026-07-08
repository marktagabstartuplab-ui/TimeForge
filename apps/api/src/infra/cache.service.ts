import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getContext } from '../common/context/request-context';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Commands use `maxRetriesPerRequest: null` (see infra.module.ts) so ioredis queues
 *  forever instead of rejecting while disconnected — bound every call so a Redis
 *  outage degrades to "no cache" instead of hanging the request indefinitely. */
const CACHE_TIMEOUT_MS = 300;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), CACHE_TIMEOUT_MS)),
  ]);
}

/** Tenant-scoped Redis cache (keys prefixed with `t:<tenantId>:`) — best-effort: a
 *  slow or unreachable Redis degrades to a cache miss rather than failing the request. */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private scopedKey(key: string): string {
    const tenant = getContext()?.tenantId ?? 'global';
    return `t:${tenant}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await withTimeout(this.redis.get(this.scopedKey(key)), null);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Cache get failed for "${key}": ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    try {
      await withTimeout(this.redis.set(this.scopedKey(key), JSON.stringify(value), 'EX', ttlSeconds), null);
    } catch (err) {
      this.logger.warn(`Cache set failed for "${key}": ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await withTimeout(this.redis.del(this.scopedKey(key)), null);
    } catch (err) {
      this.logger.warn(`Cache del failed for "${key}": ${(err as Error).message}`);
    }
  }
}
