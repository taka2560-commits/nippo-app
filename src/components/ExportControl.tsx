import { useMemo, useState } from "react";
import Link from "next/link";
import { generateMonthlyReportData, exportToExcel, exportToPDF } from "@/lib/export";
import { useReports } from "@/lib/use-reports";
import { formatShortDate, getMissingWeekdays, getPeriodOfMonth } from "@/lib/dates";

export const ExportControl = () => {
    // 現在の日付から初期値を設定（例: 今日が2/18なら、2月度(1/16-2/15)または3月度(2/16-3/15)）
    // デフォルトは「現在の月度」
    const today = new Date();
    // 16日以降なら来月度、15日以前なら今月度
    const currentYear = today.getFullYear();
    const currentMonth = today.getDate() >= 16 ? today.getMonth() + 2 : today.getMonth() + 1;
    // 年跨ぎ調整
    const initialYear = currentMonth > 12 ? currentYear + 1 : currentYear;
    const initialMonth = currentMonth > 12 ? 1 : currentMonth;

    const [year, setYear] = useState(initialYear);
    const [month, setMonth] = useState(initialMonth);

    // 選択中の月度に、入力していない平日がないか
    const reports = useReports();
    const period = getPeriodOfMonth(year, month);
    const missing = useMemo(
        () => getMissingWeekdays(period.from, period.to, (reports ?? []).map((r) => r.reportDate)),
        [reports, period.from, period.to]
    );
    const inPeriod = (reports ?? []).filter((r) => r.reportDate >= period.from && r.reportDate <= period.to);
    const totalManDays = inPeriod.reduce(
        (sum, r) => sum + r.workEntries.reduce((s, e) => s + (e.manDays || 0), 0),
        0
    );

    const handleExportExcel = () => {
        const data = generateMonthlyReportData(year, month);
        exportToExcel(data, year, month);
    };

    const handleExportPDF = async () => {
        const data = generateMonthlyReportData(year, month);
        await exportToPDF(data, year, month);
    };

    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/20 text-purple-400">
                    📤
                </span>
                月報エクスポート
            </h3>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">年</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                                <option key={y} value={y}>{y}年</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">月度 ({month - 1 === 0 ? 12 : month - 1}/16~{month}/15)</label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                <option key={m} value={m}>{m}月</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 rounded-xl bg-green-600/90 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 transition-colors"
                    >
                        Excel出力
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-2 rounded-xl bg-red-600/90 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 transition-colors"
                    >
                        PDF出力
                    </button>
                </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
                ※ 指定した月度の前月16日〜当月15日のデータを集計します。
            </p>

            {/* この月度の集計と、入力漏れの確認 */}
            <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
                <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-xl bg-slate-900/50 p-2">
                        <div className="text-[11px] text-slate-400">入力した日</div>
                        <div className="text-lg font-bold text-white">{inPeriod.length}日</div>
                    </div>
                    <div className="rounded-xl bg-slate-900/50 p-2">
                        <div className="text-[11px] text-slate-400">人工の合計</div>
                        <div className="text-lg font-bold text-white">{totalManDays.toFixed(2)}</div>
                    </div>
                </div>
                {reports !== null && (
                    missing.length === 0 ? (
                        <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                            ✓ この月度に入力漏れの平日はありません
                        </p>
                    ) : (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                            <p className="mb-2 text-xs font-bold text-amber-300">
                                ⚠ 未入力の平日が{missing.length}日あります（タップで入力）
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {missing.map((d) => (
                                    <Link
                                        key={d}
                                        href={`/?date=${d}`}
                                        className="rounded-full border border-amber-500/40 bg-slate-900/60 px-3 py-1 text-xs font-semibold text-amber-200 active:bg-amber-500/20"
                                    >
                                        {formatShortDate(d)}
                                    </Link>
                                ))}
                            </div>
                            <p className="mt-2 text-[10px] text-amber-200/70">
                                ※ 最初に入力した日以降の平日を表示します。祝日や休みの日も含まれます。
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};
