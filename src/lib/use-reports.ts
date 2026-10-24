"use client";

import { useMemo, useSyncExternalStore } from "react";
import { REPORTS_KEY, SETTINGS_KEY, parseReports, parseSettings, StorageSettings, StoredReport } from "@/lib/storage";

const subscribe = (onChange: () => void) => {
    window.addEventListener("storage", onChange);
    return () => window.removeEventListener("storage", onChange);
};

// 保存済みの日報を読む。サーバー描画中・初回描画前は null（読み込み中）
export function useReports(): StoredReport[] | null {
    const raw = useSyncExternalStore<string | null>(
        subscribe,
        () => localStorage.getItem(REPORTS_KEY) ?? "[]",
        () => null
    );
    return useMemo(() => (raw === null ? null : parseReports(raw)), [raw]);
}

// 保存済みの設定を読む。サーバー描画中・初回描画前は null
export function useSettings(): StorageSettings | null {
    const raw = useSyncExternalStore<string | null>(
        subscribe,
        () => localStorage.getItem(SETTINGS_KEY) ?? "",
        () => null
    );
    return useMemo(() => (raw === null ? null : parseSettings(raw || null)), [raw]);
}
