import { useCallback, useRef, useState } from "react";

export type SyncAllStatus = "idle" | "running" | "complete" | "error";

export type SyncSseProgressEvent = {
  id: string;
  status: "ok" | "error";
  processed: number;
  total: number;
  error?: string;
};

export type SyncSseDoneEvent = {
  done: true;
  processed: number;
  failed: string[];
};

export type SyncAllStartOptions = {
  clientId: string;
  platformId: string;
  /** All canvas Braze ids to sync in one run (e.g. 309). */
  ids: string[];
  retryFailedOnly?: boolean;
  /** Bearer token or full `Authorization` header value from `supabase.auth.getSession()`. */
  getAuthorizationHeader: () => Promise<string | null>;
  /** Optional: POST target (default `new URL("/api/sync", window.location.origin)` or env). */
  apiBaseUrl?: string;
};

function parseSseBuffer(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    const line = block
      .split("\n")
      .find((l) => l.startsWith("data:"));
    if (!line) continue;
    const json = line.replace(/^data:\s*/, "").trim();
    if (!json) continue;
    try {
      events.push(JSON.parse(json) as unknown);
    } catch {
      // ignore malformed chunk
    }
  }
  return { events, rest };
}

export function useSyncAll() {
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<SyncAllStatus>("idle");
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const lastFailedRef = useRef<string[]>([]);

  const start = useCallback(async (opts: SyncAllStartOptions) => {
    const {
      clientId,
      platformId,
      ids,
      retryFailedOnly,
      getAuthorizationHeader,
      apiBaseUrl,
    } = opts;

    const auth = await getAuthorizationHeader();
    if (!auth) {
      setStatus("error");
      throw new Error("Not authenticated");
    }

    const authHeader = auth.startsWith("Bearer ") ? auth : `Bearer ${auth}`;

    const base =
      apiBaseUrl ??
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_SYNC_URL
        ? String(import.meta.env.VITE_API_SYNC_URL).replace(/\/$/, "")
        : typeof window !== "undefined"
          ? window.location.origin
          : "");

    const url = `${base}/api/sync`;

    const retryList =
      retryFailedOnly && lastFailedRef.current.length > 0
        ? lastFailedRef.current
        : ids;

    const body = {
      clientId,
      platformId,
      ids: retryList,
      retryFailedOnly: Boolean(retryFailedOnly),
    };

    setStatus("running");
    setProgress(0);
    setFailedIds([]);
    setTotal(retryList.length);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setStatus("error");
      throw new Error(text || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setStatus("error");
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buf = "";

    const handleEvents = (events: unknown[]) => {
      for (const ev of events) {
        if (!ev || typeof ev !== "object") continue;
        const o = ev as Record<string, unknown>;

        if (o.done === true) {
          const failed = Array.isArray(o.failed)
            ? (o.failed as string[]).map(String)
            : [];
          const p = typeof o.processed === "number" ? o.processed : 0;
          setProgress(p);
          setFailedIds(failed);
          lastFailedRef.current = failed;
          setStatus("complete");
          return true;
        }

        if (typeof o.processed === "number" && typeof o.total === "number") {
          setProgress(o.processed);
          setTotal(o.total);
        }
        if (o.status === "error" && typeof o.id === "string") {
          setFailedIds((prev) => [...prev, o.id]);
        }
      }
      return false;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(buf);
        buf = rest;
        if (handleEvents(events)) return;
      }
      if (buf.trim()) {
        const { events } = parseSseBuffer(`${buf}\n\n`);
        if (handleEvents(events)) return;
      }
    } catch (e) {
      setStatus("error");
      throw e;
    }

    setStatus("complete");
  }, []);

  return {
    progress,
    total,
    status,
    failedIds,
    start,
  };
}
