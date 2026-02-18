"use client";

// マスタデータの型定義
export interface SiteGroup {
    group: string;
    sites: string[];
}

export interface StorageSettings {
    workerNames: string[];
    workSiteGroups: SiteGroup[];
    workContents: string[];
    locationOptions: string[];
    materialOptions: string[];
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
const REPORTS_KEY = "nippo_reports";

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
export const getReports = (): StoredReport[] => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(REPORTS_KEY);
    if (!stored) return [];
    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
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
