import { handleScheduleRequest, handleScheduleStatus } from "@/lib/schedule-server";

// 画像を読むのに時間がかかるため、長めに待つ（Vercelの無料プランの上限は60秒）
export const maxDuration = 60;

// 使える状態か（キー・合言葉が設定されているか）だけを返す
export async function GET() {
    return handleScheduleStatus(process.env);
}

export async function POST(request: Request) {
    return handleScheduleRequest(request, process.env);
}
