// 月報PDFの描画。Excelの様式（A4縦・1ページ）を、元のPDFから測った座標でそのまま再現する。
// 座標の単位はpt。ブラウザ・Node のどちらでも使えるよう、フォントの読み込みは呼び出し側で行う。
import type { jsPDF } from "jspdf";
import { formatHours, type MonthlySheet, type SheetRow } from "./monthly-sheet.ts";

export const PDF_FONT_NAME = "IBMPlexSansJP";
export const PDF_FONT_FILE = "IBMPlexSansJP-Regular.ttf";

// 列の左右の位置（日・曜日・現場名・作業時間・主な作業内容・時間外内訳・人員×3・早・残・自車）
const X = {
    left: 23.52, a: 42.9, b: 63.2, cd: 122.24, e: 178.04, f: 312.49, g: 446.92,
    h: 471.16, i: 495.4, j: 519.64, k: 541.36, l: 563.1, right: 582.48,
} as const;
const CELL = {
    day: [X.left, X.a], weekday: [X.a, X.b], site: [X.b, X.cd], time: [X.cd, X.e], content: [X.e, X.f],
    note: [X.f, X.g], n1: [X.g, X.h], n2: [X.h, X.i], n3: [X.i, X.j], early: [X.j, X.k], late: [X.k, X.l],
    car: [X.l, X.right],
} as const;

const TOP = 65.62; // 表の上端（外枠の中心線）
const HEAD_MID = 78.46; // 見出し2段目の境目
const DATA_TOP = 91.32;
const ROW_H = 19.5645;
const ROWS = 31; // 期間が短い月は、空の行で31行にそろえる
const BOTTOM = DATA_TOP + ROWS * ROW_H; // 697.76

const THICK = 1.8; // 外枠
const THIN = 0.2; // 内側の罫線
const BOX = 0.96; // 下の集計・備考の枠
const GREY = 217;

const mid = (c: readonly [number, number]) => (c[0] + c[1]) / 2;
// 文字の縦位置：行の中心に、文字の上下の真ん中がくるようにそろえる
const BASELINE_OFFSET = 0.38;

type Doc = jsPDF;

const bold = (doc: Doc, s: string, x: number, y: number, size: number) => {
    // 太字のフォントがないため、輪郭を足して太く見せる
    doc.setFontSize(size);
    doc.setLineWidth(size * 0.04);
    doc.setDrawColor(0, 0, 0);
    doc.text(s, x, y, { align: "center", renderingMode: "fillThenStroke" });
};

const plain = (doc: Doc, s: string, x: number, y: number, size: number, align: "center" | "left" | "right" = "center") => {
    doc.setFontSize(size);
    doc.text(s, x, y, { align });
};

// 文字を指定の幅に収める。まず少し縮め、それでも入らなければ折り返して（最大 maxLines 行）、さらに縮める
const fit = (doc: Doc, s: string, maxW: number, size: number, minSize: number, maxLines: number) => {
    const width = (t: string, sz: number) => {
        doc.setFontSize(sz);
        return doc.getTextWidth(t);
    };
    for (let sz = size; sz >= size * 0.86; sz -= 0.1) {
        if (width(s, sz) <= maxW) return { lines: [s], size: sz };
    }
    for (let sz = size; sz >= minSize - 0.001; sz -= 0.2) {
        const lines: string[] = [];
        let line = "";
        for (const ch of Array.from(s)) {
            if (line && width(line + ch, sz) > maxW) {
                lines.push(line);
                line = ch.trim() === "" ? "" : ch;
            } else {
                line += ch;
            }
        }
        if (line) lines.push(line);
        if (lines.length <= maxLines) return { lines, size: sz };
    }
    // どうしても入らないときは、最後を「…」にして切る
    const sz = minSize;
    const lines: string[] = [];
    let line = "";
    for (const ch of Array.from(s)) {
        if (line && width(line + ch, sz) > maxW) {
            lines.push(line);
            line = ch;
            if (lines.length === maxLines) break;
        } else {
            line += ch;
        }
    }
    if (lines.length < maxLines && line) lines.push(line);
    let last = lines[maxLines - 1] ?? lines[lines.length - 1] ?? "";
    while (last && width(last + "…", sz) > maxW) last = last.slice(0, -1);
    lines[Math.min(lines.length, maxLines) - 1] = last + "…";
    return { lines: lines.slice(0, maxLines), size: sz };
};

