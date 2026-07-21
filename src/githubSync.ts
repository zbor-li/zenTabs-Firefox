import type { ZenTabBackup } from './types';
import {
  getStoredValue,
  removeStoredValue,
  setStoredValue,
  STORAGE_KEYS,
} from './storage';
import type { Language } from './i18n';
import { t } from './i18n';
import { createBackup, restoreBackup } from './backup';

export { createBackup } from './backup';

const API_ROOT = 'https://api.github.com';
const BACKUP_FILE = 'zen-tab-backup.json';
const API_VERSION = '2022-11-28';
const CHUNK_FORMAT = 'zen-tab-chunked-v1';
const CHUNK_BYTE_SIZE = 512 * 1024;
const MAX_INLINE_BACKUP_BYTES = 700 * 1024;

export type GitHubSyncProgress = (message: string) => void;

type GitHubUser = {
  login: string;
};

type GistFile = {
  content?: string;
  raw_url?: string;
  truncated?: boolean;
};

type GitHubGist = {
  id: string;
  html_url: string;
  updated_at?: string;
  files: Record<string, GistFile>;
};

type ChunkManifest = {
  format: typeof CHUNK_FORMAT;
  encoding: 'base64-utf8';
  byteLength: number;
  chunks: string[];
};

type GistFileUpdate = { content: string } | null;

function compareGistRecency(left: GitHubGist, right: GitHubGist): number {
  const timeDifference = (Date.parse(left.updated_at ?? '') || 0) - (Date.parse(right.updated_at ?? '') || 0);
  return timeDifference || left.id.localeCompare(right.id);
}

class GitHubRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubRequestError';
    this.status = status;
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  };
}

async function githubRequest<T>(path: string, token: string, language: Language, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      ...headers(token),
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const message = response.status === 401
      ? t(language, 'githubTokenInvalid')
      : response.status === 403
        ? t(language, 'githubPermissionMissing')
        : t(language, 'githubRequestFailed', { status: String(response.status) });
    throw new GitHubRequestError(message, response.status);
  }

  return await response.json() as T;
}

async function findBackupGist(
  token: string,
  language: Language,
  excludedIds: ReadonlySet<string> = new Set(),
): Promise<GitHubGist | null> {
  const perPage = 100;
  let newest: GitHubGist | null = null;
  for (let page = 1; ; page += 1) {
    const gists = await githubRequest<GitHubGist[]>(
      `/gists?per_page=${perPage}&page=${page}`,
      token,
      language,
    );
    for (const gist of gists) {
      if (excludedIds.has(gist.id) || !gist.files?.[BACKUP_FILE]) continue;
      if (!newest || compareGistRecency(gist, newest) > 0) newest = gist;
    }
    if (gists.length < perPage) return newest;
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof GitHubRequestError && error.status === 404;
}

function isStaleGistReference(error: unknown): boolean {
  return error instanceof GitHubRequestError && [403, 404, 410].includes(error.status);
}

async function resolveBackupGist(token: string, language: Language): Promise<GitHubGist | null> {
  const cachedId = await getStoredValue<string>(STORAGE_KEYS.githubGistId);
  const excludedIds = new Set<string>();
  let cached: GitHubGist | null = null;

  if (cachedId) {
    try {
      const candidate = await githubRequest<GitHubGist>(`/gists/${cachedId}`, token, language);
      if (candidate.files?.[BACKUP_FILE]) cached = candidate;
      excludedIds.add(cachedId);
    } catch (error) {
      if (!isStaleGistReference(error)) throw error;
      excludedIds.add(cachedId);
    }
  }

  const found = await findBackupGist(token, language, excludedIds);
  const canonical = cached && (!found || compareGistRecency(cached, found) >= 0)
    ? cached
    : found;
  if (!canonical) {
    await removeStoredValue(STORAGE_KEYS.githubGistId);
    return null;
  }

  const detailed = cached?.id === canonical.id
    ? cached
    : await githubRequest<GitHubGist>(`/gists/${canonical.id}`, token, language);
  if (!detailed.files?.[BACKUP_FILE]) {
    await removeStoredValue(STORAGE_KEYS.githubGistId);
    return null;
  }

  await setStoredValue(STORAGE_KEYS.githubGistId, detailed.id);
  return detailed;
}

export async function connectGitHub(tokenInput: string, language: Language = 'zh'): Promise<{ login: string; gistId?: string }> {
  const token = tokenInput.trim();
  if (!token) throw new Error(t(language, 'githubTokenRequired'));
  const user = await githubRequest<GitHubUser>('/user', token, language);
  const gist = await findBackupGist(token, language);
  await setStoredValue(STORAGE_KEYS.githubToken, token);
  if (gist) {
    await setStoredValue(STORAGE_KEYS.githubGistId, gist.id);
  } else {
    await removeStoredValue(STORAGE_KEYS.githubGistId);
  }
  return { login: user.login, gistId: gist?.id };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const blockSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isZenTabChunkFile(name: string): boolean {
  return name.startsWith('zen-tab-backup.') && /\.part-\d+\.txt$/.test(name);
}

function createGistFiles(backup: ZenTabBackup): Record<string, { content: string }> {
  const content = JSON.stringify(backup);
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength <= MAX_INLINE_BACKUP_BYTES) {
    return { [BACKUP_FILE]: { content } };
  }

  const generation = backup.exportedAt.replace(/\D/g, '') || String(Date.now());
  const files: Record<string, { content: string }> = {};
  const chunks: string[] = [];
  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTE_SIZE, index += 1) {
    const name = `zen-tab-backup.${generation}.part-${String(index).padStart(3, '0')}.txt`;
    chunks.push(name);
    files[name] = { content: bytesToBase64(bytes.subarray(offset, offset + CHUNK_BYTE_SIZE)) };
  }

  const manifest: ChunkManifest = {
    format: CHUNK_FORMAT,
    encoding: 'base64-utf8',
    byteLength: bytes.byteLength,
    chunks,
  };
  files[BACKUP_FILE] = { content: JSON.stringify(manifest) };
  return files;
}

