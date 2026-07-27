import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PROVIDER, StorageProvider, PutOptions } from './storage.types';

/**
 * Swaps a user's raw `avatarKey` for the signed `avatarUrl` every client reads,
 * given a map from `StorageService.signedUrlsByKey()`. Keeps list endpoints
 * consistent with the profile endpoints, which have always returned `avatarUrl`
 * — and keeps the raw storage key off the wire.
 */
export function withAvatarUrl<T extends { avatarKey: string | null }>(
  user: T,
  signed: Map<string, string>,
): Omit<T, 'avatarKey'> & { avatarUrl: string | null } {
  const { avatarKey, ...rest } = user;
  return { ...rest, avatarUrl: avatarKey ? (signed.get(avatarKey) ?? null) : null };
}

/** Lower-level storage facade — delegates to the configured provider. */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  put(key: string, data: Buffer, options?: PutOptions): Promise<string> {
    return this.provider.put(key, data, options);
  }

  get(key: string): Promise<Buffer> {
    return this.provider.get(key);
  }

  signedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.provider.signedUrl(key, expiresInSeconds);
  }

  /**
   * Signs a batch of keys for list payloads (directories, review queues), where
   * signing one at a time would mean one round trip per row. Keys are
   * deduplicated and signed in parallel, and a key that fails to sign is simply
   * absent from the map rather than rejecting — a single unreadable object must
   * not blank out the whole page.
   */
  async signedUrlsByKey(
    keys: readonly (string | null | undefined)[],
    expiresInSeconds?: number,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
    const entries = await Promise.all(
      unique.map(async (key) => {
        try {
          return [key, await this.provider.signedUrl(key, expiresInSeconds)] as const;
        } catch (err) {
          console.error(`[StorageService] Failed to sign URL for key: ${key}`, err);
          return null;
        }
      }),
    );
    return new Map(entries.filter((e): e is readonly [string, string] => e !== null));
  }

  remove(key: string): Promise<void> {
    return this.provider.remove(key);
  }
}
