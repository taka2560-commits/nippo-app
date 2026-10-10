"use client";

// マスタデータの型定義
export interface SiteGroup {
    group: string;
    sites: string[];
}

// よく使う「作業者＋現場」の組み合わせ
export interface WorkPreset {
    name: string;
    workerNames: string[];
    workSite: string;
}

export interface StorageSettings {
    workerNames: string[];
    workSiteGroups: SiteGroup[];
    workContents: string[];
    locationOptions: string[];
    materialOptions: string[];
    presets: WorkPreset[];
    // 固定オプション（編集不可だが保存はしておく）
    manDayOptions: string[];
    overtimeOptions: string[]; // 早出残業の選択肢（0.5h, 1.0h...）
    earlyStartOptions: string[];
    overtimeHoursOptions: string[];
}

// 日報データの型定義
export interface WorkEntry {
    location: string;
    content: string;
    manDays: number;
    overtime: number;
}

export interface MaterialItem {
    name: string;
    quantity: number;
}

export interface StoredReport {
    id?: string; // 一意なID（日付をID代わりにする運用だが、念のため）
    reportDate: string; // YYYY-MM-DD
    workerNames: string[];
    workSite: string;
    earlyStart: string;
    overtimeHours: string;
    workEntries: WorkEntry[];
    materials: MaterialItem[];
    remarks: string;
    submittedAt: string;
}

// デフォルトのマスタデータ
const DEFAULT_SETTINGS: StorageSettings = {
    workerNames: [
        "山田 太郎",
        "鈴木 一郎",
        "佐藤 花子",
        "田中 次郎",
        "高橋 三郎",
        "渡辺 四郎",
        "伊藤 五郎",
        "中村 六郎",
    ],
    workSiteGroups: [
        {
            group: "鹿島建設",
            sites: ["東京現場A", "横浜現場B", "千葉現場C"],
        },
        {
            group: "竹中工務店",
            sites: ["大阪現場A", "神戸現場B"],
        },
        {
            group: "西松建設",
            sites: ["名古屋現場A", "福岡現場B", "札幌現場C"],
        },
    ],
    locationOptions: [
        "A棟", "B棟", "C棟", "D棟",
        "A工区", "B工区", "C工区", "D工区",
    ],
    workContents: [
        "測量作業",
        "杭打ち",
        "掘削作業",
        "コンクリート打設",
        "配筋作業",
        "墨出し",
        "検査立会い",
        "資材搬入",
        "現場清掃",
        "安全確認・KY活動",
    ],
    materialOptions: [
        "通信・測量機器",
        "図面作成残業",
        "図面作成",
        "20角シール",
        "30角シール",
        "50角シール",
        "金属鋲",
        "木杭",
        "杭芯棒",
        "3Dスキャナー",
    ],
    presets: [],
    manDayOptions: [
        "0.25", "0.5", "0.75", "1.0",
        "1.25", "1.5", "1.75", "2.0",
        "2.25", "2.5", "2.75", "3.0",
        "3.25", "3.5", "3.75", "4.0",
        "4.25", "4.5", "4.75", "5.0",
        "5.25", "5.5", "5.75", "6.0",
        "6.25", "6.5", "6.75", "7.0",
        "7.25", "7.5", "7.75", "8.0",
    ],
    // 早出残業の時間の選択肢
    overtimeOptions: [
        "0", "0.5", "1.0", "1.5", "2.0", "2.5", "3.0",
        "3.5", "4.0", "4.5", "5.0", "5.5", "6.0",
    ],
    earlyStartOptions: [
        "0", "0.5", "1.0", "1.5", "2.0", "2.5", "3.0",
    ],
    overtimeHoursOptions: [
        "0", "0.5", "1.0", "1.5", "2.0", "2.5", "3.0",
        "3.5", "4.0", "4.5", "5.0", "5.5", "6.0",
    ],
};

const SETTINGS_KEY = "nippo_settings";
export const REPORTS_KEY = "nippo_reports";

// 設定（マスタ）関連
export const getSettings = (): StorageSettings => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;

    // 設定を取得
    const stored = localStorage.getItem(SETTINGS_KEY);
    let settings: StorageSettings;

    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            // マージして新しいキーがあれば追加
            settings = { ...DEFAULT_SETTINGS, ...parsed };
        } catch {
            settings = DEFAULT_SETTINGS;
        }
    } else {
        // 初回
        settings = DEFAULT_SETTINGS;
    }

    // 初回保存（存在しない場合のみ）
    if (!stored) {
        saveSettings(settings);
    }

    return settings;
};

export const saveSettings = (settings: StorageSettings) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// 日報関連
export const parseReports = (stored: string | null): StoredReport[] => {
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const getReports = (): StoredReport[] => {
    if (typeof window === "undefined") return [];
    return parseReports(localStorage.getItem(REPORTS_KEY));
};

// 選択肢を「過去の日報での使用回数が多い順」に並べる（同数は元の順を保つ）
export const sortByUsage = (options: string[], usedValues: string[]): string[] => {
    const counts = new Map<string, number>();
    for (const v of usedValues) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...options].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
};

