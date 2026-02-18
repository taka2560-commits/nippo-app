"use client";

import { useEffect, useState } from "react";

interface SuccessOverlayProps {
    onComplete: () => void;
    message?: string;
}

export default function SuccessOverlay({ onComplete, message = "本日の日報入力完了" }: SuccessOverlayProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // マウント時にフェードイン
        requestAnimationFrame(() => setVisible(true));

        // 3秒後にフォームリセット
        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(onComplete, 500); // フェードアウト後にリセット
        }, 3000);

        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div
            className={`
        fixed inset-0 z-50 flex flex-col items-center justify-center
        bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600
        transition-all duration-500
        ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}
      `}
        >
            {/* 背景の装飾パターン */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute top-1/3 right-1/4 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
            </div>

            {/* コンテンツ */}
            <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center">
                {/* チェックマークアイコン */}
                <div
                    className={`
            flex h-32 w-32 items-center justify-center rounded-full
            bg-white/20 backdrop-blur-sm shadow-2xl
            transition-all duration-700 delay-200
            ${visible ? "scale-100 rotate-0" : "scale-0 rotate-180"}
          `}
                >
                    <svg
                        className="h-16 w-16 text-white"
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
            transition-all duration-500 delay-400
            ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
          `}
                >
                    <h1 className="text-4xl font-bold text-white drop-shadow-lg md:text-5xl">
                        {message}
                    </h1>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-8 py-3 backdrop-blur-sm">
                        <span className="text-3xl font-extrabold text-white md:text-4xl">
                            OK
                        </span>
                    </div>
                </div>

                <p
                    className={`
            text-lg text-white/80
            transition-all duration-500 delay-600
            ${visible ? "opacity-100" : "opacity-0"}
          `}
                >
                    3秒後に入力画面に戻ります...
                </p>
            </div>
        </div>
    );
}
