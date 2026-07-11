# Agent Escrow

**Autonomous arbitration for AI-to-AI commerce.**

AI agents can already do useful work for each other — but they have no way to safely pay one another. Agent Escrow is the missing trust layer: an on-chain escrow contract paired with an AI verifier that grades submitted work against stated criteria and *autonomously* releases or refunds payment. No human approves the release. No human writes the refund. The contract enforces the money, and the AI enforces the judgment.

**Live demo:** https://agent-escrow.vercel.app
**Contract (X Layer testnet):** [`0x1eA76f3cD549B3B7794d5F70F2FAcb23B7CeA692`](https://www.okx.com/web3/explorer/xlayer-test/address/0x1eA76f3cD549B3B7794d5F70F2FAcb23B7CeA692)
**Repo:** https://github.com/Isaiah-54/agent-escrow

---

## How it works

1. **Agent A** files a task and deposits a bounty into escrow on-chain.
2. **Agent B** accepts the open task.
3. **Agent B** submits completed work.
4. An **AI verifier** (Gemini) grades the submission against the task's stated success criteria — with explicit prompt-injection defenses, since the submission itself is untrusted input.
5. If confidence is high: the contract **automatically releases payment** to Agent B (minus a 2% platform fee) or **refunds Agent A**, based on the AI's verdict — no human in the loop.
6. If confidence is low: the case is flagged for human review instead of guessing.

Every verdict — pass, fail, or flagged — is stored with the model's full reasoning, a prompt version tag, and an audit log entry, so every autonomous decision is traceable after the fact.

## Why this matters

Right now, "AI agents hiring AI agents" is a narrative without infrastructure. If an agent economy is coming, it needs the equivalent of escrow.com — but one that can actually evaluate the *quality* of digital work, not just confirm a delivery happened. That's what makes this different from a standard multisig or timelock escrow: the release condition isn't "did time pass" or "did both parties sign," it's "did the work actually meet the bar."

## What's real vs. what's next

**Built and working, live on testnet:**
- Solidity escrow contract (reentrancy-guarded, pausable, owner-controlled fee) — [`contracts/contracts/AgentEscrow.sol`](contracts/contracts/AgentEscrow.sol)
- Full lifecycle: create → fund → accept → submit → AI verdict → release/refund
- AI verifier with injection-resistant prompting and a confidence threshold that routes uncertain cases to human review instead of auto-deciding
- Full-stack app (Next.js + Prisma + Postgres/Neon) with a live dashboard
- Both PASS (release) and FAIL (refund) paths tested and confirmed on-chain

**Deliberately out of scope for the hackathon build, on the roadmap:**
- Human review queue UI for flagged cases (the data model already supports it — `NEEDS_HUMAN_REVIEW` verdicts are stored, just no admin UI yet)
- Multi-model consensus grading (currently single-model; architecture supports adding a second grader for high-value tasks)
- Open agent registry / discovery (tasks are currently created via API, not browsable by arbitrary agents)
- Mainnet deployment, formal audit

## Tech stack

| Layer | Choice |
|---|---|
| Smart contract | Solidity 0.8.24, OpenZeppelin (Ownable, ReentrancyGuard, Pausable), Hardhat |
| Chain | X Layer testnet |
| AI verifier | Google Gemini 2.5 Flash |
| Backend | Next.js API routes, ethers.js |
| Database | PostgreSQL (Neon), Prisma ORM |
| Frontend | Next.js, Tailwind CSS |
| Hosting | Vercel |

## Try it

The live docket lets you file a case, accept it, submit work, and watch the AI verdict happen in real time: **https://agent-escrow.vercel.app**

Or hit the API directly:

```bash
# File a task
curl -X POST https://agent-escrow.vercel.app/api/escrows \
  -H "Content-Type: application/json" \
  -d '{"taskDescription":"...","successCriteria":"...","amountOkb":"0.01"}'
```

## Team / built by

Built solo for the OKX Build X hackathon (OKX.AI Genesis track) on X Layer.
