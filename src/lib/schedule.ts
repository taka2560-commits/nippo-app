// 予定表（ホワイトボードの写真）の読み取り結果を、日報の入力内容に結びつける。画面・サーバーには依存しない。
import { addDays, parseDate } from "./dates.ts";
import type { SiteGroup } from "./storage";

// 読み取り結果の1日分
export type ScheduleStatus = "site" | "office" | "off" | "not_found";

export interface ScheduleDay {
    day: number; // 日（19 など）
    weekday: string; // 曜日（月 など。読めなければ ""）
    status: ScheduleStatus;
    site: string; // 現場名（予定表に書かれているとおり）。status が site 以外は ""
    registeredSite: string; // 登録済みの現場名と同じものと判断できたときのその名前（なければ ""）
    members: string[]; // 同じマスにいる全員の名前（本人を含む）。status が site 以外は []
    confidence: "high" | "medium" | "low";
    note: string;
}

const STATUSES: ScheduleStatus[] = ["site", "office", "off", "not_found"];
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

// サーバーから受け取った内容を検証して、使える形にそろえる（壊れた項目は捨てる）
export const parseScheduleDays = (data: unknown): ScheduleDay[] => {
    const days = (data as { days?: unknown } | null)?.days;
    if (!Array.isArray(days)) return [];
    const out: ScheduleDay[] = [];
    for (const d of days) {
        const x = d as Partial<Record<keyof ScheduleDay, unknown>> | null;
        if (!x || typeof x.day !== "number" || !isFinite(x.day) || x.day < 1 || x.day > 31) continue;
        if (typeof x.status !== "string" || !STATUSES.includes(x.status as ScheduleStatus)) continue;
        const status = x.status as ScheduleStatus;
        const members = Array.isArray(x.members) ? x.members.map((m) => str(m, 20)).filter(Boolean).slice(0, 30) : [];
        out.push({
            day: Math.round(x.day),
            weekday: WEEK.includes(str(x.weekday)) ? str(x.weekday) : "",
            status,
            site: status === "site" ? str(x.site) : "",
            registeredSite: status === "site" ? str(x.registeredSite) : "",
            members: status === "site" ? members : [],
            confidence: x.confidence === "high" || x.confidence === "low" ? x.confidence : "medium",
            note: str(x.note, 300),
        });
    }
    return out;
};

// 予定表の「日・曜日」から、実際の日付を決める。基準の日付に最も近い（前後20日以内の）候補を使う。
// 曜日が読めている場合は曜日も合わせ、合う日がなければ日だけで探す。
export const resolveBoardDate = (day: number, weekday: string, anchor: string): string | null => {
    const candidates: string[] = [];
    for (let i = -20; i <= 20; i++) {
        const d = addDays(anchor, i);
        if (parseDate(d).getDate() === day) candidates.push(d);
    }
    const byWeekday = weekday ? candidates.filter((d) => WEEK[parseDate(d).getDay()] === weekday) : [];
    const pool = byWeekday.length > 0 ? byWeekday : candidates;
    if (pool.length === 0) return null;
    const dist = (d: string) => Math.abs(parseDate(d).getTime() - parseDate(anchor).getTime());
    return pool.sort((a, b) => dist(a) - dist(b))[0];
};

// 比べるための文字の整え方（全角半角・大文字小文字・空白・記号の違いを無視する）
export const normalizeForMatch = (s: string): string =>
    s.normalize("NFKC").toLowerCase().replace(/[\s　・･\-ー_.,，、()（）]/g, "");

const bigrams = (s: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
};
const dice = (a: string, b: string): number => {
    if (a.length < 2 || b.length < 2) return 0;
    const A = bigrams(a);
    const B = bigrams(b);
    const rest = [...B];
    let hit = 0;
    for (const g of A) {
        const i = rest.indexOf(g);
        if (i >= 0) {
            hit++;
            rest.splice(i, 1);
        }
    }
    return (2 * hit) / (A.length + B.length);
};

export interface SiteMatch {
    value: string; // 入力欄に入れる値（"グループ - 現場"）
    site: string;
    score: number;
}

