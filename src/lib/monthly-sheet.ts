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
    remarkCandidates: { date: string; line: string }[]; // 日報の備考のうち、備考欄に載せられるもの（早出・残業のない日）
    remarkLines: string[]; // 備考欄に書く内容（選んだ日報の備考 → 自由記入の順）
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

const squeeze = (s: string) => s.replace(/[\s\u3000]+/g, "");

const nameParts = (n: string): { surname: string; given: string; single: boolean } => {
    const [surname = "", ...rest] = n.trim().split(/[\s\u3000]+/);
    return { surname: squeeze(surname), given: squeeze(rest.join("")), single: rest.length === 0 };
};

// 名簿の名前が、月報を作る本人かどうか。
// 氏名どおりなら同じ人。名簿が名字だけ・名前だけのときは、本人の名字か名前と同じなら本人とみなす。
// 本人の登録が名字だけのときは、同じ名字の人を本人とみなす。
export const isSamePerson = (workerName: string, reporterName: string): boolean => {
    const w = squeeze(workerName);
    const r = squeeze(reporterName);
    if (!w || !r) return false;
    if (w === r) return true;
    const wp = nameParts(workerName);
    const rp = nameParts(reporterName);
    if (wp.single) return w === rp.surname || (!!rp.given && w === rp.given);
    if (rp.single) return wp.surname === rp.surname;
    return false;
};

// 人員の欄には名字だけを書く（「山田 太郎」→「山田」）。同じ名字が重なるときは氏名をつなげる
export const toDisplayNames = (workerNames: string[], reporterName: string): string[] => {
    const others = workerNames.filter((n) => !reporterName.trim() || !isSamePerson(n, reporterName));
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
    noteText?: string; // 備考欄に自由に書く内容
    excludedNoteDates?: string[]; // 備考欄に載せない日報の備考（日付）
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
    const remarkCandidates: { date: string; line: string }[] = [];
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
                remarkCandidates.push({ date, line: `${d.getMonth() + 1}/${d.getDate()} ${remarks}` });
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

    // 備考欄：選んだ日報の備考を先に、続けて自由記入（改行ごとに1行）
    const excluded = new Set(options.excludedNoteDates ?? []);
    const remarkLines = [
        ...remarkCandidates.filter((c) => !excluded.has(c.date)).map((c) => c.line),
        ...(options.noteText ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    ];

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
        remarkCandidates,
        remarkLines,
    };
};