// セルの中に、中央ぞろえで文字を書く（長ければ縮小・折り返し）
const cellText = (
    doc: Doc,
    s: string,
    cell: readonly [number, number],
    rowTop: number,
    size: number,
    minSize = 5.2,
    maxLines = 2
) => {
    if (!s) return;
    const { lines, size: sz } = fit(doc, s, cell[1] - cell[0] - 3, size, minSize, maxLines);
    doc.setFontSize(sz);
    const pitch = sz * 1.15;
    const center = rowTop + ROW_H / 2;
    lines.forEach((ln, i) => {
        const lineCenter = center + (i - (lines.length - 1) / 2) * pitch;
        doc.text(ln, mid(cell), lineCenter + sz * BASELINE_OFFSET, { align: "center" });
    });
};

const rect = (doc: Doc, x0: number, y0: number, x1: number, y1: number) => doc.rect(x0, y0, x1 - x0, y1 - y0, "F");

const hline = (doc: Doc, y: number, x0: number, x1: number) => {
    doc.setLineWidth(THIN);
    doc.line(x0, y, x1, y);
};
const vline = (doc: Doc, x: number, y0: number, y1: number) => {
    doc.setLineWidth(THIN);
    doc.line(x, y0, x, y1);
};

const drawRow = (doc: Doc, row: SheetRow | undefined, top: number) => {
    if (!row) return;
    // 日・曜日は、作業のない日も書く
    cellText(doc, String(row.day), CELL.day, top, 8.52, 8.52, 1);
    cellText(doc, row.weekday, CELL.weekday, top, 8.52, 8.52, 1);
    if (!row.hasWork) return;

    cellText(doc, row.site, CELL.site, top, 7.56);
    cellText(doc, row.time, CELL.time, top, 7.56, 6, 1);
    cellText(doc, row.content, CELL.content, top, 7.56);
    cellText(doc, row.overtimeNote, CELL.note, top, 7.56);

    const cells = [CELL.n1, CELL.n2, CELL.n3];
    if (row.names.length <= 3) {
        row.names.forEach((n, i) => cellText(doc, n, cells[i], top, 7.56, 4.8, 1));
    } else {
        // 4人以上は、3つの欄にまたがる1つの枠に、折り返して書く
        cellText(doc, row.names.join("・"), [X.g, X.j], top, 7.56, 5.2, 2);
    }
    if (row.early > 0) cellText(doc, formatHours(row.early), CELL.early, top, 8.52, 6, 1);
    if (row.late > 0) cellText(doc, formatHours(row.late), CELL.late, top, 8.52, 6, 1);
};

