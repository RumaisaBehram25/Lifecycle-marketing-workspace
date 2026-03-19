const ENV_API_KEY = (import.meta.env.VITE_GOOGLE_DRIVE_API_KEY as string | undefined)?.trim() || '';
const ENV_FOLDER_ID = (import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID as string | undefined)?.trim() || '';

const CONNECTION_PREFIX = 'google-drive-connection:';

function sessionKey(clientId: string | undefined): string {
  return `${CONNECTION_PREFIX}${clientId ?? 'default'}`;
}

function newSlotId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** One saved Drive connection (API key + folders). */
export interface DriveSlot {
  id: string;
  apiKey: string;
  folders: string[];
  createdAt: number;
}

interface StoredStateV2 {
  slots: DriveSlot[];
}

/** @deprecated */
export function driveConnectionStorageKey(clientId: string | undefined): string {
  return sessionKey(clientId);
}

function parseLegacySingle(o: Record<string, unknown>): DriveSlot[] {
  const apiKey = o.apiKey;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return [];

  const foldersField = o.folders;
  if (Array.isArray(foldersField)) {
    const folders = foldersField.filter((x): x is string => typeof x === 'string');
    return [{ id: newSlotId(), apiKey: apiKey.trim(), folders, createdAt: Date.now() }];
  }
  const legacyId = o.folderId;
  if (typeof legacyId === 'string' && legacyId.trim()) {
    return [{ id: newSlotId(), apiKey: apiKey.trim(), folders: [legacyId.trim()], createdAt: Date.now() }];
  }
  return [{ id: newSlotId(), apiKey: apiKey.trim(), folders: [], createdAt: Date.now() }];
}

function readStoredState(clientId: string | undefined): StoredStateV2 {
  try {
    const raw = sessionStorage.getItem(sessionKey(clientId));
    if (!raw) return { slots: [] };
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return { slots: [] };

    if (Array.isArray((o as StoredStateV2).slots)) {
      const slots = (o as StoredStateV2).slots
        .filter(
          (s): s is DriveSlot =>
            s &&
            typeof s === 'object' &&
            typeof (s as DriveSlot).id === 'string' &&
            typeof (s as DriveSlot).apiKey === 'string' &&
            Array.isArray((s as DriveSlot).folders)
        )
        .map(s => ({
          id: s.id,
          apiKey: s.apiKey,
          folders: s.folders.filter((x): x is string => typeof x === 'string'),
          createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
        }));
      return { slots };
    }

    return { slots: parseLegacySingle(o as Record<string, unknown>) };
  } catch {
    return { slots: [] };
  }
}

function writeStoredState(clientId: string | undefined, state: StoredStateV2): void {
  sessionStorage.setItem(sessionKey(clientId), JSON.stringify(state));
}

export function getDriveSlots(clientId: string | undefined): DriveSlot[] {
  return readStoredState(clientId).slots;
}

export function setDriveSlots(clientId: string | undefined, slots: DriveSlot[]): void {
  writeStoredState(clientId, { slots });
}

export function addDriveSlot(clientId: string | undefined, apiKey: string, folders: string[]): DriveSlot {
  const slots = getDriveSlots(clientId);
  const slot: DriveSlot = {
    id: newSlotId(),
    apiKey: apiKey.trim(),
    folders: [...folders],
    createdAt: Date.now(),
  };
  writeStoredState(clientId, { slots: [...slots, slot] });
  return slot;
}

export function removeDriveSlot(clientId: string | undefined, slotId: string): void {
  const slots = getDriveSlots(clientId).filter(s => s.id !== slotId);
  writeStoredState(clientId, { slots });
}

export function clearAllDriveSessionConnections(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(CONNECTION_PREFIX)) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function purgeLegacyDriveLocalStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CONNECTION_PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function extractGoogleDriveFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  try {
    const u = new URL(trimmed);
    const fromPath = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (fromPath) return fromPath[1];
    const idParam = u.searchParams.get('id');
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) return idParam;
  } catch {
    /* not a valid URL */
  }

  const fallback = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fallback) return fallback[1];

  return null;
}

export interface ResolvedDriveFolder {
  key: string;
  slotId: string;
  folderId: string;
  folderName: string;
  apiKey: string;
}

/**
 * All folder targets across saved slots; each row has its slot's API key.
 * If no slots, falls back once to .env (single folder).
 */
export function getResolvedDriveFolders(clientId: string | undefined): ResolvedDriveFolder[] {
  const slots = getDriveSlots(clientId);
  const result: ResolvedDriveFolder[] = [];

  const pushFromFolders = (slotId: string, apiKey: string, folderRaws: string[]) => {
    let n = 0;
    const seen = new Set<string>();
    for (const raw of folderRaws) {
      const id = extractGoogleDriveFolderId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      n += 1;
      result.push({
        key: `${slotId}_${id}_${n}`,
        slotId,
        folderId: id,
        apiKey,
        folderName: `Connected folders ${n}`,
      });
    }
  };

  for (const slot of slots) {
    if (!slot.apiKey.trim() || !slot.folders.length) continue;
    pushFromFolders(slot.id, slot.apiKey, slot.folders);
  }

  if (result.length === 0 && ENV_API_KEY && ENV_FOLDER_ID) {
    const fid = extractGoogleDriveFolderId(ENV_FOLDER_ID) || ENV_FOLDER_ID.trim();
    if (fid) {
      result.push({
        key: `_env_${fid}`,
        slotId: '_env',
        folderId: fid,
        apiKey: ENV_API_KEY,
        folderName: 'Connected folders 1',
      });
    }
  }

  return result;
}

/** @deprecated use getDriveSlots */
export function getSavedDriveConnection(clientId: string | undefined): { apiKey: string; folders: string[] } | null {
  const slots = getDriveSlots(clientId);
  if (slots.length === 0) return null;
  const last = slots[slots.length - 1];
  return { apiKey: last.apiKey, folders: last.folders };
}

/** @deprecated use addDriveSlot */
export function saveDriveConnection(
  clientId: string | undefined,
  connection: { apiKey: string; folders: string[] }
): void {
  addDriveSlot(clientId, connection.apiKey, connection.folders);
}

/** @deprecated */
export function clearSavedDriveConnection(clientId: string | undefined): void {
  setDriveSlots(clientId, []);
}

/** @deprecated */
export function getEffectiveDriveApiKey(clientId: string | undefined): string {
  const slots = getDriveSlots(clientId);
  if (slots.length > 0) return slots[slots.length - 1].apiKey;
  return ENV_API_KEY;
}
