import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { extractPdfText } from "@/lib/pdf";
import { saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
    }

    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF uploads are supported" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF must be under 12MB" },
        { status: 400 }
      );
    }

    const pdfText = await extractPdfText(buffer);
    const sessionId = uuidv4();

    saveSession({
      id: sessionId,
      fileName: file.name || "document.pdf",
      pdfText,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({
      sessionId,
      fileName: file.name,
      charCount: pdfText.length,
      preview: pdfText.slice(0, 400),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
