"use client";

export interface ParsedLocalDocument {
  text: string;
  fileName: string;
  kind: "pdf" | "docx" | "text";
  pageCount?: number;
}

function normalizedText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function parseLocalDocument(file: File): Promise<ParsedLocalDocument> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const mammothModule = await import("mammoth");
    const mammoth = mammothModule.default ?? mammothModule;
    const buffer = await file.arrayBuffer();
    const extracted = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = normalizedText(extracted.value ?? "");
    if (!text) {
      throw new Error("The selected DOCX file has no extractable text.");
    }
    return {
      text,
      fileName: file.name,
      kind: "docx",
    };
  }

  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let currentLine = "";

      for (const item of content.items) {
        if (!("str" in item)) continue;
        const chunk = item.str;
        currentLine = currentLine ? `${currentLine} ${chunk}` : chunk;
        if ("hasEOL" in item && item.hasEOL) {
          lines.push(currentLine.trim());
          currentLine = "";
        }
      }
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      pages.push(lines.filter(Boolean).join("\n"));
    }

    const text = normalizedText(pages.join("\n\n"));
    if (!text) {
      throw new Error("No embedded text found in this PDF. Try a text-based PDF or export as PNG.");
    }
    return {
      text,
      fileName: file.name,
      kind: "pdf",
      pageCount: pdf.numPages,
    };
  }

  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    file.type.startsWith("text/")
  ) {
    const text = normalizedText(await file.text());
    if (!text) {
      throw new Error("The selected text file is empty.");
    }
    return {
      text,
      fileName: file.name,
      kind: "text",
    };
  }

  throw new Error(
    "Unsupported file type. Upload a PDF, DOCX, TXT, MD, PNG, or JPEG file.",
  );
}
