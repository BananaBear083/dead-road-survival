"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LOCAL_SAVE_CHANGED_EVENT } from "./saveData";
import {
  AccountApiError,
  getActiveSession,
  getSupabaseConfig,
  mergeAndSyncAccountSave,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  switchToGuestSave,
  type AccountSession,
} from "./supabase";

type FormMode = "login" | "register";
type SyncState = "idle" | "syncing" | "saved" | "error";

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "未知错误";
  if (/invalid login credentials/i.test(message)) return "邮箱或密码错误";
  if (/email not confirmed/i.test(message)) return "请先打开验证邮件完成邮箱确认";
  if (/user already registered/i.test(message)) return "这个邮箱已经注册，请直接登录";
  if (/password.*(least|characters|weak)/i.test(message)) return "密码强度不足，请至少输入 8 位字符";
  if (/failed to fetch|network/i.test(message)) return "网络连接失败，请稍后重试";
  if (error instanceof AccountApiError && error.status === 429) return "操作过于频繁，请稍后重试";
  return message;
}

export function AccountControl() {
  const configured = Boolean(getSupabaseConfig());
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FormMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<AccountSession | null>(null);
  const [checking, setChecking] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const sessionRef = useRef<AccountSession | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  const rememberSession = useCallback((next: AccountSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  useEffect(() => {
    if (!configured) {
      if (switchToGuestSave()) window.location.reload();
      return;
    }
    let active = true;
    void (async () => {
      let stored: AccountSession | null;
      try {
        stored = await getActiveSession();
      } catch {
        if (active) {
          rememberSession(null);
          setSyncState("error");
          if (switchToGuestSave()) window.location.reload();
        }
        return;
      } finally {
        if (active) setChecking(false);
      }
      if (!active) return;
      if (!stored) {
        rememberSession(null);
        if (switchToGuestSave()) window.location.reload();
        return;
      }
      rememberSession(stored);
      setSyncState("syncing");
      try {
        const result = await mergeAndSyncAccountSave(stored);
        if (!active) return;
        rememberSession(result.session);
        setSyncState("saved");
        if (result.activeSaveChanged) window.location.reload();
      } catch {
        if (!active) return;
        rememberSession(stored);
        setSyncState("error");
      }
    })();
    return () => { active = false; };
  }, [configured, rememberSession]);

  useEffect(() => {
    if (!configured) return;
    const queueSync = () => {
      if (!sessionRef.current) return;
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      setSyncState("syncing");
      syncTimerRef.current = window.setTimeout(async () => {
        try {
          const active = await getActiveSession();
          if (!active) {
            rememberSession(null);
            setSyncState("error");
            return;
          }
          rememberSession(active);
          await mergeAndSyncAccountSave(active);
          setSyncState("saved");
        } catch {
          setSyncState("error");
        }
      }, 900);
    };
    window.addEventListener(LOCAL_SAVE_CHANGED_EVENT, queueSync);
    return () => {
      window.removeEventListener(LOCAL_SAVE_CHANGED_EVENT, queueSync);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    };
  }, [configured, rememberSession]);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || (mode === "register" && password.length < 8)) {
      setMessage(mode === "register" ? "请输入有效邮箱和至少 8 位密码" : "请输入邮箱和密码");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "register") {
        const nextSession = await signUpWithPassword(normalizedEmail, password);
        if (!nextSession) {
          setMessage("注册成功！请打开验证邮件，然后返回游戏登录。");
          setMode("login");
          setPassword("");
          return;
        }
        rememberSession(nextSession);
        await mergeAndSyncAccountSave(nextSession);
      } else {
        const nextSession = await signInWithPassword(normalizedEmail, password);
        rememberSession(nextSession);
        await mergeAndSyncAccountSave(nextSession);
      }
      setMessage("登录成功，云存档已合并，正在载入……");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }, [email, mode, password, rememberSession]);

  const manualSync = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    setSyncState("syncing");
    try {
      const result = await mergeAndSyncAccountSave(session ?? undefined);
      rememberSession(result.session);
      setSyncState("saved");
      setMessage("本地与云端进度已合并，正在载入……");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setSyncState("error");
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }, [rememberSession, session]);

  const logout = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signOut(session);
      const switchedSave = switchToGuestSave();
      rememberSession(null);
      setSyncState("idle");
      setMessage("已退出账号；账号存档已保留，并已切回游客进度。");
      if (switchedSave) window.setTimeout(() => window.location.reload(), 250);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }, [rememberSession, session]);

  const openPanel = () => {
    setMessage(null);
    setOpen(true);
  };

  const statusLabel = !configured
    ? "云存档未配置"
    : checking
      ? "账号检查中"
      : session
        ? syncState === "syncing" ? "云端同步中" : "云存档"
        : "登录";

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div className="account-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) setOpen(false);
    }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <button className="account-close" type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="关闭账号窗口">×</button>
        <p className="account-eyebrow">DEAD ROAD CLOUD</p>
        <h2 id="account-title">{session ? "幸存者账号" : mode === "login" ? "登录云存档" : "创建账号"}</h2>

        {!configured ? (
          <div className="account-config-note">
            <p>游戏尚未连接 Supabase。完成 README 中的云存档配置并重新部署后，玩家即可注册账号。</p>
            <code>VITE_SUPABASE_URL</code>
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </div>
        ) : session ? (
          <div className="account-session">
            <span>当前账号</span>
            <strong>{session.user.email}</strong>
            <p>通关、图鉴和生存进度会继续保存在本机，并在产生新存档后自动上传。</p>
            <div className={`account-sync-status ${syncState}`}>
              <i aria-hidden="true" />
              {syncState === "syncing" ? "正在同步" : syncState === "error" ? "上次同步失败" : "云存档已启用"}
            </div>
            <div className="account-actions">
              <button className="account-primary" type="button" onClick={manualSync} disabled={busy}>立即同步</button>
              <button className="account-secondary" type="button" onClick={logout} disabled={busy}>退出账号</button>
            </div>
          </div>
        ) : (
          <>
            <div className="account-tabs" role="tablist" aria-label="账号操作">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setMessage(null); }}>登录</button>
              <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setMessage(null); }}>注册</button>
            </div>
            <form className="account-form" onSubmit={submit}>
              <label>
                <span>邮箱</span>
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="survivor@example.com" required />
              </label>
              <label>
                <span>密码</span>
                <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "register" ? 8 : 1} placeholder={mode === "register" ? "至少 8 位字符" : "输入密码"} required />
              </label>
              <button className="account-primary" type="submit" disabled={busy}>{busy ? "处理中……" : mode === "login" ? "登录并同步" : "注册并保存"}</button>
            </form>
            <p className="account-hint">首次登录会合并本机和云端进度，不会覆盖已经通关的关卡。</p>
          </>
        )}

        {message && <p className="account-message" role="status">{message}</p>}
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button type="button" className={`account-trigger ${session ? "signed-in" : ""}`} onClick={openPanel} title={session?.user.email ?? statusLabel}>
        <span aria-hidden="true">{session ? "✓" : "♙"}</span>
        <b>{statusLabel}</b>
      </button>
      {modal}
    </>
  );
}
