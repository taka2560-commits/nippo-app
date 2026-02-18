// モック用のインメモリ日報ストア
// 本番ではGoogle Sheetsから読み取る

export interface StoredReport {
    reportDate: string;
    workerNames: string[];
    workSite: string;
    earlyStart: string;
    overtimeHours: string;
    workEntries: {
        location: string;
        content: string;
        manDays: number;
        overtime: number;
    }[];
    materials: {
        name: string;
        quantity: number;
    }[];
    remarks: string;
    submittedAt: string;
}

// Next.js開発モードではモジュールがホットリロードで再評価されるため
// globalThisに保存して永続化する
declare global {
    // eslint-disable-next-line no-var
    var _reportStore: Map<string, StoredReport> | undefined;
}

function getStore(): Map<string, StoredReport> {
    if (!globalThis._reportStore) {
        globalThis._reportStore = new Map();
    }
    return globalThis._reportStore;
}

// 日報を保存（同じ日付は上書き）
export function saveReport(report: StoredReport): void {
    const store = getStore();
    store.set(report.reportDate, report);
    console.log(`[日報ストア] 保存: ${report.reportDate} (全${store.size}件)`);
}

// 日付で日報を取得
export function getReportByDate(date: string): StoredReport | null {
    const store = getStore();
    const report = store.get(date) || null;
    console.log(`[日報ストア] 検索: ${date} → ${report ? "あり" : "なし"}`);
    return report;
}

// 全日報の日付一覧を取得
export function getReportDates(): string[] {
    return Array.from(getStore().keys()).sort();
}

// 日報を削除
export function deleteReport(date: string): boolean {
    const store = getStore();
    const deleted = store.delete(date);
    console.log(`[日報ストア] 削除: ${date} → ${deleted ? "成功" : "該当なし"} (残${store.size}件)`);
    return deleted;
}
