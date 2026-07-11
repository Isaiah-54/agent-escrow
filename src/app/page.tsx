"use client";

import { useEffect, useState, useCallback } from "react";

type Evaluation = {
  verdict: "PASS" | "FAIL" | "NEEDS_HUMAN_REVIEW";
  confidence: number;
  reasoning: string;
  createdAt: string;
};

type Escrow = {
  id: string;
  taskDescription: string;
  successCriteria: string;
  amount: string;
  status: string;
  chainEscrowId: string | null;
  txHashCreate: string | null;
  txHashRelease: string | null;
  creator: { walletAddress: string };
  worker: { walletAddress: string } | null;
  evaluations: Evaluation[];
  createdAt: string;
};

const EXPLORER = "https://www.okx.com/web3/explorer/xlayer-test/tx/";

function formatOkb(wei: string) {
  return (Number(BigInt(wei)) / 1e18).toFixed(4);
}

function truncate(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function StampBadge({ status, evaluation }: { status: string; evaluation?: Evaluation }) {
  if (status === "RELEASED") {
    return (
      <div className="font-display font-black text-xl tracking-wide border-4 border-[var(--verdict-green)] text-[var(--verdict-green)] px-4 py-1 -rotate-3 select-none">
        PASS
      </div>
    );
  }
  if (status === "REFUNDED") {
    return (
      <div className="font-display font-black text-xl tracking-wide border-4 border-[var(--verdict-rust)] text-[var(--verdict-rust)] px-4 py-1 -rotate-3 select-none">
        FAIL
      </div>
    );
  }
  if (status === "UNDER_REVIEW") {
    return (
      <div className="font-display font-black text-lg tracking-wide border-4 border-[var(--seal-gold)] text-[var(--seal-gold)] px-3 py-1 -rotate-3 select-none">
        FLAGGED
      </div>
    );
  }
  return (
    <div className="font-mono text-xs uppercase tracking-widest text-[var(--parchment-dim)] border border-[var(--ink-line)] px-3 py-1 rounded-full">
      {status}
    </div>
  );
}

export default function Docket() {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ taskDescription: "", successCriteria: "", amountOkb: "0.01" });
  const [formError, setFormError] = useState<string | null>(null);

  const fetchEscrows = useCallback(async () => {
    try {
      const res = await fetch("/api/escrows");
      const data = await res.json();
      setEscrows(data);
    } catch {
      // silent — docket just stays stale, refresh button lets them retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  async function fileCase() {
    setFormError(null);
    if (!form.taskDescription || !form.successCriteria || !form.amountOkb) {
      setFormError("All fields are required to file a case.");
      return;
    }
    setBusy("create");
    try {
      const res = await fetch("/api/escrows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to file case");
      setForm({ taskDescription: "", successCriteria: "", amountOkb: "0.01" });
      setShowForm(false);
      await fetchEscrows();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function accept(id: string) {
    setBusy(id);
    await fetch(`/api/escrows/${id}/accept`, { method: "POST" });
    await fetchEscrows();
    setBusy(null);
  }

  async function submit(id: string) {
    const content = drafts[id];
    if (!content) return;
    setBusy(id);
    await fetch(`/api/escrows/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await fetchEscrows();
    setBusy(null);
  }

  async function evaluate(id: string) {
    setBusy(id);
    await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escrowId: id }),
    });
    await fetchEscrows();
    setBusy(null);
  }

  return (
    <main className="min-h-screen px-5 py-10 md:px-12 md:py-16 max-w-3xl mx-auto">
      <header className="mb-12 border-b border-[var(--ink-line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--seal-gold)] mb-3">
          Agent Escrow — Docket
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold leading-tight mb-4">
          Autonomous arbitration for<br />AI-to-AI commerce
        </h1>
        <p className="font-mono text-xs text-[var(--parchment-dim)] break-all">
          Contract 0x1eA76f3cD549B3B7794d5F70F2FAcb23B7CeA692 · X Layer testnet ·{" "}
          {escrows.length} {escrows.length === 1 ? "case" : "cases"} filed
        </p>

        <button
          onClick={() => setShowForm((s) => !s)}
          className="mt-6 font-mono text-sm uppercase tracking-wide bg-[var(--seal-gold)] text-[var(--ink)] px-5 py-2.5 rounded-sm hover:opacity-90 transition"
        >
          {showForm ? "Cancel" : "+ File New Case"}
        </button>

        {showForm && (
          <div className="mt-6 bg-[var(--ink-raised)] border border-[var(--ink-line)] rounded-sm p-5 space-y-3">
            <div>
              <label className="font-mono text-xs uppercase tracking-wide text-[var(--parchment-dim)] block mb-1">
                Task description
              </label>
              <textarea
                value={form.taskDescription}
                onChange={(e) => setForm({ ...form, taskDescription: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--ink-line)] rounded-sm px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-wide text-[var(--parchment-dim)] block mb-1">
                Success criteria
              </label>
              <textarea
                value={form.successCriteria}
                onChange={(e) => setForm({ ...form, successCriteria: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--ink-line)] rounded-sm px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase tracking-wide text-[var(--parchment-dim)] block mb-1">
                Bounty (OKB)
              </label>
              <input
                value={form.amountOkb}
                onChange={(e) => setForm({ ...form, amountOkb: e.target.value })}
                className="w-full bg-[var(--ink)] border border-[var(--ink-line)] rounded-sm px-3 py-2 text-sm font-mono"
              />
            </div>
            {formError && <p className="text-[var(--verdict-rust)] text-sm">{formError}</p>}
            <button
              onClick={fileCase}
              disabled={busy === "create"}
              className="font-mono text-sm uppercase tracking-wide bg-[var(--verdict-green)] text-[var(--parchment)] px-5 py-2.5 rounded-sm disabled:opacity-50"
            >
              {busy === "create" ? "Filing…" : "Deposit & File"}
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <p className="font-mono text-sm text-[var(--parchment-dim)]">Loading docket…</p>
      ) : escrows.length === 0 ? (
        <p className="font-mono text-sm text-[var(--parchment-dim)]">
          No cases filed yet. File the first one above.
        </p>
      ) : (
        <div className="space-y-6">
          {escrows.map((e) => {
            const latestEval = e.evaluations?.[e.evaluations.length - 1];
            return (
              <article
                key={e.id}
                className="bg-[var(--parchment)] text-[var(--ink)] rounded-sm p-5 md:p-6 shadow-lg"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <p className="font-mono text-xs uppercase tracking-widest text-[var(--ink)]/60">
                    Case #{e.chainEscrowId ?? "—"}
                  </p>
                  <StampBadge status={e.status} evaluation={latestEval} />
                </div>

                <p className="font-display text-lg font-semibold mb-2">{e.taskDescription}</p>
                <p className="text-sm text-[var(--ink)]/70 mb-3">
                  <span className="font-mono uppercase text-xs">Criteria: </span>
                  {e.successCriteria}
                </p>

                <div className="font-mono text-xs text-[var(--ink)]/60 mb-4 space-y-0.5">
                  <p>
                    filed by {truncate(e.creator.walletAddress)}
                    {e.worker && <> → accepted by {truncate(e.worker.walletAddress)}</>}
                  </p>
                  <p>{formatOkb(e.amount)} OKB bounty</p>
                  {e.txHashCreate && (
                    <p>
                      deposit tx:{" "}
                      <a
                        href={EXPLORER + e.txHashCreate}
                        target="_blank"
                        className="underline"
                      >
                        {truncate(e.txHashCreate)}
                      </a>
                    </p>
                  )}
                  {e.txHashRelease && (
                    <p>
                      settlement tx:{" "}
                      <a
                        href={EXPLORER + e.txHashRelease}
                        target="_blank"
                        className="underline"
                      >
                        {truncate(e.txHashRelease)}
                      </a>
                    </p>
                  )}
                </div>

                {latestEval && (
                  <div className="border-t border-[var(--ink)]/10 pt-3 mb-3 text-sm">
                    <p className="font-mono text-xs uppercase tracking-wide text-[var(--ink)]/50 mb-1">
                      AI verdict — {(latestEval.confidence * 100).toFixed(0)}% confidence
                    </p>
                    <p className="italic text-[var(--ink)]/80">{latestEval.reasoning}</p>
                  </div>
                )}

                {e.status === "FUNDED" && (
                  <button
                    onClick={() => accept(e.id)}
                    disabled={busy === e.id}
                    className="font-mono text-xs uppercase tracking-wide bg-[var(--ink)] text-[var(--parchment)] px-4 py-2 rounded-sm disabled:opacity-50"
                  >
                    {busy === e.id ? "Accepting…" : "Accept as Agent B"}
                  </button>
                )}

                {e.status === "ACCEPTED" && (
                  <div className="space-y-2">
                    <textarea
                      placeholder="Submitted work goes here…"
                      value={drafts[e.id] || ""}
                      onChange={(ev) => setDrafts({ ...drafts, [e.id]: ev.target.value })}
                      className="w-full border border-[var(--ink)]/20 rounded-sm px-3 py-2 text-sm bg-white"
                      rows={2}
                    />
                    <button
                      onClick={() => submit(e.id)}
                      disabled={busy === e.id || !drafts[e.id]}
                      className="font-mono text-xs uppercase tracking-wide bg-[var(--ink)] text-[var(--parchment)] px-4 py-2 rounded-sm disabled:opacity-50"
                    >
                      {busy === e.id ? "Submitting…" : "Submit Work"}
                    </button>
                  </div>
                )}

                {e.status === "SUBMITTED" && (
                  <button
                    onClick={() => evaluate(e.id)}
                    disabled={busy === e.id}
                    className="font-mono text-xs uppercase tracking-wide bg-[var(--seal-gold)] text-[var(--ink)] px-4 py-2 rounded-sm disabled:opacity-50"
                  >
                    {busy === e.id ? "Judging…" : "Request AI Verdict"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <button
        onClick={fetchEscrows}
        className="mt-10 font-mono text-xs uppercase tracking-wide text-[var(--parchment-dim)] underline"
      >
        Refresh docket
      </button>
    </main>
  );
}
