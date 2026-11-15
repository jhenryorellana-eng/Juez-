/**
 * The premium job ($50): download the documents, generate the report and its
 * PDF, store the result the client polls (GET /api/pro/run), and delete the
 * documents once the report exists. Started by POST /api/pro/run in after().
 *
 * Its own module, with every I/O behind `ProJobDeps`, so what the job stores on
 * success and on failure can be tested without Gemini or Blob.
 */
import { safeBlobErrorMessage, storageDelete, storagePut } from "./storage";
import { safeErrorMessage } from "./safe-error";
import { buildInformeFromFiles, type FileRef } from "./informe-pipeline";
import type { ClienteInfo, Informe, ProJob, ProResult } from "./types";

/** `maxDuration` of /api/pro/run, in ms (a test keeps the two equal). The clock starts when the REQUEST arrives. */
export const PRO_MAX_DURATION_MS = 300_000;

/**
 * What the job still does once the report is generated, held back from the
 * generation's deadline: render the PDF, store it, store the result and delete
 * the documents (a few seconds each, at worst). A generation that runs into it
 * would leave the job to be killed with no result written — and a killed job is
 * a client who paid, left on «processing». The slack it leaves also covers a
 * platform clock that started before requestStartedAt (a cold start; see
 * PLATFORM_START_ALLOWANCE_MS in lib/xlegal-job.ts).
 */
export const PRO_CLOSEOUT_RESERVE_MS = 30_000;

/** What the job talks to — injectable for tests. */
export interface ProJobDeps {
  /** Downloads the documents, generates the report and renders its PDF, within `deadline` (epoch ms). */
  build(
    files: FileRef[],
    cliente: ClienteInfo,
    options: { deadline: number },
  ): Promise<{ informe: Informe; pdf: Buffer }>;
  put(pathname: string, data: Buffer | string, contentType: string): Promise<string>;
  /** Deletes the client's documents; never throws (storageDelete swallows its errors). */
  deleteFiles(urls: string[]): Promise<void>;
}

export const defaultProJobDeps: ProJobDeps = {
  build: (files, cliente, { deadline }) => buildInformeFromFiles(files, cliente, { deadline }),
  put: storagePut,
  deleteFiles: storageDelete,
};

export const proResultPath = (jobId: string) => `pro/results/${jobId}.json`;
export const proInformePath = (jobId: string) => `pro/informes/informe-${jobId}.pdf`;

/** The client's message when the job fails: it may retry from the same page (POST restarts an error). */
export const PRO_JOB_ERROR_MESSAGE =
  "No pudimos completar tu informe. Tu pago está registrado: vuelve a intentarlo desde esta misma página o contáctanos.";

/**
 * Descarga los documentos, genera el informe + PDF y guarda el resultado.
 * `requestStartedAt` is when POST /api/pro/run began: the platform ends the
 * function PRO_MAX_DURATION_MS after it, after() included.
 */
export async function processProJob(
  jobId: string,
  job: ProJob,
  requestStartedAt: number,
  deps: ProJobDeps = defaultProJobDeps,
): Promise<void> {
  const deadline = requestStartedAt + PRO_MAX_DURATION_MS - PRO_CLOSEOUT_RESERVE_MS;
  let result: ProResult;
  try {
    const { informe, pdf } = await deps.build(job.files, job.cliente, { deadline });
    const pdfUrl = await deps.put(proInformePath(jobId), pdf, "application/pdf");

    result = { status: "done", informe, pdfUrl, cliente: job.cliente };
  } catch (error) {
    // DOWNLOAD_FAILED:/UNSUPPORTED:/TOO_LARGE: carry the document's name: only the code.
    console.error("[pro:job] error:", safeErrorMessage(error));
    result = { status: "error", error: PRO_JOB_ERROR_MESSAGE };
  }

  try {
    await deps.put(proResultPath(jobId), JSON.stringify(result), "application/json");
  } catch (error) {
    console.error("[pro:job] no se pudo guardar el resultado:", safeBlobErrorMessage(error));
  }

  // Privacidad: los documentos del cliente se eliminan al terminar.
  if (result.status === "done") {
    await deps.deleteFiles(job.files.map((f) => f.url)).catch(() => {});
  }
}
