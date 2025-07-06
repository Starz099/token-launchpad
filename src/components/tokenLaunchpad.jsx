import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createAssociatedTokenAccountInstruction, createInitializeMint2Instruction, createMintToInstruction, getAssociatedTokenAddress, getMinimumBalanceForRentExemptMint, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useState } from "react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";

export function TokenLaunchpad() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenImage, setTokenImage] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(9);
  const [tokenSupply, setTokenSupply] = useState(0);
  const [tokenAddress, setTokenAddress] = useState("");

  async function createToken() {
    if (!wallet.publicKey) return alert("Connect your wallet first.");
    
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const mintKeypair = Keypair.generate();
    const decimals = tokenDecimals;
    const amount = parseFloat(tokenSupply) * Math.pow(10, decimals);

    const userATA = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey);

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID
      }),
      createInitializeMint2Instruction(mintKeypair.publicKey, decimals, wallet.publicKey, wallet.publicKey, TOKEN_PROGRAM_ID),
      createAssociatedTokenAccountInstruction(
        wallet.publicKey, // payer
        userATA, // associated token account
        wallet.publicKey, // owner of the token account
        mintKeypair.publicKey //mint
      ),
      createMintToInstruction(
        mintKeypair.publicKey,
        userATA,
        wallet.publicKey,
        amount
      )
    )

    const recentBlockHash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = recentBlockHash.blockhash;
    transaction.feePayer = wallet.publicKey;
    
    transaction.partialSign(mintKeypair);
    setTokenAddress(mintKeypair.publicKey.toBase58());
    try {
      const signature = await wallet.sendTransaction(transaction, connection);
      console.log("✅ Token created & minted:", signature);
      alert("Token created and minted! Check Devnet explorer.",tokenAddress);
    } catch (err) {
      console.error("❌ Error minting token:", err);
      alert("Something went wrong during token creation.");
    }
  }

  return (
    <>
      <h1>SOLANA TOKEN LAUNCHPAD</h1>
      <input className="border-2" placeholder="name" onChange={(e) => setTokenName(e.target.value)}></input>
      <input className="border-2" placeholder="symbol" onChange={(e) => setTokenSymbol(e.target.value)}></input>
      <input className="border-2" placeholder="decimals" onChange={(e) => setTokenDecimals(e.target.value)}></input>
      <input className="border-2" placeholder="image url" onChange={(e) => setTokenImage(e.target.value)}></input>
      <input className="border-2" placeholder="supply" onChange={(e) => setTokenSupply(e.target.value)}></input>
      <button className="border-2 bg-amber-300 cursor-pointer px-3" onClick={createToken}>Create Token</button>
      {tokenAddress}
    </>
  );
}