// 描画の前に、日本語フォントをdocに登録して選択しておくこと
export function drawMonthlySheet(doc: Doc, sheet: MonthlySheet): void {
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);

    // 1. 作業のない土日の灰色
    doc.setFillColor(GREY, GREY, GREY);
    sheet.rows.slice(0, ROWS).forEach((row, i) => {
        if (row.greyed) rect(doc, 22.62, DATA_TOP + i * ROW_H, 583.38, DATA_TOP + (i + 1) * ROW_H);
    });
    doc.setFillColor(0, 0, 0);

    // 2. 罫線
    for (let i = 0; i < ROWS; i++) hline(doc, DATA_TOP + i * ROW_H, X.left, X.right); // 見出しの下（i=0）〜最後の1本手前
    hline(doc, HEAD_MID, X.j, X.l); // 「時間外」の下
    for (const x of [X.a, X.b, X.cd, X.e, X.f, X.g, X.j, X.l]) vline(doc, x, TOP, BOTTOM);
    vline(doc, X.k, HEAD_MID, BOTTOM);
    vline(doc, X.h, DATA_TOP, BOTTOM);
    vline(doc, X.i, DATA_TOP, BOTTOM);

    // 3. 太い外枠
    rect(doc, 21.72, TOP - THICK / 2, 584.28, TOP + THICK / 2);
    rect(doc, 21.72, BOTTOM - THICK / 2, 584.28, BOTTOM + THICK / 2);
    rect(doc, 21.72, TOP - THICK / 2, 23.52, BOTTOM + THICK / 2);
    rect(doc, 582.48, TOP - THICK / 2, 584.28, BOTTOM + THICK / 2);

    // 4. 見出し（1行目：タイトル・期間・氏名）
    bold(doc, sheet.title, (X.left + X.f) / 2, 58.72, 11.4);
    bold(doc, sheet.periodText, mid([X.f, X.g]), 58.48, 9.48);
    if (sheet.reporterName) bold(doc, sheet.reporterName, mid([X.g, X.right]), 58.0, 9.48);

    // 見出し（2〜3行目）
    const head = 81.28;
    plain(doc, "日", mid(CELL.day), head, 8.52);
    plain(doc, "曜日", mid(CELL.weekday), head, 8.52);
    plain(doc, "現場名", mid(CELL.site), head, 8.52);
    plain(doc, "作業時間", mid(CELL.time), head, 8.52);
    plain(doc, "主な作業内容", mid(CELL.content), head, 8.52);
    plain(doc, "時間外 ・  内訳内容 ・ （夜勤）", mid(CELL.note), head, 8.52);
    plain(doc, "人員", (X.g + X.j) / 2, head, 8.52);
    plain(doc, "時間外", (X.j + X.l) / 2, 74.8, 8.52);
    plain(doc, "早", mid(CELL.early), 88.14, 8.52);
    plain(doc, "残", mid(CELL.late), 88.14, 8.52);
    plain(doc, "自車", mid(CELL.car), 80.92, 7.56);

    // 5. 各日の行
    for (let i = 0; i < ROWS; i++) drawRow(doc, sheet.rows[i], DATA_TOP + i * ROW_H);

    // 6. 下の集計
    const bx0 = 22.56, bx1 = 122.18, by0 = 710.54, by1 = 776.3;
    doc.setFillColor(0, 0, 0);
    rect(doc, bx0 - BOX / 2, by0 - BOX / 2, bx1 + BOX / 2, by0 + BOX / 2);
    rect(doc, bx0 - BOX / 2, by1 - BOX / 2, bx1 + BOX / 2, by1 + BOX / 2);
    rect(doc, bx0 - BOX / 2, by0 - BOX / 2, bx0 + BOX / 2, by1 + BOX / 2);
    rect(doc, bx1 - BOX / 2, by0 - BOX / 2, bx1 + BOX / 2, by1 + BOX / 2);
    for (const y of [727.04, 743.48, 759.92]) hline(doc, y, bx0, bx1);
    vline(doc, 63.2, by0, by1);
    vline(doc, 92.72, by0, by1);

    const labels = ["出勤", "夜勤", "自車", "早出・残業"];
    const units = ["日", "日", "回", "ｈ"];
    const values = [String(sheet.workDays), "", "", String(Math.round(sheet.overtimeTotal * 100) / 100)];
    labels.forEach((label, i) => {
        // 「早出・残業」は枠からはみ出さないよう、必要なら縮める
        const { lines, size } = fit(doc, label, 38.6, 8.52, 6.5, 1);
        plain(doc, lines[0], 42.88, 721.58 + i * 16.44, size);
        if (values[i]) plain(doc, values[i], 90.9, 722.06 + i * 16.44, 8.52, "right");
        plain(doc, units[i], 107.45, 722.06 + i * 16.44, 8.52);
    });

    // 備考欄
    const nx0 = 177.98, nx1 = 583.32;
    rect(doc, nx0 - BOX / 2, by0 - BOX / 2, nx1 + BOX / 2, by0 + BOX / 2);
    rect(doc, nx0 - BOX / 2, by1 - BOX / 2, nx1 + BOX / 2, by1 + BOX / 2);
    rect(doc, nx0 - BOX / 2, by0 - BOX / 2, nx0 + BOX / 2, by1 + BOX / 2);
    rect(doc, nx1 - BOX / 2, by0 - BOX / 2, nx1 + BOX / 2, by1 + BOX / 2);
    plain(doc, "備考欄", 179.78, 720.02, 8.52, "left");
    const lines: string[] = [];
    for (const remark of sheet.remarkLines) {
        lines.push(...fit(doc, remark, nx1 - nx0 - 5, 7.56, 7.56, 2).lines);
    }
    const maxLines = 5;
    lines.slice(0, maxLines).forEach((ln, i) => {
        const isLast = i === maxLines - 1 && lines.length > maxLines;
        plain(doc, isLast ? `${ln}…` : ln, 179.78, 730.4 + i * 9.4, 7.56, "left");
    });

    // 規定出勤日数
    plain(doc, `規定出勤日数：${sheet.prescribedDays}`, mid([495.4, X.right]), 791.54, 9.48);
}
