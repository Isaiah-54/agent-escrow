# Agent Escrow

**Autonomous arbitration for AI-to-AI commerce.**

AI agents can already do useful work for each other — but they have no way to safely pay one another. Agent Escrow is the missing trust layer: an on-chain escrow contract paired with a **multi-agent AI verification system** that grades submitted work, reaches consensus (or escalates to arbitration when it can't), and *autonomously* releases or refunds payment. No human approves the release. No human writes the refund.

**Live demo:** https://agent-escrow.vercel.app
**Contract (X Layer testnet):** [`0x1eA76f3cD549B3B7794d5F70F2FAcb23B7CeA692`](https://www.okx.com/web3/explorer/xlayer-test/address/0x1eA76f3cD549B3B7794d5F70F2FAcb23B7CeA692)
**Repo:** https://github.com/Isaiah-54/agent-escrow

---

## How it works

1. **Agent A** files a task and deposits a bounty into escrow on-chain.
2. **Agent B** accepts the open task and submits completed work.
3. **Two independent AI evaluators** grade the submission in parallel — Evaluator A reads in good faith; Evaluator B is deliberately adversarial, actively hunting for reasons the work falls short. Independence comes from genuinely different postures, not just re-sampling the same prompt.
4. **If both agree with high confidence:** the contract automatically releases payment (minus a 2% platform fee) or refunds the creator — no human in the loop.
5. **If they disagree, or confidence is low:** the case is marked `DISPUTED` and escalated to a third **Arbitrator** agent, who sees both evaluators' verdicts and reasoning and issues a final, binding ruling before anything settles on-chain.

Every evaluation — both agents' initial verdicts and any arbitration ruling — is stored with full reasoning, a prompt version tag, and an audit log entry, so every autonomous decision is traceable after the fact. Submissions are treated as untrusted input throughout, with explicit prompt-injection defenses in every evaluator prompt.

## Why this matters

Right now, "AI agents hiring AI agents" is a narrative without infrastructure. If an agent economy is coming, it needs the equivalent of escrow.com — but one that can actually evaluate the *quality* of digital work, and that doesn't collapse into a single point of failure when one model gets it wrong. Multi-agent consensus with arbitration is how you get autonomous decisions you can actually trust with real money.

## What's real vs. what's next

**Built and working, live on testnet:**
- Solidity escrow contract (reentrancy-guarded, pausable, owner-controlled fee) — [`contracts/contracts/AgentEscrow.sol`](contracts/contracts/AgentEscrow.sol)
- Full lifecycle: create → fund → accept → submit → dual-agent evaluation → consensus release/refund, or dispute → arbitration → settlement
- Two-evaluator consensus system with a genuinely adversarial second reader, not just a duplicate prompt
- Automatic dispute escalation to a third arbitrator agent when evaluators disagree or confidence is low
- Injection-resistant prompting across all three evaluator roles
- Full-stack app (Next.js + Prisma + Postgres/Neon) with a live "docket" dashboard showing every case, verdict stamp, and evaluation trail
- Both consensus PASS (release) and consensus FAIL (refund) paths tested and confirmed on-chain, plus dispute escalation tested end-to-end

**Deliberately out of scope for the hackathon build, on the roadmap:**
- Agent negotiation (price/scope back-and-forth before a task is accepted)
- Milestone-based partial payments
- Human-in-the-loop override UI for arbitrated cases
- Open agent registry / discovery beyond direct API integration
- Mainnet deployment, formal audit

## Tech stack

| Layer | Choice |
|---|---|
| Smart contract | Solidity 0.8.24, OpenZeppelin (Ownable, ReentrancyGuard, Pausable), Hardhat |
| Chain | X Layer testnet |
| AI verification | Google Gemini 2.5 Flash — 3 independent agent roles (Evaluator A, Evaluator B, Arbitrator) |
| Backend | Next.js API routes, ethers.js |
| Database | PostgreSQL (Neon), Prisma ORM |
| Frontend | Next.js, Tailwind CSS |
| Hosting | Vercel |

## Try it

The live docket lets you file a case, accept it, submit work, and watch two AI agents evaluate it in real time — including a live arbitration flow if they disagree: **https://agent-escrow.vercel.app**

## Team / built by

Built solo for the OKX Build X hackathon (OKX.AI Genesis track) on X Layer.
