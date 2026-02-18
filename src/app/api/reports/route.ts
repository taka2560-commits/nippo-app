import { NextRequest, NextResponse } from "next/server";
import { getReportByDate, getReportDates, deleteReport } from "@/lib/report-store";

// 日付で日報を取得するAPI
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
        // 日付一覧を返す
        const dates = getReportDates();
        return NextResponse.json({ dates });
    }

    // 指定日付の日報を返す
    const report = getReportByDate(date);
    if (!report) {
        return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
        exists: true,
        report,
    });
}

// 日報を削除するAPI
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");

    if (!date) {
        return NextResponse.json(
            { error: "日付を指定してください。" },
            { status: 400 }
        );
    }

    const deleted = deleteReport(date);
    if (!deleted) {
        return NextResponse.json(
            { error: "指定された日付の日報が見つかりません。" },
            { status: 404 }
        );
    }

    return NextResponse.json({
        success: true,
        message: `${date} の日報を削除しました。`,
    });
}
