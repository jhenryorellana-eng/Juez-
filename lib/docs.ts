import mammoth from "mammoth";
import type { PreparedDoc } from "./gemini";

/** Texto máximo por documento (.docx/.txt) que se envía al modelo. */
export const MAX_TEXT_CHARS = 300_000;

/** Convierte un archivo (nombre + bytes) en un documento evaluable. */
export async function prepareDoc(name: string, buffer: Buffer): Promise<PreparedDoc> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { kind: "pdf", name, buffer };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) throw new Error(`EMPTY:${name}`);
    return { kind: "text", name, text };
  }
  if (lower.endsWith(".txt")) {
    const text = buffer.toString("utf8").trim().slice(0, MAX_TEXT_CHARS);
    if (text.length < 40) throw new Error(`EMPTY:${name}`);
    return { kind: "text", name, text };
  }
  throw new Error(`UNSUPPORTED:${name}`);
}

/** Tamaño total de contenido (para el fallback demo). */
export function totalContentLength(docs: PreparedDoc[]): number {
  return docs.reduce(
    (acc, d) => acc + (d.kind === "pdf" ? d.buffer.length : d.text.length),
    0,
  );
}
