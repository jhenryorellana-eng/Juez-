import Background from "@/components/Background";
import { Wordmark } from "@/components/Brand";
import XlegalFlow from "@/components/xlegal/XlegalFlow";
import { storageReadJson } from "@/lib/storage";
import {
  xlegalConfigured,
  isValidToken,
  hashToken,
  fetchXlegalSession,
} from "@/lib/xlegal";
import type { XlegalResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Embedded x-legal variant: no payment, no personal-data form. The session
 * token in ?t= is validated server-side against x-legal on every load; only
 * non-sensitive data is passed to the client (never the api key).
 */
export default async function XlegalPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const token = t ?? "";

  if (!xlegalConfigured() || !isValidToken(token)) {
    return (
      <Shell>
        <InvalidLink />
      </Shell>
    );
  }

  const { session } = await fetchXlegalSession(token);
  if (!session || session.status === "expired") {
    return (
      <Shell>
        <InvalidLink />
      </Shell>
    );
  }

  // Resume: if this token already started a job, hand its id to the client so
  // a reload keeps polling (or re-shows the finished report) without a new attempt.
  const tokenHash = hashToken(token);
  const mapping = await storageReadJson<{ jobId: string }>(
    `xlegal/tokens/${tokenHash}.json`,
  );
  let resumeJobId: string | undefined;
  if (mapping?.jobId) {
    const prior = await storageReadJson<XlegalResult>(
      `xlegal/results/${mapping.jobId}.json`,
    );
    if (prior?.status !== "error") resumeJobId = mapping.jobId;
  }

  const attemptsRemaining = Math.max(
    0,
    session.attemptsAllowed - session.attemptsUsed,
  );

  return (
    <Shell>
      <XlegalFlow
        token={token}
        nombre={session.cliente.nombre}
        attemptsRemaining={attemptsRemaining}
        downloadUrl={session.pdf.available ? session.pdf.downloadUrl : undefined}
        pdfAvailable={session.pdf.available}
        resumeJobId={resumeJobId}
      />
    </Shell>
  );
}

/** Iframe-safe shell: brand only, no navigation out of the embed. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <Background />
      <header className="relative z-10 mx-auto flex w-full max-w-xl items-center px-5 pb-2 pt-5 sm:px-6">
        <Wordmark />
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="flex flex-1 flex-col justify-center py-4">
      <div className="glass flex flex-col items-center p-8 text-center">
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
          Este enlace no es válido
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          El enlace de tu evaluación no es válido o ya venció. Vuelve a tu panel
          de x-legal y ábrelo de nuevo desde ahí.
        </p>
      </div>
    </div>
  );
}
