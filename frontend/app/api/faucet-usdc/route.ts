import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import {
  createDelegateSessionIx,
  createInitAndDepositSessionIx,
} from "../../../lib/solana";
import { getMachinePda, getSessionPda } from "../../../lib/pda";
import { MACHINE_ID } from "../../../lib/constants";

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
      { status: 400 }
    );
  }

  let body: {
    owner?: string;
    sessionKey?: string;
    usdcMint?: string;
    amountUsdc?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.owner || !body.sessionKey || !body.usdcMint) {
    return NextResponse.json(
      { error: "Missing owner, sessionKey, or usdcMint" },
      { status: 400 }
    );
  }

  try {
    const rpcUrl =
      process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const conn = new Connection(rpcUrl, "confirmed");

    const ownerPk = new PublicKey(body.owner);
    const sessionKeyPk = new PublicKey(body.sessionKey);
    const usdcMintPk = new PublicKey(body.usdcMint);
    const amount = BigInt(body.amountUsdc ?? 10_000_000); // $10.00 default
    const [machinePda] = getMachinePda(MACHINE_ID);
    const [sessionPda] = getSessionPda(machinePda, ownerPk);

    const sessionInfo = await conn.getAccountInfo(sessionPda);
    const isAlreadyDelegated = Boolean(
      sessionInfo &&
        sessionInfo.owner.toBase58() ===
          (process.env.NEXT_PUBLIC_DELEGATION_PROGRAM_ID ||
            "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh")
    );

    if (isAlreadyDelegated) {
      return NextResponse.json(
        {
          error:
            "Session is already delegated on ER. Cashout first or play with your existing ER balance.",
        },
        { status: 409 }
      );
    }

    const ownerUsdcAta = getAssociatedTokenAddressSync(usdcMintPk, ownerPk);
    const tx = new Transaction();

    // 1. Idempotently create user's Test USDC ATA
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        faucetKp.publicKey,
        ownerUsdcAta,
        ownerPk,
        usdcMintPk
      )
    );

    // 2. Mint Test USDC into user's ATA
    tx.add(
      createMintToInstruction(
        usdcMintPk,
        ownerUsdcAta,
        faucetKp.publicKey,
        amount
      )
    );

    // 3. Fund ephemeral session key with 0.005 SOL if low
    const skBal = await conn.getBalance(sessionKeyPk);
    if (skBal < 0.002 * LAMPORTS_PER_SOL) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: faucetKp.publicKey,
          toPubkey: sessionKeyPk,
          lamports: 0.005 * LAMPORTS_PER_SOL,
        })
      );
    }

    // 4. Deposit minted USDC into PlayerSession & delegate to MagicBlock ER in the SAME txn
    tx.add(
      createInitAndDepositSessionIx(
        ownerPk,
        machinePda,
        usdcMintPk,
        amount,
        sessionKeyPk,
        BigInt(86400)
      )
    );
    tx.add(createDelegateSessionIx(ownerPk, machinePda));

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
      { error: err instanceof Error ? err.message : "Failed to build faucet tx" },
      { status: 500 }
    );
  }
}
