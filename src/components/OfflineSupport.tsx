"use client";

import { useEffect, useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
    };
};

// サービスワーカーの登録と、オフライン中の表示
export default function OfflineSupport() {
    const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

    useEffect(() => {
        // 開発中は古い保存分が残って紛らわしいので、本番ビルドのときだけ登録する
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("/sw.js").catch(() => {
            // 登録できなくてもアプリ自体は通常どおり動く
        });

        // PDF出力用の日本語フォント（約2.4MB）は、通信に余裕があるときに先に端末へ保存しておく
        // （オフラインで月報PDFを出力しても文字が崩れないようにするため）。通信量を節約する設定の端末では行わない
        const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
        if (connection?.saveData) return;
        let cancelled = false;
        navigator.serviceWorker.ready.then(() => {
            if (cancelled) return;
            setTimeout(() => {
                fetch("/fonts/IBMPlexSansJP-Regular.ttf").catch(() => {
                    // 失敗しても、PDF出力時にあらためて取得する
                });
            }, 5000);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (online) return null;
    return (
        <div
            role="status"
            className="fixed inset-x-0 top-0 z-[60] bg-amber-500 px-3 py-1 text-center text-[11px] font-bold text-slate-900"
        >
            オフラインです（入力した内容はこの端末に保存されます）
        </div>
    );
}
