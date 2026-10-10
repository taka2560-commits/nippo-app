"use client";

import { useMemo, useSyncExternalStore } from "react";
import { REPORTS_KEY, parseReports, StoredReport } from "@/lib/storage";

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
