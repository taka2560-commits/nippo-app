"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReports } from "@/lib/use-reports";
import { StoredReport } from "@/lib/storage";
import { addDays, formatShortDate, getMissingWeekdays, parseDate, toDateStr, todayStr } from "@/lib/dates";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function HistoryPage() {
    const reports = useReports();
    const [monthStart, setMonthStart] = useState(() => {
        const t = new Date();
        return new Date(t.getFullYear(), t.getMonth(), 1);
    });

    const from = toDateStr(monthStart);
    const to = addDays(toDateStr(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)), -1);

    const { rows, workDays, totalManDays } = useMemo(() => {
        const all = reports ?? [];
        const inMonth = all.filter((r) => r.reportDate >= from && r.reportDate <= to);
        const missing = getMissingWeekdays(from, to, all.map((r) => r.reportDate));
        const merged: { date: string; report?: StoredReport }[] = [
            ...inMonth.map((r) => ({ date: r.reportDate, report: r })),
            ...missing.map((d) => ({ date: d })),
        ].sort((a, b) => b.date.localeCompare(a.date)); // 新しい日が上
        const man = inMonth.reduce(
            (sum, r) => sum + r.workEntries.reduce((s, e) => s + (e.manDays || 0), 0),
            0
        );
        return { rows: merged, workDays: inMonth.length, totalManDays: man };
    }, [reports, from, to]);

    const moveMonth = (delta: number) =>
        setMonthStart((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

    const isCurrentMonth = monthKey(monthStart) === monthKey(new Date());

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
            <header className="sticky top-0 z-10 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
                <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
                    <button
                        type="button"
                        onClick={() => moveMonth(-1)}
                        aria-label="前の月"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 active:bg-slate-700/50"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-base font-bold text-white">
                        {monthStart.getFullYear()}年 {monthStart.getMonth() + 1}月の履歴
                    </h1>
                    <button
                        type="button"
                        onClick={() => moveMonth(1)}
                        aria-label="次の月"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 active:bg-slate-700/50"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                </div>
            </header>

            <main className="mx-auto max-w-lg space-y-3 px-4 py-4">
                {reports === null ? (
                    <p className="py-10 text-center text-sm text-slate-400">読み込み中...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-3 text-center">
                                <div className="text-[11px] text-slate-400">入力した日</div>
                                <div className="text-xl font-bold text-white">{workDays}<span className="ml-0.5 text-xs font-normal">日</span></div>
                            </div>
                            <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-3 text-center">
                                <div className="text-[11px] text-slate-400">人工の合計</div>
                                <div className="text-xl font-bold text-white">{totalManDays.toFixed(2)}</div>
                            </div>
                        </div>

                        {rows.length === 0 ? (
                            <p className="py-10 text-center text-sm text-slate-500">この月の日報はありません</p>
                        ) : (
                            <ul className="space-y-2">
                                {rows.map(({ date, report }) => {
                                    const weekend = [0, 6].includes(parseDate(date).getDay());
                                    const dateColor = weekend
                                        ? parseDate(date).getDay() === 0 ? "text-red-400" : "text-blue-400"
                                        : "text-white";
                                    return (
                                        <li key={date}>
                                            <Link
                                                href={`/?date=${date}`}
                                                className={`block rounded-2xl border px-4 py-3 transition-colors active:bg-slate-700/50 ${report
                                                    ? "border-slate-700 bg-slate-800/60"
                                                    : "border-dashed border-amber-500/40 bg-amber-500/5"
                                                    }`}
                                            >
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className={`text-sm font-bold ${dateColor}`}>
                                                        {formatShortDate(date)}
                                                        {date === todayStr() && <span className="ml-2 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-300">今日</span>}
                                                    </span>
                                                    {report ? (
                                                        <span className="shrink-0 text-xs text-slate-400">
                                                            {report.workerNames.length}名 ／ {report.workEntries.reduce((s, e) => s + (e.manDays || 0), 0).toFixed(2)}人工
                                                        </span>
                                                    ) : (
                                                        <span className="shrink-0 text-xs font-semibold text-amber-300">未入力（タップで入力）</span>
                                                    )}
                                                </div>
                                                {report && (
                                                    <>
                                                        <div className="mt-1 truncate text-sm text-sky-200">{report.workSite}</div>
                                                        <div className="mt-0.5 truncate text-xs text-slate-400">
                                                            {report.workEntries.map((e) => e.content).filter(Boolean).join("、") || "（作業内容なし）"}
                                                        </div>
                                                    </>
                                                )}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {isCurrentMonth && (
                            <p className="pt-1 text-center text-[11px] text-slate-500">
                                ※ 未入力は、最初に入力した日以降の平日（今日を除く）を表示します。祝日や休みの日も含まれます。
                            </p>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
