// 月報（Excelの様式）に載せる内容を、日報データから組み立てる。画面や PDF には依存しない。
import type { StoredReport } from "./storage";
import { addDays, getPeriodOfMonth, isWeekend, parseDate } from "./dates.ts";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const TILDE = "～"; // Excelの様式と同じ全角の「～」
const FULL_SPACE = "　";

export interface SheetRow {
    date: string; // YYYY-MM-DD
    day: number; // 日（1〜31）
    weekday: string; // 曜日
    hasWork: boolean; // その日の日報がある
    greyed: boolean; // 作業のない土日（灰色にする）
    site: string; // 現場名
    time: string; // 作業時間（例 8:00～17:00）
    content: string; // 主な作業内容
    overtimeNote: string; // 時間外の内訳（早出・残業がある日の備考）
    names: string[]; // 人員（本人を除く）
    early: number; // 時間外：早（時間）
    late: number; // 時間外：残（時間）
}

export interface MonthlySheet {
    year: number;
    month: number;
    title: string; // 月報　令和　8年　10月度
    periodText: string; // 2026/9/16～2026/10/15
    reporterName: string;
    rows: SheetRow[];
    workDays: number; // 出勤
    overtimeTotal: number; // 早出・残業の合計（時間）
    prescribedDays: number; // 規定出勤日数
    remarkLines: string[]; // 備考欄に書く内容
}

// 時間の数値を "H:MM" にする（7.5 → "7:30"）
export const formatClock = (hours: number): string => {
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
};

// 時間外の時間の表示（1 → "1"、0.5 → "0.5"、0 → ""）
export const formatHours = (n: number): string => (n > 0 ? String(Math.round(n * 100) / 100) : "");

// 現場名は「グループ - 現場」で保存されているので、現場の部分だけを使う
export const siteDisplayName = (workSite: string): string => {
    const i = workSite.indexOf(" - ");
    return i >= 0 ? workSite.slice(i + 3) : workSite;
};

const squeeze = (s: string) => s.replace(/[\s　]+/g, "");

// 人員の欄には名字だけを書く（「山田 太郎」→「山田」）。同じ名字が重なるときは氏名をつなげる
export const toDisplayNames = (workerNames: string[], reporterName: string): string[] => {
    const me = squeeze(reporterName);
    const others = workerNames.filter((n) => !me || squeeze(n) !== me);
    const surnames = others.map((n) => n.trim().split(/[\s　]+/)[0] ?? n);
    return others.map((n, i) => (surnames.filter((s) => s === surnames[i]).length > 1 ? squeeze(n) : surnames[i]));
};

// 規定出勤日数の初期値＝期間内の平日（月〜金）の日数
export const defaultPrescribedDays = (year: number, month: number): number => {
    const { from, to } = getPeriodOfMonth(year, month);
    let n = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++;
    return n;
};

const num = (v: string | undefined): number => {
    const n = parseFloat(v ?? "");
    return isNaN(n) || n < 0 ? 0 : n;
};

export interface SheetOptions {
    reporterName?: string;
    prescribedDays?: number;
}

export const buildMonthlySheet = (
    reports: StoredReport[],
    year: number,
    month: number,
    options: SheetOptions = {}
): MonthlySheet => {
    const reporterName = (options.reporterName ?? "").trim();
    const { from, to } = getPeriodOfMonth(year, month);
    const byDate = new Map(reports.map((r) => [r.reportDate, r]));

    const rows: SheetRow[] = [];
    const remarkLines: string[] = [];
    let overtimeTotal = 0;

    for (let date = from; date <= to; date = addDays(date, 1)) {
        const d = parseDate(date);
        const report = byDate.get(date);
        const base = { date, day: d.getDate(), weekday: WEEK[d.getDay()] };

        if (!report) {
            rows.push({
                ...base,
                hasWork: false,
                greyed: isWeekend(date),
                site: "",
                time: "",
                content: "",
                overtimeNote: "",
                names: [],
                early: 0,
                late: 0,
            });
            continue;
        }

        const early = num(report.earlyStart);
        const late = num(report.overtimeHours);
        overtimeTotal += early + late;

        // 備考は、早出・残業がある日は「時間外の内訳」欄へ、ない日は下の備考欄へ書く
        const remarks = (report.remarks ?? "").replace(/\s+/g, " ").trim();
        let overtimeNote = "";
        if (remarks) {
            if (early > 0 || late > 0) {
                const prefix = early > 0 && late > 0 ? "早・残：" : early > 0 ? "早：" : "残：";
                overtimeNote = prefix + remarks;
            } else {
                remarkLines.push(`${d.getMonth() + 1}/${d.getDate()} ${remarks}`);
            }
        }

        const contents = (report.workEntries ?? []).map((e) => e.content?.trim()).filter(Boolean);
        rows.push({
            ...base,
            hasWork: true,
            greyed: false,
            site: siteDisplayName(report.workSite ?? ""),
            time: `${formatClock(8 - early)}${TILDE}${formatClock(17 + late)}`,
            content: Array.from(new Set(contents)).join(FULL_SPACE),
            overtimeNote,
            names: toDisplayNames(report.workerNames ?? [], reporterName),
            early,
            late,
        });
    }

    return {
        year,
        month,
        title: `月報${FULL_SPACE}令和${FULL_SPACE}${year - 2018}年${FULL_SPACE}${month}月度`,
        periodText: `${from.replace(/-0?/g, "/")}${TILDE}${to.replace(/-0?/g, "/")}`,
        reporterName,
        rows,
        workDays: rows.filter((r) => r.hasWork).length,
        overtimeTotal,
        prescribedDays: options.prescribedDays ?? defaultPrescribedDays(year, month),
        remarkLines,
    };
};
