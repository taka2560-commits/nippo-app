// 日付ユーティリティ（すべて端末のローカル時間で "YYYY-MM-DD" を扱う）
// ※ toISOString() は UTC のため、日本の早朝に前日の日付になってしまう。使わないこと。

const pad2 = (n: number) => String(n).padStart(2, "0");

export const toDateStr = (d: Date): string =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayStr = (): string => toDateStr(new Date());

export const parseDate = (date: string): Date => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
};

export const addDays = (date: string, n: number): string => {
    const d = parseDate(date);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
};

export const isWeekend = (date: string): boolean => {
    const dow = parseDate(date).getDay();
    return dow === 0 || dow === 6;
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-09-29" → "9/29（火）"
export const formatShortDate = (date: string): string => {
    const d = parseDate(date);
    return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
};

// 入力が無い平日を返す。
// 数え始めるのは最初の日報の日付から、数え終わるのは昨日まで（今日は入力中なので含めない）。
// 日報が1件も無いときは、使い始めて間もないので空を返す。
export const getMissingWeekdays = (from: string, to: string, reportDates: string[]): string[] => {
    if (reportDates.length === 0) return [];
    const first = [...reportDates].sort()[0];
    const start = first > from ? first : from;
    const yesterday = addDays(todayStr(), -1);
    const end = to < yesterday ? to : yesterday;
    const submitted = new Set(reportDates);
    const missing: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
        if (!isWeekend(d) && !submitted.has(d)) missing.push(d);
    }
    return missing;
};

// 月報の集計期間（前月16日〜当月15日）
export const getPeriodOfMonth = (year: number, month: number): { from: string; to: string } => ({
    from: toDateStr(new Date(year, month - 2, 16)),
    to: toDateStr(new Date(year, month - 1, 15)),
});
