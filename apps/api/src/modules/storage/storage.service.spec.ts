import { StorageService, withAvatarUrl } from './storage.service';
import { StorageProvider } from './storage.types';

describe('StorageService.signedUrlsByKey', () => {
  let provider: { signedUrl: jest.Mock };
  let svc: StorageService;

  beforeEach(() => {
    provider = { signedUrl: jest.fn((key: string) => Promise.resolve(`https://cdn/${key}?sig=1`)) };
    svc = new StorageService(provider as unknown as StorageProvider);
  });

  it('signs every distinct key and maps it to its URL', async () => {
    const map = await svc.signedUrlsByKey(['avatars/a.png', 'avatars/b.png']);

    expect(map.get('avatars/a.png')).toBe('https://cdn/avatars/a.png?sig=1');
    expect(map.get('avatars/b.png')).toBe('https://cdn/avatars/b.png?sig=1');
  });

  it('skips null/undefined keys and deduplicates repeats', async () => {
    const map = await svc.signedUrlsByKey(['avatars/a.png', null, undefined, 'avatars/a.png']);

    expect(provider.signedUrl).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(1);
  });

  it('omits a key that fails to sign rather than rejecting the whole batch', async () => {
    provider.signedUrl.mockImplementation((key: string) =>
      key === 'avatars/bad.png' ? Promise.reject(new Error('gone')) : Promise.resolve(`https://cdn/${key}`),
    );

    const map = await svc.signedUrlsByKey(['avatars/bad.png', 'avatars/ok.png']);

    expect(map.has('avatars/bad.png')).toBe(false);
    expect(map.get('avatars/ok.png')).toBe('https://cdn/avatars/ok.png');
  });
});

describe('withAvatarUrl', () => {
  const signed = new Map([['avatars/a.png', 'https://cdn/avatars/a.png']]);

  it('replaces the raw storage key with the signed URL', () => {
    const shaped = withAvatarUrl({ firstName: 'Ada', avatarKey: 'avatars/a.png' }, signed);

    expect(shaped).toEqual({ firstName: 'Ada', avatarUrl: 'https://cdn/avatars/a.png' });
    expect('avatarKey' in shaped).toBe(false);
  });

  it('yields a null avatarUrl when the user never uploaded one, so initials still render', () => {
    expect(withAvatarUrl({ firstName: 'Ada', avatarKey: null }, signed)).toEqual({
      firstName: 'Ada',
      avatarUrl: null,
    });
  });

  it('yields null when the key exists but could not be signed', () => {
    expect(withAvatarUrl({ firstName: 'Ada', avatarKey: 'avatars/missing.png' }, signed).avatarUrl).toBeNull();
  });
});
