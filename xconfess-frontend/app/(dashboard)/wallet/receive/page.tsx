"use client";

import Link from "next/link";
import { Copy, QrCode, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { getEmbeddedWallet, type EncryptedWallet } from "@/app/lib/crypto/embeddedWallet";

export default function WalletReceivePage() {
  const [wallet, setWallet] = useState<EncryptedWallet | null>(null);
  const [notice, setNotice] = useState("");
  const networkLabel = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet" ? "Mainnet" : "Testnet";

  useEffect(() => setWallet(getEmbeddedWallet()), []);

  const shareAddress = async () => {
    if (!wallet) return;
    if (navigator.share) { await navigator.share({ title: "XConfess wallet address", text: wallet.publicKey }); setNotice("Address shared."); return; }
    await copyAddress();
    setNotice("Sharing is unavailable; address copied instead.");
  };

  const copyAddress = async () => {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.publicKey);
    setNotice("Address copied.");
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="luxury-panel rounded-[var(--radius-panel)] p-6 text-center sm:p-10">
        <Link href="/wallet" className="block text-left text-sm text-[var(--secondary)] hover:text-[var(--foreground)]">
          ← Wallet overview
        </Link>
        <QrCode className="mx-auto mt-8 h-8 w-8 text-[var(--brand-violet)]" aria-hidden="true" />
        <p className="eyebrow mt-5">Receive XLM on {networkLabel}</p>
        {wallet ? (
          <>
            <QRCodeCanvas value={wallet.publicKey} size={208} aria-label="QR code for wallet address" className="mx-auto mt-6" />
            <p className="mx-auto mt-6 max-w-xl break-all font-mono text-sm text-[var(--foreground)]">{wallet.publicKey}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3"><Button variant="outline" onClick={copyAddress}><Copy className="mr-2 h-4 w-4" /> Copy address</Button><Button variant="outline" onClick={shareAddress}><Share2 className="mr-2 h-4 w-4" /> Share address</Button></div>
          </>
        ) : (
          <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-[var(--secondary)]">
            Create or import your XConfess Wallet first, then return here to receive XLM.
          </p>
        )}
        {notice && <p className="mt-4 text-sm text-[var(--success)]" role="status">{notice}</p>}
      </section>
    </main>
  );
}