export const getReportByDate = (date: string): StoredReport | undefined => {
    const reports = getReports();
    return reports.find((r) => r.reportDate === date);
};

export const saveReport = (report: StoredReport) => {
    if (typeof window === "undefined") return;
    const reports = getReports();
    const index = reports.findIndex((r) => r.reportDate === report.reportDate);

    if (index >= 0) {
        // 更新
        reports[index] = { ...report, submittedAt: new Date().toISOString() };
    } else {
        // 新規作成
        reports.push({ ...report, submittedAt: new Date().toISOString() });
    }
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
};

export const deleteReport = (date: string) => {
    if (typeof window === "undefined") return;
    const reports = getReports();
    const newReports = reports.filter((r) => r.reportDate !== date);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(newReports));
};

// バックアップ（機種変更時のデータ引き継ぎ）関連
const BACKUP_APP_ID = "nippo-app";
const BACKUP_VERSION = 1;

export interface BackupData {
    app: typeof BACKUP_APP_ID;
    version: number;
    exportedAt: string;
    settings: StorageSettings;
    reports: StoredReport[];
}

export type ImportMode = "merge" | "overwrite";

export interface ImportResult {
    reportCount: number; // 取り込み後の日報件数
    importedReportCount: number; // バックアップに含まれていた日報件数
}

// 現在の設定と日報をバックアップ用のデータにまとめる
export const createBackup = (): BackupData => ({
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    reports: getReports(),
});

export const getBackupFileName = (): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `nippo_backup_${stamp}.json`;
};

const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");

// バックアップファイルの中身を検証してBackupDataとして返す（不正ならエラー）
export const parseBackup = (text: string): BackupData => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("ファイルを読み込めませんでした。「nippo_backup_」で始まるバックアップファイルを選択してください。");
    }

    const data = parsed as Partial<BackupData> | null;
    if (!data || typeof data !== "object" || data.app !== BACKUP_APP_ID) {
        throw new Error("このファイルは日報アプリのバックアップではありません。");
    }
    if (typeof data.version !== "number" || data.version > BACKUP_VERSION) {
        throw new Error("このバックアップは新しいバージョンのアプリで作成されています。アプリを更新してから再度お試しください。");
    }

    const settings = data.settings as Partial<StorageSettings> | undefined;
    if (
        !settings ||
        typeof settings !== "object" ||
        !isStringArray(settings.workerNames) ||
        !Array.isArray(settings.workSiteGroups)
    ) {
        throw new Error("バックアップ内の設定データが壊れています。");
    }
    if (!Array.isArray(data.reports)) {
        throw new Error("バックアップ内の日報データが壊れています。");
    }

    const reports = data.reports.filter(
        (r): r is StoredReport =>
            !!r && typeof r === "object" && typeof (r as StoredReport).reportDate === "string"
    );

    return {
        app: BACKUP_APP_ID,
        version: data.version,
        exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
        settings: {
            ...DEFAULT_SETTINGS,
            ...settings,
            // 旧バージョンのバックアップには組み合わせが無いので空にする
            presets: Array.isArray(settings.presets)
                ? settings.presets.filter(
                      (p): p is WorkPreset =>
                          !!p &&
                          typeof p.name === "string" &&
                          typeof p.workSite === "string" &&
                          isStringArray(p.workerNames)
                  )
                : [],
        },
        reports,
    };
};

// マスタの文字列リストを重複なしで結合
const mergeList = (base: string[], extra: string[]): string[] =>
    Array.from(new Set([...base, ...extra]));

const mergeSettings = (current: StorageSettings, incoming: StorageSettings): StorageSettings => {
    const groups: SiteGroup[] = current.workSiteGroups.map((g) => ({ ...g, sites: [...g.sites] }));
    for (const g of incoming.workSiteGroups) {
        const existing = groups.find((x) => x.group === g.group);
        if (existing) {
            existing.sites = mergeList(existing.sites, g.sites);
        } else {
            groups.push({ group: g.group, sites: [...g.sites] });
        }
    }
    const presets = [...current.presets];
    for (const p of incoming.presets) {
        if (!presets.some((x) => x.name === p.name)) presets.push(p);
    }
    return {
        ...current,
        presets,
        workerNames: mergeList(current.workerNames, incoming.workerNames),
        workSiteGroups: groups,
        workContents: mergeList(current.workContents, incoming.workContents),
        locationOptions: mergeList(current.locationOptions, incoming.locationOptions),
        materialOptions: mergeList(current.materialOptions, incoming.materialOptions),
    };
};

