// 送信する写真を、読み取りに十分な大きさで、通信量が大きくなりすぎないように整える（ブラウザ専用）
const MAX_SIDE = 2400; // 予定表の文字は小さいので、あまり小さくしない
const MAX_BYTES = 4_000_000; // サーバーの上限（約4.3MB）より少し小さく

export async function prepareScheduleImage(file: File): Promise<Blob> {
    // 向きの情報（EXIF）に従って、スマホで縦持ちで撮った写真も正しい向きにする
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を処理できませんでした。");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    for (const quality of [0.9, 0.82, 0.72, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("写真が大きすぎて送れません。撮り直すか、小さい写真を選んでください。");
}
