export type ExtensionStorageChange = {
  oldValue?: unknown;
  newValue?: unknown;
};

type StorageArea = {
  get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type ExtensionApi = {
  storage?: {
    local: StorageArea;
    onChanged?: {
      addListener: (listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void) => void;
      removeListener: (listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void) => void;
    };
  };
  runtime?: {
    sendMessage: (message: unknown) => Promise<unknown>;
  };
  commands?: {
    getAll: () => Promise<Array<{ name?: string; shortcut?: string }>>;
    update?: (details: { name: string; shortcut: string }) => Promise<void>;
    openShortcutSettings?: () => Promise<void>;
  };
  tabs?: {
    create: (details: { url: string }) => Promise<unknown>;
  };
};

const extensionGlobals = globalThis as typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
};

export const extensionApi = extensionGlobals.browser ?? extensionGlobals.chrome;

export function hasExtensionStorage(): boolean {
  return Boolean(extensionApi?.storage?.local);
}

export async function extensionStorageGet<T>(key: string): Promise<T | null> {
  if (!extensionApi?.storage?.local) return null;
  const result = await extensionApi.storage.local.get(key);
  return (result[key] as T | undefined) ?? null;
}

export async function extensionStorageGetMany(keys: string[]): Promise<Record<string, unknown>> {
  if (!extensionApi?.storage?.local) return {};
  return await extensionApi.storage.local.get(keys);
}

export async function extensionStorageSet<T>(key: string, value: T): Promise<void> {
  if (!extensionApi?.storage?.local) return;
  await extensionApi.storage.local.set({ [key]: value });
}

export async function extensionStorageSetMany(items: Record<string, unknown>): Promise<void> {
  if (!extensionApi?.storage?.local) return;
  await extensionApi.storage.local.set(items);
}

export async function extensionStorageRemove(key: string): Promise<void> {
  if (!extensionApi?.storage?.local) return;
  await extensionApi.storage.local.remove(key);
}

export async function sendExtensionMessage<T>(message: unknown): Promise<T | null> {
  if (!extensionApi?.runtime?.sendMessage) return null;
  return await extensionApi.runtime.sendMessage(message) as T;
}

export function subscribeToExtensionStorage(
  listener: (changes: Record<string, ExtensionStorageChange>, areaName: string) => void,
): () => void {
  const event = extensionApi?.storage?.onChanged;
  if (!event) return () => undefined;
  event.addListener(listener);
  return () => event.removeListener(listener);
}