// バックアップを取り込む
// merge: 今の端末のデータを残しつつ追加（同じ日付の日報はバックアップ側で上書き）
// overwrite: 今の端末のデータをすべてバックアップの内容に置き換え
export const restoreBackup = (backup: BackupData, mode: ImportMode): ImportResult => {
    if (typeof window === "undefined") return { reportCount: 0, importedReportCount: 0 };

    let settings: StorageSettings;
    let reports: StoredReport[];

    if (mode === "overwrite") {
        settings = backup.settings;
        reports = backup.reports;
    } else {
        settings = mergeSettings(getSettings(), backup.settings);
        const byDate = new Map<string, StoredReport>();
        for (const r of getReports()) byDate.set(r.reportDate, r);
        for (const r of backup.reports) byDate.set(r.reportDate, r);
        reports = Array.from(byDate.values());
    }

    reports.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    saveSettings(settings);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));

    return { reportCount: reports.length, importedReportCount: backup.reports.length };
};

// 入力途中の下書き（アプリを閉じる・画面を切り替えても続きから再開できるようにする）
// 日付ごとに1件ずつ保存する。別の日を開いても、書きかけの日の下書きは残る。
const DRAFT_KEY = "nippo_drafts";
const DRAFT_MAX_AGE_DAYS = 14;
const DRAFT_MAX_COUNT = 10;

export interface FormDraft {
    reportDate: string;
    workerNames: string[];
    workSite: string;
    earlyStart: string;
    overtimeHours: string;
    workEntries: { location: string; content: string; manDays: string; overtime: string }[];
    materials: { name: string; quantity: string }[];
    remarks: string;
    savedAt: string;
}

const isValidDraft = (d: unknown): d is FormDraft => {
    const x = d as Partial<FormDraft> | null;
    if (
        !x ||
        typeof x !== "object" ||
        typeof x.reportDate !== "string" ||
        typeof x.savedAt !== "string" ||
        !isStringArray(x.workerNames) ||
        !Array.isArray(x.workEntries) ||
        !Array.isArray(x.materials)
    ) {
        return false;
    }
    const ageDays = (Date.now() - new Date(x.savedAt).getTime()) / 86400000;
    return ageDays <= DRAFT_MAX_AGE_DAYS; // 古い下書き・日時が壊れた下書きは無視
};

const readDrafts = (): Record<string, FormDraft> => {
    if (typeof window === "undefined") return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
        const result: Record<string, FormDraft> = {};
        if (parsed && typeof parsed === "object") {
            for (const [date, d] of Object.entries(parsed)) {
                if (isValidDraft(d) && d.reportDate === date) result[date] = d;
            }
        }
        return result;
    } catch {
        return {};
    }
};

const writeDrafts = (drafts: Record<string, FormDraft>) => {
    try {
        const newest = Object.values(drafts)
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
            .slice(0, DRAFT_MAX_COUNT);
        localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(newest.map((d) => [d.reportDate, d]))));
    } catch {
        // 容量超過などで保存できなくても、入力そのものは止めない
    }
};

export const saveDraft = (draft: FormDraft) => {
    if (typeof window === "undefined") return;
    writeDrafts({ ...readDrafts(), [draft.reportDate]: draft });
};

export const clearDraft = (date: string) => {
    if (typeof window === "undefined") return;
    const drafts = readDrafts();
    if (!(date in drafts)) return;
    delete drafts[date];
    writeDrafts(drafts);
};

// date を指定するとその日の下書き、省略すると最後に書いた下書きを返す
export const getDraft = (date?: string): FormDraft | null => {
    const drafts = readDrafts();
    if (date) return drafts[date] ?? null;
    return Object.values(drafts).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
};

// バックアップの促し（最後に引き継ぎファイルを書き出してから一定期間たったら知らせる）
const LAST_BACKUP_KEY = "nippo_last_backup";
const FIRST_SEEN_KEY = "nippo_first_seen";
const BACKUP_SNOOZE_KEY = "nippo_backup_snooze_until";
export const BACKUP_REMINDER_DAYS = 30;

export const getLastBackupAt = (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LAST_BACKUP_KEY);
};

export const markBackupDone = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
    localStorage.removeItem(BACKUP_SNOOZE_KEY);
};

export const snoozeBackupReminder = (days = 7) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BACKUP_SNOOZE_KEY, String(Date.now() + days * 86400000));
};

export const getBackupReminder = (): { show: boolean; daysSince: number; neverBackedUp: boolean } => {
    const none = { show: false, daysSince: 0, neverBackedUp: false };
    if (typeof window === "undefined" || getReports().length === 0) return none;

    const last = getLastBackupAt();
    let firstSeen = localStorage.getItem(FIRST_SEEN_KEY);
    if (!firstSeen) {
        firstSeen = new Date().toISOString();
        localStorage.setItem(FIRST_SEEN_KEY, firstSeen);
    }
    const base = new Date(last ?? firstSeen).getTime();
    if (isNaN(base)) return none;

    const daysSince = Math.floor((Date.now() - base) / 86400000);
    const snoozeUntil = Number(localStorage.getItem(BACKUP_SNOOZE_KEY) ?? 0);
    return {
        show: daysSince >= BACKUP_REMINDER_DAYS && Date.now() >= snoozeUntil,
        daysSince,
        neverBackedUp: !last,
    };
};
