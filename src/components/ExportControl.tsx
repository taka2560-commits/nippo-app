import { useMemo, useState } from "react";
import Link from "next/link";
import { generateMonthlyReportData, exportToExcel, exportToPDF } from "@/lib/export";
import { useReports, useSettings } from "@/lib/use-reports";
import { formatShortDate, getMissingWeekdays, getPeriodOfMonth } from "@/lib/dates";
import { buildMonthlySheet, defaultPrescribedDays } from "@/lib/monthly-sheet";
import { getSettings, saveSettings, type MonthlyNote } from "@/lib/storage";

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

    // 月報の様式に載せる項目。氏名は設定画面で登録し、規定出勤日数と備考欄は月度ごとに入力して端末に保存する
    const settings = useSettings();
    const periodKey = `${year}-${String(month).padStart(2, "0")}`;
    const [daysInput, setDaysInput] = useState<{ key: string; value: string } | null>(null);
    const [noteInput, setNoteInput] = useState<{ key: string; value: string } | null>(null);
    const reporterName = settings?.reporterName.trim() ?? "";
    const savedDays = settings?.prescribedDays[periodKey];
    const daysValue = daysInput?.key === periodKey ? daysInput.value : savedDays === undefined ? "" : String(savedDays);
    const defaultDays = defaultPrescribedDays(year, month);
    const savedNote = settings?.monthlyNotes[periodKey];
    const noteText = noteInput?.key === periodKey ? noteInput.value : (savedNote?.text ?? "");
    const excludedDates = savedNote?.excluded ?? [];

    // 備考欄：日報の備考から選ぶ候補と、実際に載る行
    const sheet = useMemo(
        () =>
            buildMonthlySheet(reports ?? [], year, month, {
                reporterName,
                prescribedDays: savedDays,
                noteText,
                excludedNoteDates: excludedDates,
            }),
        // excludedDates は毎回新しい配列になるため、中身が変わったときだけ作り直す
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [reports, year, month, reporterName, savedDays, noteText, excludedDates.join(",")]
    );

    const changeDays = (value: string) => {
        const digits = value.replace(/[^0-9]/g, "").slice(0, 2);
        setDaysInput({ key: periodKey, value: digits });
        const current = getSettings();
        const prescribedDays = { ...current.prescribedDays };
        if (digits === "") delete prescribedDays[periodKey];
        else prescribedDays[periodKey] = parseInt(digits, 10);
        saveSettings({ ...current, prescribedDays });
    };

    const saveNote = (patch: Partial<MonthlyNote>) => {
        const current = getSettings();
        const prev: MonthlyNote = current.monthlyNotes[periodKey] ?? { text: "", excluded: [] };
        const next: MonthlyNote = { ...prev, ...patch };
        const monthlyNotes = { ...current.monthlyNotes };
        if (!next.text.trim() && next.excluded.length === 0) delete monthlyNotes[periodKey];
        else monthlyNotes[periodKey] = next;
        saveSettings({ ...current, monthlyNotes });
    };
    const changeNoteText = (value: string) => {
        setNoteInput({ key: periodKey, value });
        saveNote({ text: value });
    };
    const toggleCandidate = (date: string) =>
        saveNote({ excluded: excludedDates.includes(date) ? excludedDates.filter((d) => d !== date) : [...excludedDates, date] });
    const addPhrase = (phrase: string) => changeNoteText(noteText.trim() ? `${noteText.replace(/\n+$/, "")}\n${phrase}` : phrase);

    const handleExportPDF = async () => {
        if (
            !reporterName &&
            !confirm("氏名が登録されていないため、PDFの右上が空欄になり、人員欄に自分も載ります。\nこのまま出力しますか？\n（設定画面で氏名を登録できます）")
        ) {
            return;
        }
        await exportToPDF(sheet);
    };

    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/20 text-purple-400">
                    📤
                </span>
                月報エクスポート
            </h3>

            {/* 月報の様式に載せる項目 */}
            <div className="mb-4 space-y-3">
                {reporterName ? (
                    <p className="text-xs text-slate-400">
                        氏名（月報の右上）：<span className="font-bold text-white">{reporterName}</span>
                        <Link href="/settings" className="ml-2 text-sky-400 underline">設定で変更</Link>
                    </p>
                ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                        氏名が未登録です。PDFの右上が空欄になり、各日の人員欄に自分も載ります。
                        <Link href="/settings" className="ml-1 font-bold text-amber-100 underline">設定で氏名を登録する</Link>
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <label htmlFor="prescribed-days" className="text-xs font-medium text-slate-500">規定出勤日数（{month}月度）</label>
                    <input
                        id="prescribed-days"
                        type="text"
                        inputMode="numeric"
                        value={daysValue}
                        onChange={(e) => changeDays(e.target.value)}
                        placeholder={`${defaultDays}（空欄のときは期間内の平日の日数）`}
                        className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                {/* 備考欄：日報の備考から選ぶ・定型文を入れる・自由に書く */}
                <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                    <p className="text-xs font-bold text-slate-300">備考欄に載せる内容（{month}月度）</p>

                    {sheet.remarkCandidates.length > 0 && (
                        <div>
                            <p className="mb-1 text-[11px] text-slate-500">日報に書いた備考から選ぶ（チェックしたものが載ります）</p>
                            <ul className="space-y-1">
                                {sheet.remarkCandidates.map((c) => (
                                    <li key={c.date}>
                                        <label className="flex items-start gap-2 rounded-lg bg-slate-800/60 px-2 py-1.5 text-xs text-slate-200">
                                            <input
                                                type="checkbox"
                                                checked={!excludedDates.includes(c.date)}
                                                onChange={() => toggleCandidate(c.date)}
                                                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
                                            />
                                            <span className="min-w-0 break-words">{c.line}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {(settings?.notePhrases.length ?? 0) > 0 && (
                        <div>
                            <p className="mb-1 text-[11px] text-slate-500">定型文（タップで追加。<Link href="/settings" className="text-sky-400 underline">設定で編集</Link>）</p>
                            <div className="flex flex-wrap gap-1.5">
                                {settings?.notePhrases.map((phrase) => (
                                    <button
                                        key={phrase}
                                        type="button"
                                        onClick={() => addPhrase(phrase)}
                                        className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200 active:bg-cyan-500/25"
                                    >
                                        ＋{phrase}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label htmlFor="note-text" className="mb-1 block text-[11px] text-slate-500">自由に書く（1行ずつ載ります）</label>
                        <textarea
                            id="note-text"
                            value={noteText}
                            onChange={(e) => changeNoteText(e.target.value)}
                            rows={3}
                            placeholder="例：10/12 現場立会いのため直行"
                            className="w-full resize-none rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <p className={`text-[10px] leading-relaxed ${sheet.remarkLines.length > 5 ? "text-amber-300" : "text-slate-500"}`}>
                        PDFの備考欄に載る行数：{sheet.remarkLines.length}行
                        {sheet.remarkLines.length > 5 ? "（5行までです。多い分は省略されます。不要なものを外してください）" : "（5行まで載せられます）"}
                    </p>
                </div>
            </div>

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
