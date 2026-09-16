"use client";

import Link from "next/link";
import { Copy, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { getEmbeddedWallet, type EncryptedWallet } from "@/app/lib/crypto/embeddedWallet";

export default function WalletReceivePage() {
  const [wallet, setWallet] = useState<EncryptedWallet | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => setWallet(getEmbeddedWallet()), []);

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
        <p className="eyebrow mt-5">Receive XLM on Testnet</p>
        {wallet ? (
          <>
            <QRCodeCanvas value={wallet.publicKey} size={208} aria-label="QR code for wallet address" className="mx-auto mt-6" />
            <p className="mx-auto mt-6 max-w-xl break-all font-mono text-sm text-[var(--foreground)]">{wallet.publicKey}</p>
            <Button className="mt-6" variant="outline" onClick={copyAddress}>
              <Copy className="mr-2 h-4 w-4" /> Copy address
            </Button>
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
