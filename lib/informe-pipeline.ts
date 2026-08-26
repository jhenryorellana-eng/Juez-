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
import type { ClienteInfo, Informe, InformeVariant } from "./types";

export interface FileRef {
  url: string;
  name: string;
}

/**
 * Downloads the documents, generates the Informe and renders its PDF.
 * The variant defaults to "pro" so every existing caller keeps its behaviour:
 * only /api/xlegal/run asks for the report without the commercial blocks.
 */
export async function buildInformeFromFiles(
  files: FileRef[],
  cliente: ClienteInfo,
  { variant = "pro" }: { variant?: InformeVariant } = {},
): Promise<{ informe: Informe; pdf: Buffer }> {
  // Concurrent on purpose: downloading up to 10 documents one after another was
  // pure dead time, and with a large case file it ate into the job budget before
  // the model had even seen a page.
  const docs: PreparedDoc[] = await Promise.all(
    files.map(async (ref) => {
      const buffer = await storageRead(ref.url);
      if (!buffer) throw new Error(`DOWNLOAD_FAILED:${ref.name}`);
      if (buffer.length > MAX_FILE_BYTES) throw new Error(`TOO_LARGE:${ref.name}`);
      return prepareDoc(ref.name, buffer);
    }),
  );

  const informe = await generateInforme(docs, cliente, variant);
  const pdf = await renderInformePdf(
    cliente,
    informe,
    formatFechaEs(new Date()),
    variant,
  );
  return { informe, pdf };
}

export function formatFechaEs(d: Date): string {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}
