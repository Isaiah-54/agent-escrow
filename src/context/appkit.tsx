"use client";

import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is not configured");
}

const xLayer = {
  id: 196,
  name: "X Layer",
  caipNetworkId: "eip155:196",
  chainNamespace: "eip155",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.xlayer.tech"],
    },
  },
  blockExplorers: {
    default: {
      name: "OKLink",
      url: "https://www.oklink.com/x-layer",
    },
  },
};

const metadata = {
  name: "Docket Arbiter",
  description: "AI-to-AI escrow and arbitration on X Layer",
  url: "https://agent-escrow.vercel.app",
  icons: ["https://agent-escrow.vercel.app/avatar.jpg"],
};

createAppKit({
  adapters: [new EthersAdapter()],
  networks: [xLayer],
  defaultNetwork: xLayer,
  projectId,
  metadata,
  features: {
    analytics: true,
  },
});

export function AppKitProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
