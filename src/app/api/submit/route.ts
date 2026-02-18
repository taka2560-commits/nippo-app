import { NextRequest, NextResponse } from "next/server";
import { appendRow, isMockMode } from "@/lib/google-sheets";
import { saveReport } from "@/lib/report-store";

interface WorkEntry {
    location: string;
    content: string;
    manDays: number;
    overtime: number;
}

interface MaterialItem {
    name: string;
    quantity: number;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { reportDate, workerNames, workSite, earlyStart, overtimeHours, workEntries, materials, remarks } = body as {
            reportDate?: string;
            workerNames: string[];
            workSite: string;
            earlyStart?: string;
            overtimeHours?: string;
            workEntries: WorkEntry[];
            materials?: MaterialItem[];
            remarks?: string;
        };

        // バリデーション
        if (!workerNames || workerNames.length === 0) {
            return NextResponse.json(
                { error: "作業者を1名以上選択してください。" },
                { status: 400 }
            );
        }
        if (!workSite) {
            return NextResponse.json(
                { error: "作業現場を選択してください。" },
                { status: 400 }
            );
        }
        if (!workEntries || workEntries.length === 0) {
            return NextResponse.json(
                { error: "作業内容を1つ以上追加してください。" },
                { status: 400 }
            );
        }

        // タイムスタンプをバックエンドで自動生成
        const timestamp = new Date().toLocaleString("ja-JP", {
            timeZone: "Asia/Tokyo",
        });

        // 作業者名を結合
        const workerNamesStr = workerNames.join(", ");

        // 材料・リースを文字列変換
        const materialsStr = (materials || [])
            .map((m) => `${m.name} ×${m.quantity}`)
            .join(", ");

        // 早出・残業を文字列化
        const earlyStartStr = earlyStart && earlyStart !== "0" ? `早出${earlyStart}h` : "";
        const overtimeHoursStr = overtimeHours && overtimeHours !== "0" ? `残業${overtimeHours}h` : "";

        // 各作業内容を1行ずつスプレッドシートに書き込み
        for (const entry of workEntries) {
            await appendRow([
                reportDate || timestamp,
                timestamp,
                workerNamesStr,
                workSite,
                entry.location || "",
                entry.content,
                String(entry.manDays),
                String(entry.overtime),
                earlyStartStr,
                overtimeHoursStr,
                materialsStr,
                remarks || "",
            ]);
        }

        // インメモリストアに保存（日付で再編集可能にする）
        const dateStr = reportDate || new Date().toISOString().split("T")[0];
        saveReport({
            reportDate: dateStr,
            workerNames,
            workSite,
            earlyStart: earlyStart || "0",
            overtimeHours: overtimeHours || "0",
            workEntries,
            materials: materials || [],
            remarks: remarks || "",
            submittedAt: timestamp,
        });

        return NextResponse.json({
            success: true,
            message: "日報を送信しました。",
            mock: isMockMode(),
        });
    } catch (error) {
        console.error("日報送信エラー:", error);
        return NextResponse.json(
            { error: "送信に失敗しました。もう一度お試しください。" },
            { status: 500 }
        );
    }
}