function buildUploadBody(
  files: Record<string, { content: string }>,
  existing: GitHubGist | null,
): string {
  const updates: Record<string, GistFileUpdate> = { ...files };
  if (existing) {
    for (const name of Object.keys(existing.files)) {
      if (isZenTabChunkFile(name) && !files[name]) updates[name] = null;
    }
  }
  return JSON.stringify({
    description: 'Zen Tab private settings backup',
    public: false,
    files: updates,
  });
}

export async function uploadBackup(language: Language = 'zh'): Promise<{ gistUrl: string; exportedAt: string }> {
  const token = await getStoredValue<string>(STORAGE_KEYS.githubToken);
  if (!token) throw new Error(t(language, 'githubConnectFirst'));

  const backup = await createBackup();
  let existing = await resolveBackupGist(token, language);
  const files = createGistFiles(backup);

  let gist: GitHubGist;
  try {
    const body = buildUploadBody(files, existing);
    gist = existing
      ? await githubRequest<GitHubGist>(`/gists/${existing.id}`, token, language, { method: 'PATCH', body })
      : await githubRequest<GitHubGist>('/gists', token, language, { method: 'POST', body });
  } catch (error) {
    if (!existing || !isNotFound(error)) throw error;
    await removeStoredValue(STORAGE_KEYS.githubGistId);
    existing = await resolveBackupGist(token, language);
    const body = buildUploadBody(files, existing);
    gist = existing
      ? await githubRequest<GitHubGist>(`/gists/${existing.id}`, token, language, { method: 'PATCH', body })
      : await githubRequest<GitHubGist>('/gists', token, language, { method: 'POST', body });
  }

  await setStoredValue(STORAGE_KEYS.githubGistId, gist.id);
  return { gistUrl: gist.html_url, exportedAt: backup.exportedAt };
}

async function readGistFile(file: GistFile, token: string, language: Language): Promise<string> {
  if (typeof file.content === 'string' && !file.truncated) return file.content;

  if (file.raw_url) {
    const attempts: RequestInit[] = [
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    ];
    for (const init of attempts) {
      try {
        const response = await fetch(file.raw_url, init);
        if (response.ok) return await response.text();
      } catch {
        // Try the next request mode. Firefox can reject a cross-origin
        // Authorization preflight even when the unguessable raw URL works.
      }
    }
  }

  throw new Error(t(language, 'githubBackupReadFailed'));
}

function isChunkManifest(value: unknown): value is ChunkManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Partial<ChunkManifest>;
  return manifest.format === CHUNK_FORMAT
    && manifest.encoding === 'base64-utf8'
    && typeof manifest.byteLength === 'number'
    && Number.isSafeInteger(manifest.byteLength)
    && manifest.byteLength >= 0
    && Array.isArray(manifest.chunks)
    && manifest.chunks.length > 0
    && manifest.chunks.length <= 1000
    && manifest.chunks.every(name => typeof name === 'string' && isZenTabChunkFile(name));
}

async function readBackupValue(
  gist: GitHubGist,
  token: string,
  language: Language,
): Promise<unknown> {
  const mainFile = gist.files[BACKUP_FILE];
  if (!mainFile) throw new Error(t(language, 'githubBackupFileMissing'));
  const mainContent = await readGistFile(mainFile, token, language);
  if (!mainContent) throw new Error(t(language, 'githubBackupEmpty'));

  let value: unknown;
  try {
    value = JSON.parse(mainContent) as unknown;
  } catch {
    throw new Error(t(language, 'githubBackupInvalid'));
  }
  if (!isChunkManifest(value)) return value;

  try {
    const parts = await Promise.all(value.chunks.map(async name => {
      const file = gist.files[name];
      if (!file) throw new Error('missing chunk');
      return base64ToBytes(await readGistFile(file, token, language));
    }));
    const actualLength = parts.reduce((total, part) => total + part.byteLength, 0);
    if (actualLength !== value.byteLength) throw new Error('invalid chunk length');
    const bytes = new Uint8Array(actualLength);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message === t(language, 'githubBackupReadFailed')) throw error;
    throw new Error(t(language, 'githubBackupReadFailed'));
  }
}

export async function downloadBackup(
  language: Language = 'zh',
  onProgress?: GitHubSyncProgress,
): Promise<ZenTabBackup> {
  const token = await getStoredValue<string>(STORAGE_KEYS.githubToken);
  if (!token) throw new Error(t(language, 'githubConnectFirst'));

  onProgress?.(t(language, 'githubFindingBackup'));
  const gist = await resolveBackupGist(token, language);
  if (!gist) throw new Error(t(language, 'githubBackupMissing'));
  onProgress?.(t(language, 'githubDownloadingBackup'));
  const value = await readBackupValue(gist, token, language);
  onProgress?.(t(language, 'githubSavingBackup'));
  return await restoreBackup(value, language);
}
