import {
  GUEST_SAVE_OWNER,
  accountSaveOwner,
  activateSaveOwner,
  cacheActiveLocalSave,
  getActiveSaveOwner,
  guestMigrationOwner,
  markGuestSaveMigrated,
  mergeCloudSaves,
  normalizeCloudSave,
  readOwnerSave,
  sameSaveContent,
  sameSaveOwner,
  type CloudSaveData,
} from "./saveData";

const SESSION_KEY = "dead-road-account-session";

type PublicEnvironment = Record<string, string | boolean | undefined>;

export type AccountUser = {
  id: string;
  email: string;
};

export type AccountSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AccountUser;
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string } | null;
};

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

export class AccountApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AccountApiError";
  }
}

function environment(): PublicEnvironment {
  return ((import.meta as ImportMeta & { env?: PublicEnvironment }).env ?? {});
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const env = environment();
  const url = String(env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const publishableKey = String(
    env.VITE_SUPABASE_PUBLISHABLE_KEY
      ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ?? env.VITE_SUPABASE_ANON_KEY
      ?? "",
  ).trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

function requireConfig(): SupabaseConfig {
  const config = getSupabaseConfig();
  if (!config) throw new AccountApiError("云存档尚未配置", 0);
  return config;
}

async function responseError(response: Response): Promise<AccountApiError> {
  let message = `请求失败（${response.status}）`;
  try {
    const body = await response.json() as Record<string, unknown>;
    const candidate = body.msg ?? body.message ?? body.error_description ?? body.error;
    if (typeof candidate === "string" && candidate) message = candidate;
  } catch {
    // Non-JSON proxy errors retain the status-based fallback.
  }
  return new AccountApiError(message, response.status);
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const config = requireConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.publishableKey);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${config.url}${path}`, { ...init, headers });
  if (!response.ok) throw await responseError(response);
  if (response.status === 204 || response.headers.get("content-length") === "0") return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function sessionFromAuth(response: AuthResponse): AccountSession | null {
  const userId = response.user?.id;
  const email = response.user?.email;
  if (!response.access_token || !response.refresh_token || !userId || !email) return null;
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: Date.now() + Math.max(60, response.expires_in ?? 3600) * 1000,
    user: { id: userId, email },
  };
}

function validStoredSession(value: unknown): AccountSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const session = value as Partial<AccountSession>;
  if (typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") return null;
  if (typeof session.expiresAt !== "number" || !Number.isFinite(session.expiresAt)) return null;
  if (!session.user || typeof session.user.id !== "string" || typeof session.user.email !== "string") return null;
  return session as AccountSession;
}

function storeSession(session: AccountSession | null) {
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

export function loadStoredSession(): AccountSession | null {
  try {
    return validStoredSession(JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export async function refreshSession(session: AccountSession): Promise<AccountSession> {
  try {
    const response = await apiRequest<AuthResponse>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const refreshed = sessionFromAuth(response);
    if (!refreshed) throw new AccountApiError("登录状态已失效，请重新登录", 401);
    storeSession(refreshed);
    return refreshed;
  } catch (error) {
    if (error instanceof AccountApiError && (error.status === 400 || error.status === 401)) storeSession(null);
    throw error;
  }
}

export async function getActiveSession(): Promise<AccountSession | null> {
  const stored = loadStoredSession();
  if (!stored) return null;
  if (stored.expiresAt > Date.now() + 60_000) return stored;
  return refreshSession(stored);
}

export async function signUpWithPassword(email: string, password: string): Promise<AccountSession | null> {
  const redirectTo = typeof window === "undefined" ? "" : window.location.href.split("#")[0];
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
  const response = await apiRequest<AuthResponse>(`/auth/v1/signup${query}`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session = sessionFromAuth(response);
  if (session) storeSession(session);
  return session;
}

export async function signInWithPassword(email: string, password: string): Promise<AccountSession> {
  const response = await apiRequest<AuthResponse>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const session = sessionFromAuth(response);
  if (!session) throw new AccountApiError("登录返回无效，请稍后重试", 500);
  storeSession(session);
  return session;
}

export async function signOut(session: AccountSession | null): Promise<void> {
  try {
    if (session) await apiRequest("/auth/v1/logout", { method: "POST" }, session.accessToken);
  } catch {
    // Local logout must still succeed when the network or remote session is unavailable.
  } finally {
    storeSession(null);
  }
}

export async function downloadCloudSave(session: AccountSession): Promise<CloudSaveData | null> {
  const rows = await apiRequest<Array<{ save_data?: unknown }>>(
    `/rest/v1/game_saves?select=save_data&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { method: "GET" },
    session.accessToken,
  );
  return rows[0]?.save_data ? normalizeCloudSave(rows[0].save_data) : null;
}

export async function uploadCloudSave(session: AccountSession, saveValue: unknown): Promise<void> {
  const save = normalizeCloudSave(saveValue);
  await apiRequest("/rest/v1/game_saves?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: session.user.id,
      save_data: save,
      updated_at: save.updatedAt,
    }),
  }, session.accessToken);
}

/**
 * Downloads and merges before every upload. Local caches are namespaced by user
 * so switching accounts in a shared browser cannot copy one player's save into
 * another player's row.
 */
export async function mergeAndSyncAccountSave(sessionValue?: AccountSession): Promise<{
  session: AccountSession;
  save: CloudSaveData;
  activeSaveChanged: boolean;
}> {
  const session = sessionValue ?? await getActiveSession();
  if (!session) throw new AccountApiError("请先登录账号", 401);

  const previousOwner = getActiveSaveOwner();
  const accountOwner = accountSaveOwner(session.user.id);
  const previousActiveSave = cacheActiveLocalSave();
  let local = sameSaveOwner(previousOwner, accountOwner)
    ? previousActiveSave
    : readOwnerSave(accountOwner);
  let claimedGuestSave = false;
  if (!local && !guestMigrationOwner()) {
    local = readOwnerSave(GUEST_SAVE_OWNER);
    claimedGuestSave = Boolean(local);
  }

  const cloud = await downloadCloudSave(session);
  const merged = cloud ? mergeCloudSaves(local, cloud) : mergeCloudSaves(local, null);
  const activeSaveChanged = !sameSaveOwner(previousOwner, accountOwner) || !sameSaveContent(previousActiveSave, merged);
  activateSaveOwner(accountOwner, merged);
  if (claimedGuestSave) markGuestSaveMigrated(session.user.id);
  await uploadCloudSave(session, merged);
  return { session, save: merged, activeSaveChanged };
}

export function switchToGuestSave(): boolean {
  const previousOwner = getActiveSaveOwner();
  const previousSave = cacheActiveLocalSave();
  if (sameSaveOwner(previousOwner, GUEST_SAVE_OWNER)) return false;
  const guestSave = readOwnerSave(GUEST_SAVE_OWNER) ?? normalizeCloudSave(null);
  activateSaveOwner(GUEST_SAVE_OWNER, guestSave);
  return !sameSaveOwner(previousOwner, GUEST_SAVE_OWNER) || !sameSaveContent(previousSave, guestSave);
}
