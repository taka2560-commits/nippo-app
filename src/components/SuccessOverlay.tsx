"use client";

import { useEffect, useState } from "react";

interface SuccessOverlayProps {
    onComplete: () => void;
    message?: string;
    reportDate?: string;
    workSite?: string;
    workContents?: string;
}

export default function SuccessOverlay({ 
    onComplete, 
    message = "本日の日報入力完了",
    reportDate,
    workSite,
    workContents
}: SuccessOverlayProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // マウント時にフェードイン
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = () => {
        setVisible(false);
        // Force Cache Busting - v1.1
        setTimeout(onComplete, 500); // フェードアウト後にリセット
    };

    const handleCalendarClick = () => {
        if (!reportDate || !workSite) return;
        
        // YYYYMMDD形式に変換
        const dateStr = reportDate.replace(/-/g, "");
        
        // 終日予定のため、終了日は翌日にする
        const nextDate = new Date(reportDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split("T")[0].replace(/-/g, "");
        
        const text = encodeURIComponent(`現場: ${workSite}`);
        const details = encodeURIComponent(workContents || "");
        
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dateStr}/${nextDateStr}&details=${details}`;
        
        window.open(url, "_blank");
    };

    return (
        <div
            className={`
        fixed inset-0 z-50 flex flex-col items-center justify-center
        bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600
        transition-all duration-500 px-6
        ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}
      `}
        >
            {/* 背景の装飾パターン */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
            </div>

            {/* コンテンツ */}
            <div className="relative z-10 flex flex-col items-center gap-8 px-4 text-center w-full max-w-sm">
                {/* チェックマークアイコン */}
                <div
                    className={`
            flex h-24 w-24 items-center justify-center rounded-full
            bg-white/20 backdrop-blur-sm shadow-2xl mx-auto
            transition-all duration-700 delay-200
            ${visible ? "scale-100 rotate-0" : "scale-0 rotate-180"}
          `}
                >
                    <svg
                        className="h-12 w-12 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                        />
                    </svg>
                </div>

                {/* メッセージ */}
                <div
                    className={`
            transition-all duration-500 delay-400 w-full space-y-6
            ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
                >
                    <h1 className="text-3xl font-bold text-white drop-shadow-lg md:text-4xl">
                        {message}
                    </h1>

                    {/* Googleカレンダー連携ボタン */}
                    {reportDate && workSite && (
                        <button
                            onClick={handleCalendarClick}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white text-emerald-600 px-6 py-4 font-bold shadow-lg transition-transform active:scale-95"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                            </svg>
                            Googleカレンダーに追加
                        </button>
                    )}

                    {/* 閉じる（次へ）ボタン */}
                    <button
                        onClick={handleClose}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/30 bg-white/10 text-white px-6 py-4 font-bold backdrop-blur-sm transition-transform active:scale-95"
                    >
                        入力画面に戻る
                    </button>
                </div>
            </div>
        </div>
    );
}
