import { getReports, StoredReport } from "./storage";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface MonthlyReportData {
    date: string; // YYYY-MM-DD
    dayOfWeek: string; // 火, 水...
    content: string; // 作業内容
    location: string; // 場所
    manDays: number; // 人工
    materials: string; // 材料・リースなど
    earlyOvertime: number; // 早出残業 (時間)
    normalOvertime: number; // 普通残業 (時間)
    midnightOvertime: number; // 深夜残業 (時間) - 現状データにはないが枠として
    workerNames: string; // 作業員名
    remarks: string; // 備考
}

/**
 * 指定された年月の月報データ（前月16日〜当月15日）を生成する
 * @param year 対象年
 * @param month 対象月（1〜12）
 */
export const generateMonthlyReportData = (year: number, month: number): MonthlyReportData[] => {
    // 期間の計算
    // 開始日: 前月の16日
    // 終了日: 当月の15日
    const startDate = new Date(year, month - 2, 16); // monthは1始まり、Dateは0始まり
    const endDate = new Date(year, month - 1, 15);

    const reports = getReports();
    console.log("All Reports:", reports); // デバッグ用
    console.log("Target Period:", startDate.toISOString(), "~", endDate.toISOString());

    const result: MonthlyReportData[] = [];

    // 期間内の日付ループ
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // toISOString()はUTCになるため、ローカルタイムでY-M-Dを組み立てる
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${da}`;

        const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];

        // その日の日報を探す
        const report = reports.find((r) => r.reportDate === dateStr);
        console.log(`Checking date: ${dateStr}, Found:`, !!report); // デバッグ用

        if (report) {
            // データあり
            const content = report.workEntries.map((e) => e.content).join("\n");
            const location = report.workEntries.map((e) => e.location || "").filter(Boolean).join(", ");
            // 人工合計
            const manDays = report.workEntries.reduce((sum, e) => sum + (e.manDays || 0), 0);

            // 材料
            const materials = (report.materials || [])
                .map((m) => `${m.name}${m.quantity !== 1 ? `×${m.quantity}` : ""}`)
                .join(", ");

            // 残業時間（早出、普通）
            // データ構造上、earlyStart, overtimeHours は文字列で保存されている場合があるためパース
            const early = parseFloat(report.earlyStart || "0");
            const overtime = parseFloat(report.overtimeHours || "0");

            result.push({
                date: `${d.getMonth() + 1}/${d.getDate()}`,
                dayOfWeek,
                content: content, // 場所も含める場合は `${content} ${location ? `(${location})` : ""}`
                location,
                manDays,
                materials,
                earlyOvertime: early,
                normalOvertime: overtime,
                midnightOvertime: 0, // 未実装
                workerNames: (report.workerNames || []).join(" "),
                remarks: report.remarks || "",
            });
        } else {
            // データなし（空行）
            result.push({
                date: `${d.getMonth() + 1}/${d.getDate()}`,
                dayOfWeek,
                content: "",
                location: "",
                manDays: 0,
                materials: "",
                earlyOvertime: 0,
                normalOvertime: 0,
                midnightOvertime: 0,
                workerNames: "",
                remarks: "",
            });
        }
    }

    return result;
};

/**
 * Excel出力
 */
export const exportToExcel = (data: MonthlyReportData[], year: number, month: number) => {
    // データ整形 for Excel
    const excelData = data.map((d) => ({
        "日": d.date,
        "曜日": d.dayOfWeek,
        "主な作業内容": d.content,
        "場所": d.location, // 分けておく
        "出来高(人工)": d.manDays || "", // 0なら空欄の方が見やすいかも
        "材料・リース": d.materials,
        "早出残業": d.earlyOvertime || "",
        "残業": d.normalOvertime || "",
        "作業員名": d.workerNames,
        "備考": d.remarks,
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${month}月度月報`);

    // 列幅調整（簡易）
    worksheet["!cols"] = [
        { wch: 6 }, // 日
        { wch: 4 }, // 曜日
        { wch: 40 }, // 作業内容
        { wch: 15 }, // 場所
        { wch: 8 }, // 人工
        { wch: 20 }, // 材料
        { wch: 8 }, // 早出
        { wch: 8 }, // 残業
        { wch: 20 }, // 作業員
        { wch: 20 }, // 備考
    ];

    const fileName = `nippo_monthly_${year}_${month}.xlsx`;
    XLSX.writeFile(workbook, fileName);
};

