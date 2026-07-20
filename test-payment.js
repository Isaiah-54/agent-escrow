require("dotenv").config();

const { createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { xLayer } = require("viem/chains");

const { x402Client, wrapFetchWithPayment } = require("@okxweb3/x402-fetch");
const { registerExactEvmScheme } = require("@okxweb3/x402-evm/exact/client");
const { toClientEvmSigner } = require("@okxweb3/x402-evm");

const account = privateKeyToAccount(
  "0x" + process.env.PRIVATE_KEY.trim()
);

console.log("Wallet:", account.address);

const publicClient = createPublicClient({
  chain: xLayer,
  transport: http("https://rpc.xlayer.tech"),
});

const signer = toClientEvmSigner(account, publicClient);

console.log("Signer:");
console.dir(signer, { depth: 3 });

const client = new x402Client();

registerExactEvmScheme(client, {
  signer,
});

const paidFetch = wrapFetchWithPayment(fetch, client);

(async () => {
  try {
    console.log("Calling MCP endpoint...");

    const response = await paidFetch(
      "http://127.0.0.1:3000/api/x402-mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }
    );

    console.log("Status:", response.status);

    console.log("Headers:");
    console.log(Object.fromEntries(response.headers.entries()));

    const text = await response.text();

    console.log("Body:");
    console.log(text);
  } catch (e) {
    console.error("ERROR");
    console.error(e);
    console.error(e.stack);
  }
})();
