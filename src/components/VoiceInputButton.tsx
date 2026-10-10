"use client";

import { useRef, useState, useSyncExternalStore } from "react";

// ブラウザの音声認識API（Web Speech API）の最小限の型
interface RecognitionResultEvent {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface RecognitionLike {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((e: RecognitionResultEvent) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

const getCtor = (): RecognitionCtor | undefined => {
    const w = window as unknown as {
        SpeechRecognition?: RecognitionCtor;
        webkitSpeechRecognition?: RecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const noopSubscribe = () => () => { };

interface Props {
    onText: (text: string) => void;
}

// マイクボタン。音声認識に対応していない端末では何も表示しない。
export default function VoiceInputButton({ onText }: Props) {
    const supported = useSyncExternalStore(noopSubscribe, () => !!getCtor(), () => false);
    const [listening, setListening] = useState(false);
    const [error, setError] = useState("");
    const recRef = useRef<RecognitionLike | null>(null);

    if (!supported) return null;

    const toggle = () => {
        if (listening) {
            recRef.current?.stop();
            return;
        }
        const Ctor = getCtor();
        if (!Ctor) return;
        setError("");
        const rec = new Ctor();
        rec.lang = "ja-JP";
        rec.interimResults = false;
        rec.continuous = false;
        rec.onresult = (e) => {
            const text = Array.from(e.results)
                .map((r) => r[0]?.transcript ?? "")
                .join("")
                .trim();
            if (text) onText(text);
        };
        rec.onerror = (e) => {
            if (e.error === "not-allowed" || e.error === "service-not-allowed") {
                setError("マイクが許可されていません。ブラウザの設定で許可してください。");
            } else if (e.error !== "aborted" && e.error !== "no-speech") {
                setError("音声を認識できませんでした。もう一度お試しください。");
            }
        };
        rec.onend = () => {
            setListening(false);
            recRef.current = null;
        };
        recRef.current = rec;
        try {
            rec.start();
            setListening(true);
        } catch {
            setError("音声入力を開始できませんでした。");
            recRef.current = null;
        }
    };

    return (
        <span className="inline-flex flex-col items-end gap-1">
            <button
                type="button"
                onClick={toggle}
                aria-pressed={listening}
                aria-label={listening ? "音声入力を止める" : "音声で入力する"}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold normal-case transition-colors ${listening
                    ? "animate-pulse bg-red-500 text-white"
                    : "border border-slate-600 bg-slate-800/60 text-slate-300 active:bg-slate-700"
                    }`}
            >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
                {listening ? "聞き取り中…タップで停止" : "音声入力"}
            </button>
            {error && <span className="text-[11px] font-normal normal-case text-red-400">{error}</span>}
        </span>
    );
}
