/**
 * Shared premium-report pipeline: download the client documents, generate the
 * report with Gemini and render the branded PDF. Used by /api/pro/run (paid
 * flow) and /api/xlegal/run (x-legal embedded flow).
 */
import { prepareDoc } from "./docs";
import { generateInforme, type PreparedDoc } from "./gemini";
import { renderInformePdf } from "./informe-pdf";
import { storageRead } from "./storage";
import { MAX_FILE_BYTES } from "./analysis";
import type { ClienteInfo, Informe } from "./types";

export interface FileRef {
  url: string;
  name: string;
}

/** Downloads the documents, generates the Informe and renders its PDF. */
export async function buildInformeFromFiles(
  files: FileRef[],
  cliente: ClienteInfo,
): Promise<{ informe: Informe; pdf: Buffer }> {
  const docs: PreparedDoc[] = [];
  for (const ref of files) {
    const buffer = await storageRead(ref.url);
    if (!buffer) throw new Error(`DOWNLOAD_FAILED:${ref.name}`);
    if (buffer.length > MAX_FILE_BYTES) throw new Error(`TOO_LARGE:${ref.name}`);
    docs.push(await prepareDoc(ref.name, buffer));
  }

  const informe = await generateInforme(docs, cliente);
  const pdf = await renderInformePdf(cliente, informe, formatFechaEs(new Date()));
  return { informe, pdf };
}

export function formatFechaEs(d: Date): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
