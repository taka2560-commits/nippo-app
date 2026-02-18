import { useState } from "react";
import { generateMonthlyReportData, exportToExcel, exportToPDF } from "@/lib/export";
import { getSettings } from "@/lib/storage";

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

    const handleExportExcel = () => {
        const data = generateMonthlyReportData(year, month);
        exportToExcel(data, year, month);
    };

    const handleExportPDF = async () => {
        const settings = getSettings();
        const siteName = settings?.workSiteGroups[0]?.sites[0] || ""; // 仮で最初の現場名を取得、本来は選択させるか、日報データから推測するか
        // しかし「月報」は現場ごとの場合が多い。
        // 要望には「フィルター」等の指定はないため、一旦全データを対象にするが、
        // 現場名がPDFタイトルに入る仕様にしたので、設定から何かしら取ってくるか、あるいは空にする。
        // ここでは「現場名」はエクスポート時点で指定させるUIがないため、空、あるいはユーザー入力を促すpromptを出す等の対応が考えられる。
        // 簡易的にpromptで聞いてみる。
        const inputSiteName = prompt("PDFに記載する現場名を入力してください", siteName);
        if (inputSiteName === null) return; // キャンセル

        const data = generateMonthlyReportData(year, month);
        await exportToPDF(data, year, month, inputSiteName);
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
        </div>
    );
};
