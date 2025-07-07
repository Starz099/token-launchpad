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
  const [tokenImage, setTokenImage] = useState(null); // File object
  const [tokenDecimals, setTokenDecimals] = useState(9);
  const [tokenSupply, setTokenSupply] = useState(100);
  const [tokenDescription, setTokenDescription] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Pinata configuration
  const PINATA_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJkZmE5YWY2Yy03NWQ4LTRmNzktYWQ0NS1iOTY1ZGNjYTJjM2UiLCJlbWFpbCI6Im1heWFua2pvZDAxNkBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiMDc1YWYyYmFhYTdkNGQ2MjQzNTciLCJzY29wZWRLZXlTZWNyZXQiOiI5N2M0OTYwMTJkZTAyYzA3MGNkZDI3ZjM2NzgwODU5MDNmYjhjZWRmMzI5ZWIxNjUyZTE1M2QzMGM5NzNhN2EzIiwiZXhwIjoxNzgzNDQ2NTgwfQ.Y-CB7VeSA2cr4NV90Tc1JsPlrY0T6oaNAbPDxO1ARic"; // Replace with your actual JWT token

  // Upload file to Pinata IPFS
  async function uploadToPinata(file) {
    const formData = new FormData();
    formData.append("file", file);

    // Optional: Add metadata for better organization
    const pinataMetadata = JSON.stringify({
      name: `${tokenName || "token"}-${file.name}`,
      keyvalues: {
        tokenName: tokenName,
        tokenSymbol: tokenSymbol,
      },
    });
    formData.append("pinataMetadata", pinataMetadata);

    const pinataOptions = JSON.stringify({
      cidVersion: 0,
    });
    formData.append("pinataOptions", pinataOptions);

    try {
      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      throw error;
    }
  }

  // Upload JSON metadata to Pinata
  async function uploadMetadataToPinata(imageUri) {
    const metadata = {
      name: tokenName,
      symbol: tokenSymbol,
      description: tokenDescription,
      image: imageUri,
      attributes: [],
      properties: {
        files: [
          {
            uri: imageUri,
            type: tokenImage.type,
          },
        ],
        category: "image",
      },
    };

    try {
      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${PINATA_JWT}`,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: `${tokenName}-metadata.json`,
              keyvalues: {
                tokenName: tokenName,
                tokenSymbol: tokenSymbol,
                type: "metadata",
              },
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
    } catch (error) {
      console.error("Error uploading metadata to Pinata:", error);
      throw error;
    }
  }

  async function createToken() {
    if (!wallet.publicKey) return alert("Connect your wallet first.");
    if (!tokenName || !tokenSymbol || !tokenImage) {
      return alert("Please fill in all required fields and select an image.");
    }

    setIsCreating(true);
    setIsUploading(true);

    try {
      // Upload image and metadata to Pinata
      console.log("Uploading image to Pinata IPFS...");
      const imageUri = await uploadToPinata(tokenImage);
      console.log("Image uploaded:", imageUri);

      console.log("Uploading metadata to Pinata IPFS...");
      const metadataUri = await uploadMetadataToPinata(imageUri);
      console.log("Metadata uploaded:", metadataUri);

      setIsUploading(false);
      console.log("Metadata uploaded successfully:", metadataUri);

      // Step 2: Create token with the metadata URI
      const mintKeypair = Keypair.generate();

      const metadata = {
        mint: mintKeypair.publicKey,
        name: tokenName,
        symbol: tokenSymbol,
        uri: metadataUri, // Use the uploaded metadata URI
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

      const signature = await wallet.sendTransaction(transaction, connection);
      console.log("✅ Token created & minted:", signature);
      alert(
        `Token created and minted! Token Address: ${mintKeypair.publicKey.toBase58()}`
      );
    } catch (err) {
      console.error("❌ Error creating token:", err);
      alert("Something went wrong during token creation: " + err.message);
    } finally {
      setIsCreating(false);
      setIsUploading(false);
    }
  }

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setTokenImage(file);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-center">SOLANA TOKEN LAUNCHPAD</h1>

      <div className="space-y-3">
        <input
          className="w-full p-2 border-2 border-gray-300 rounded"
          placeholder="Token Name"
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
        />

        <input
          className="w-full p-2 border-2 border-gray-300 rounded"
          placeholder="Token Symbol"
          value={tokenSymbol}
          onChange={(e) => setTokenSymbol(e.target.value)}
        />

        <textarea
          className="w-full p-2 border-2 border-gray-300 rounded"
          placeholder="Token Description"
          value={tokenDescription}
          onChange={(e) => setTokenDescription(e.target.value)}
          rows="3"
        />

        <input
          type="number"
          className="w-full p-2 border-2 border-gray-300 rounded"
          placeholder="Decimals"
          value={tokenDecimals}
          onChange={(e) => setTokenDecimals(Number(e.target.value))}
        />

        <input
          type="number"
          className="w-full p-2 border-2 border-gray-300 rounded"
          placeholder="Supply"
          value={tokenSupply}
          onChange={(e) => setTokenSupply(Number(e.target.value))}
        />

        <div>
          <label className="block text-sm font-medium mb-2">Token Image</label>
          <input
            type="file"
            accept="image/*"
            className="w-full p-2 border-2 border-gray-300 rounded"
            onChange={handleImageChange}
          />
        </div>
      </div>

      <button
        className={`w-full p-3 rounded font-medium ${
          isCreating
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-amber-300 hover:bg-amber-400 cursor-pointer"
        }`}
        onClick={createToken}
        disabled={isCreating}
      >
        {isUploading
          ? "Uploading Metadata..."
          : isCreating
          ? "Creating Token..."
          : "Create Token"}
      </button>

      {tokenAddress && (
        <div className="mt-4 p-3 bg-green-100 rounded">
          <p className="text-sm font-medium">Token Created!</p>
          <p className="text-xs break-all">{tokenAddress}</p>
        </div>
      )}
    </div>
  );
}