/**
 * PDF出力（画像レイアウト風）
 */
export const exportToPDF = async (data: MonthlyReportData[], year: number, month: number, siteName: string = "") => {
    // A4横向き
    const doc = new jsPDF("l", "pt", "a4");

    // 日本語フォント読み込み
    try {
        const fontUrl = "/fonts/IBMPlexSansJP-Regular.ttf";
        const response = await fetch(fontUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch font: ${response.statusText}`);
        }
        const fontBytes = await response.arrayBuffer();

        // base64変換
        const uint8Array = new Uint8Array(fontBytes);
        let binaryString = "";
        for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64String = btoa(binaryString);

        // VFSに追加
        const fileName = "IBMPlexSansJP-Regular.ttf";
        doc.addFileToVFS(fileName, base64String);
        doc.addFont(fileName, "IBMPlexSansJP", "normal");
        doc.setFont("IBMPlexSansJP");
    } catch (e) {
        console.error("Font load error:", e);
        alert("日本語フォント(IBM Plex Sans JP)の読み込みに失敗しました。\n管理者にご連絡ください。");
    }

    // タイトル
    doc.setFontSize(18);
    // フォント指定
    try {
        doc.setFont("IBMPlexSansJP");
    } catch { }

    doc.text(`作業月報 令和${year - 2018}年${month}月度`, 40, 40);
    doc.setFontSize(12);
    doc.text(`現場名: ${siteName}`, 300, 40);

    // データ検証とサニタイズ
    const bodyData = data.map((d) => [
        d.date || "",
        d.dayOfWeek || "",
        (d.content || "") + (d.location ? ` (${d.location})` : ""),
        d.manDays ? String(d.manDays) : "",
        "人",
        d.materials || "",
        d.remarks || "",
        d.earlyOvertime ? String(d.earlyOvertime) : "",
        d.normalOvertime ? String(d.normalOvertime) : "",
        d.workerNames || ""
    ]);

    // デバッグ情報
    console.log("PDF Body Data Sample:", bodyData[0]);

    const tableMetadata = {
        startY: 60,
        head: [[
            "日", "曜日", "主な作業内容",
            "出来高\n数量", "単位",
            "材料・リース", "備考",
            "早出", "残業", "作業員名"
        ]],
        body: bodyData,
        theme: "grid" as const,
        styles: {
            fontSize: 7,
            cellPadding: 2,
            overflow: "linebreak" as const,
            font: "IBMPlexSansJP",
            fontStyle: "normal" as const,
            valign: "middle" as const,
        },
        headStyles: {
            fillColor: [220, 220, 220] as [number, number, number],
            textColor: 0,
            halign: "center" as const,
            valign: "middle" as const,
            lineWidth: 0.5,
            lineColor: 100
        },
        bodyStyles: {
            lineWidth: 0.5,
            lineColor: 150
        },
        columnStyles: {
            0: { cellWidth: 30, halign: "center" as const }, // 日
            1: { cellWidth: 25, halign: "center" as const }, // 曜日
            // 2: 作業内容（自動）
            3: { cellWidth: 35, halign: "right" as const }, // 出来高
            4: { cellWidth: 30, halign: "center" as const }, // 単位
            5: { cellWidth: 100 }, // 材料
            6: { cellWidth: 80 }, // 備考
            7: { cellWidth: 35, halign: "right" as const }, // 早出
            8: { cellWidth: 35, halign: "right" as const }, // 残業
            9: { cellWidth: 100 }, // 作業員名
        },
    };

    autoTable(doc, tableMetadata);

    doc.save(`nippo_monthly_${year}_${month}.pdf`);
};
