import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  getMintLen,
  createInitializeMetadataPointerInstruction,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  LENGTH_SIZE,
  ExtensionType,
} from "@solana/spl-token";
import { useState } from "react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";

export function TokenLaunchpad() {
  const wallet = useWallet();
  const { connection } = useConnection();

  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenImage, setTokenImage] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(9);
  const [tokenSupply, setTokenSupply] = useState(100);
  const [tokenAddress, setTokenAddress] = useState("");

  async function createToken() {
    if (!wallet.publicKey) return alert("Connect your wallet first.");
    
    const mintKeypair = Keypair.generate();
    
    const metadata = {
      mint: mintKeypair.publicKey,
      name: tokenName,
      symbol: tokenSymbol,
      uri: "https://cdn.100xdevs.com/metadata.json",
      additionalMetadata: [],
    };
    
    const decimals = tokenDecimals;
    const amount = parseFloat(tokenSupply) * Math.pow(10, decimals);
    
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

    const lamports = await connection.getMinimumBalanceForRentExemption(
      mintLen + metadataLen
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeMetadataPointerInstruction(
        mintKeypair.publicKey,
        wallet.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        tokenDecimals,
        wallet.publicKey,
        null,
        TOKEN_2022_PROGRAM_ID
      ),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        mint: mintKeypair.publicKey,
        metadata: mintKeypair.publicKey,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
        mintAuthority: wallet.publicKey,
        updateAuthority: wallet.publicKey,
      })
    );

    const associatedToken = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    console.log(associatedToken.toBase58());

    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        associatedToken,
        wallet.publicKey,
        mintKeypair.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );

    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedToken,
        wallet.publicKey,
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );

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
      {/* <input className="border-2" placeholder="image url" onChange={(e) => setTokenImage(e.target.value)}></input> */}
      <input className="border-2" placeholder="supply" onChange={(e) => setTokenSupply(e.target.value)}></input>
      <button className="border-2 bg-amber-300 cursor-pointer px-3" onClick={createToken}>Create Token</button>
      {tokenAddress}
    </>
  );
}