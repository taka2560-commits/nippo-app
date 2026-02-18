"use client";

interface WorkEntryRowProps {
    index: number;
    location: string;
    content: string;
    manDays: string;
    overtime: string;
    locationOptions: string[];
    contentOptions: string[];
    manDayOptions: string[];
    overtimeOptions: string[];
    onLocationChange: (value: string) => void;
    onContentChange: (value: string) => void;
    onManDaysChange: (value: string) => void;
    onOvertimeChange: (value: string) => void;
    onRemove: () => void;
    canRemove: boolean;
}

export default function WorkEntryRow({
    index,
    location,
    content,
    manDays,
    overtime,
    locationOptions,
    contentOptions,
    manDayOptions,
    overtimeOptions,
    onLocationChange,
    onContentChange,
    onManDaysChange,
    onOvertimeChange,
    onRemove,
    canRemove,
}: WorkEntryRowProps) {
    const locationListId = `location-list-${index}`;
    const contentListId = `content-list-${index}`;

    return (
        <div className="rounded-2xl border-2 border-slate-600/30 bg-slate-800/30 p-4 space-y-4">
            {/* ヘッダー行 */}
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-400">
                        {index + 1}
                    </span>
                    作業 {index + 1}
                </span>
                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        削除
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {/* 場所（任意） */}
                <div className="relative">
                    <input
                        type="text"
                        list={locationListId}
                        value={location}
                        onChange={(e) => onLocationChange(e.target.value)}
                        placeholder="場所を入力 or 選択 (任意)"
                        className={`
                            w-full rounded-xl border-2 px-4 py-3
                            text-base font-medium transition-all duration-200
                            focus:outline-none focus:ring-4
                            ${location
                                ? "border-indigo-500/50 bg-indigo-500/10 text-white focus:ring-indigo-500/20"
                                : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-indigo-500/50 focus:ring-indigo-500/20"
                            }
                        `}
                    />
                    <datalist id={locationListId}>
                        {locationOptions.map((opt) => (
                            <option key={opt} value={opt} />
                        ))}
                    </datalist>
                </div>

                {/* 作業内容 */}
                <div className="relative">
                    <input
                        type="text"
                        list={contentListId}
                        value={content}
                        onChange={(e) => onContentChange(e.target.value)}
                        placeholder="作業内容を入力 or 選択"
                        className={`
                            w-full rounded-xl border-2 px-4 py-3
                            text-base font-medium transition-all duration-200
                            focus:outline-none focus:ring-4
                            ${content
                                ? "border-sky-500/50 bg-sky-500/10 text-white focus:ring-sky-500/20"
                                : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"
                            }
                        `}
                    />
                    <datalist id={contentListId}>
                        {contentOptions.map((opt) => (
                            <option key={opt} value={opt} />
                        ))}
                    </datalist>
                </div>

                {/* 人工 + 早出残業 */}
                <div className="grid grid-cols-2 gap-3">
                    {/* 人工 */}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-400">
                            👷 人工
                        </label>
                        <div className="relative">
                            <select
                                value={manDays}
                                onChange={(e) => onManDaysChange(e.target.value)}
                                className={`
                                    w-full appearance-none rounded-xl border-2 px-3 py-2.5
                                    text-base font-medium transition-all duration-200
                                    focus:outline-none focus:ring-4
                                    ${manDays
                                        ? "border-sky-500/50 bg-sky-500/10 text-white focus:ring-sky-500/20"
                                        : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"
                                    }
                                `}
                            >
                                <option value="" disabled className="bg-slate-800 text-slate-400">
                                    選択
                                </option>
                                {manDayOptions.map((opt) => (
                                    <option key={opt} value={opt} className="bg-slate-800 text-white">
                                        {opt}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* 早出残業 */}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-400">
                            ⏰ 早出残業
                        </label>
                        <div className="relative">
                            <select
                                value={overtime}
                                onChange={(e) => onOvertimeChange(e.target.value)}
                                className={`
                                    w-full appearance-none rounded-xl border-2 px-3 py-2.5
                                    text-base font-medium transition-all duration-200
                                    focus:outline-none focus:ring-4
                                    ${overtime && overtime !== "0"
                                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300 focus:ring-amber-500/20"
                                        : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"
                                    }
                                `}
                            >
                                <option value="" disabled className="bg-slate-800 text-slate-400">
                                    選択
                                </option>
                                {overtimeOptions.map((opt) => (
                                    <option key={opt} value={opt} className="bg-slate-800 text-white">
                                        {opt === "0" ? "なし" : `${opt}h`}
                                    </option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
