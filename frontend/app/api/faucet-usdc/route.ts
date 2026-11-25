import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

function loadFaucetKeypair(): Keypair | null {
  const raw = process.env.FAUCET_AUTHORITY_SECRET_KEY?.trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    }
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const faucetKp = loadFaucetKeypair();
  if (!faucetKp) {
    return NextResponse.json(
      {
        needsConfig: true,
        error:
          "FAUCET_AUTHORITY_SECRET_KEY is not set in frontend/.env.local. If you are the mint authority wallet, the frontend will sign directly.",
      },
      { status: 200 }
    );
  }

  let body: {
    owner?: string;
    usdcMint?: string;
    amountUsdc?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.owner || !body.usdcMint) {
    return NextResponse.json(
      { error: "Missing owner or usdcMint" },
      { status: 400 }
    );
  }

  try {
    const rpcUrl =
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const conn = new Connection(rpcUrl, "confirmed");

    const ownerPk = new PublicKey(body.owner);
    const usdcMintPk = new PublicKey(body.usdcMint);
    const amount = BigInt(body.amountUsdc ?? 10_000_000); // 10 Test USDC default

    const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMintPk, ownerPk);
    const tx = new Transaction();

    // 1. Idempotently create user's Test USDC ATA (paid by ownerPk)
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        ownerPk,
        ownerUsdcAta,
        ownerPk,
        usdcMintPk
      )
    );

    // 2. Mint Test USDC directly into user's wallet ATA
    tx.add(
      createMintToInstruction(
        usdcMintPk,
        ownerUsdcAta,
        faucetKp.publicKey,
        amount
      )
    );

    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = ownerPk;
    tx.partialSign(faucetKp);

    const serialized = tx
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    return NextResponse.json({ txBase64: serialized });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to build faucet tx",
      },
      { status: 500 }
    );
  }
}
