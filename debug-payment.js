require("dotenv").config();

const { createWalletClient, createPublicClient, http } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { xLayer } = require("viem/chains");
const { x402Client } = require("@okxweb3/x402-fetch");
const { registerExactEvmScheme } = require("@okxweb3/x402-evm/exact/client");

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

// Manual signer (instead of toClientEvmSigner)
const signer = {
  address: wallet.account.address,

  signTypedData: (args) => wallet.signTypedData(args),

  readContract: publicClient.readContract.bind(publicClient),

  signTransaction: (args) => wallet.signTransaction(args),

  getTransactionCount: (args) =>
    publicClient.getTransactionCount(args),

  estimateFeesPerGas: () =>
    publicClient.estimateFeesPerGas(),
};

console.log("Wallet account:", wallet.account.address);
console.log("Signer address:", signer.address);

const client = new x402Client();

registerExactEvmScheme(client, {
  signer,
  networks: ["eip155:196"],
});

console.log("✓ Signer registered successfully");

console.log("Registered networks:",
  [...client.registeredClientSchemes.get(2).keys()]
);
(async () => {
  const challenge = {
    x402Version: 2,
    resource: {
      url: "https://agent-escrow.vercel.app/api/x402-mcp",
      description:
        "Docket Arbiter — escrow funding and AI-verified settlement, pay-per-call",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:196",
        amount: "10000",
        asset: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
        payTo: "0x353ccab18da3636342e965ae08f43dbd9600fa9e",
        maxTimeoutSeconds: 300,
        extra: {
          name: "USD₮0",
          version: "1",
        },
      },
    ],
  };

  try {
    const payload = await client.createPaymentPayload(challenge);

    console.log("\n✅ PAYMENT PAYLOAD CREATED\n");
    console.dir(payload, { depth: null });
  } catch (err) {
    console.error("\n❌ FAILED\n");
    console.error(err);
    console.error(err.stack);
  }
})();