// 予定表の現場名を、登録済みの現場から探す。似ているものが無ければ null
export const matchSite = (text: string, groups: SiteGroup[], hint = ""): SiteMatch | null => {
    const all = groups.flatMap((g) => g.sites.map((site) => ({ value: `${g.group} - ${site}`, site, norm: normalizeForMatch(site) })));
    const candidates = [text, hint].map(normalizeForMatch).filter(Boolean);
    let best: SiteMatch | null = null;
    for (const t of candidates) {
        for (const s of all) {
            let score = 0;
            if (s.norm === t) score = 1;
            else if (Math.min(s.norm.length, t.length) >= 2 && (s.norm.includes(t) || t.includes(s.norm))) score = 0.85;
            else score = dice(s.norm, t);
            if (score > (best?.score ?? 0)) best = { value: s.value, site: s.site, score };
        }
        if (best && best.score === 1) break;
    }
    return best && best.score >= 0.6 ? best : null;
};

export interface WorkerMatch {
    matched: string | null; // 名簿の名前
    ambiguous: boolean; // 名簿の複数の人に当てはまる
}

const splitName = (n: string): { surname: string; given: string } => {
    const [surname = "", ...rest] = n.normalize("NFKC").trim().split(/[\s　]+/);
    return { surname, given: rest.join("") };
};

// 予定表の名前（名字だけ・名前だけ・名字+名前の頭文字）を、名簿の名前に結びつける
export const matchWorker = (boardName: string, workerNames: string[]): WorkerMatch => {
    const b = normalizeForMatch(boardName);
    if (!b) return { matched: null, ambiguous: false };
    const hits = workerNames.filter((m) => {
        const { surname, given } = splitName(m);
        const s = normalizeForMatch(surname);
        const g = normalizeForMatch(given);
        const full = normalizeForMatch(m);
        if (b === full || b === s + g) return true;
        if (b === s) return true;
        if (g && b === g) return true;
        // 同じ名字の人がいるときの「池田勇」のような書き方（名字＋名前の頭の部分）
        return !!g && b.length > s.length && b.startsWith(s) && g.startsWith(b.slice(s.length));
    });
    // 完全に同じ名前（氏名どおり）の人がいれば、その人を優先する
    const exact = hits.filter((m) => normalizeForMatch(m) === b);
    const pool = exact.length > 0 ? exact : hits;
    if (pool.length === 1) return { matched: pool[0], ambiguous: false };
    return { matched: null, ambiguous: pool.length > 1 };
};

export interface PlanMember {
    board: string; // 予定表に書かれた名前
    matched: string | null; // 名簿の名前（なければ null）
    ambiguous: boolean;
    isSelf: boolean; // 本人
}

export interface SchedulePlan {
    date: string; // YYYY-MM-DD
    day: ScheduleDay;
    siteLabel: string; // 予定表に書かれていた現場名 / 事務所
    site: SiteMatch | null; // 登録済みの現場との対応（事務所のときは事務所）
    members: PlanMember[];
    content: string; // 作業内容の初期値（事務所なら「図面作成」）
}

export const OFFICE_SITE = "事務所";
export const OFFICE_CONTENT = "図面作成";
export const OFFICE_GROUP = "その他";

// 1日分の読み取り結果から、日報の入力内容の案を作る
export const buildSchedulePlan = (
    day: ScheduleDay,
    date: string,
    workerNames: string[],
    groups: SiteGroup[],
    reporterName: string
): SchedulePlan => {
    const self = splitName(reporterName).surname;
    const selfNorm = normalizeForMatch(self);
    const members: PlanMember[] = day.members.map((board) => {
        const { matched, ambiguous } = matchWorker(board, workerNames);
        const selfMatched = matchWorker(self, workerNames).matched;
        const isSelf = !!selfNorm && (normalizeForMatch(board) === selfNorm || (matched !== null && matched === selfMatched));
        return { board, matched, ambiguous, isSelf };
    });

    if (day.status === "office") {
        // 事務所は本人だけ（予定表には名前の入るマスがないので、本人を人員にする）
        const only: PlanMember[] = self
            ? [{ board: self, ...matchWorker(self, workerNames), isSelf: true }]
            : [];
        return { date, day, siteLabel: OFFICE_SITE, site: matchSite(OFFICE_SITE, groups), members: only, content: OFFICE_CONTENT };
    }
    return {
        date,
        day,
        siteLabel: day.site,
        site: day.status === "site" ? matchSite(day.site, groups, day.registeredSite) : null,
        members,
        content: "",
    };
};
