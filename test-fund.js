require("dotenv").config();

const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { xLayer } = require("viem/chains");

const { x402Client, wrapFetchWithPayment } = require("@okxweb3/x402-fetch");
const { registerExactEvmScheme } = require("@okxweb3/x402-evm/exact/client");
const { toClientEvmSigner } = require("@okxweb3/x402-evm");

const account = privateKeyToAccount(
  "0x" + process.env.PRIVATE_KEY.trim()
);

const wallet = createWalletClient({
  account,
  chain: xLayer,
  transport: http("https://rpc.xlayer.tech"),
});

const publicClient = createPublicClient({
  chain: xLayer,
  transport: http("https://rpc.xlayer.tech"),
});

const signer = toClientEvmSigner(wallet, publicClient);

const client = new x402Client();

registerExactEvmScheme(client, {
  signer,
});

const paidFetch = wrapFetchWithPayment(fetch, client);

(async () => {
  const res = await paidFetch("http://127.0.0.1:3000/api/x402-mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "fund_escrow_task",
        arguments: {
          taskDescription: "Return Hello World",
          successCriteria: "Output exactly Hello World",
          amountOkb: "0.0001"
        }
      }
    })
  });

  console.log("Status:", res.status);
  console.log(await res.text());
})();
