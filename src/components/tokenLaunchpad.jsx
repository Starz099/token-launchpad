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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Coins, Loader2, CheckCircle, Copy } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function TokenLaunchpad() {
  const wallet = useWallet();
  const { connection } = useConnection();

  // Form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenImage, setTokenImage] = useState(null);
  const [tokenDecimals, setTokenDecimals] = useState(9);
  const [tokenSupply, setTokenSupply] = useState(100);
  const [tokenDescription, setTokenDescription] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");

  // UI state
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  // Pinata JWT - Replace with your actual token
  const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

  // Upload file to Pinata IPFS
  async function uploadToPinata(file) {
    const formData = new FormData();
    formData.append("file", file);

    // Add metadata for organization
    const pinataMetadata = JSON.stringify({
      name: `${tokenName || "token"}-${file.name}`,
      keyvalues: { tokenName, tokenSymbol },
    });
    formData.append("pinataMetadata", pinataMetadata);

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: formData,
      }
    );

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const result = await response.json();
    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
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
        files: [{ uri: imageUri, type: tokenImage.type }],
        category: "image",
      },
    };

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
            keyvalues: { tokenName, tokenSymbol, type: "metadata" },
          },
        }),
      }
    );

    if (!response.ok)
      throw new Error(`Metadata upload failed: ${response.status}`);

    const result = await response.json();
    return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`;
  }

  // Main token creation function
  async function createToken() {
    if (!wallet.publicKey) return alert("Connect your wallet first.");
    if (!tokenName || !tokenSymbol || !tokenImage) {
      return alert("Please fill in all required fields and select an image.");
    }

    setIsCreating(true);
    setIsUploading(true);

    try {
      // Step 1: Upload image to IPFS
      setUploadProgress("Uploading image...");
      const imageUri = await uploadToPinata(tokenImage);

      // Step 2: Upload metadata to IPFS
      setUploadProgress("Uploading metadata...");
      const metadataUri = await uploadMetadataToPinata(imageUri);

      setIsUploading(false);
      setUploadProgress("Creating token...");

      // Step 3: Create token mint
      const mintKeypair = Keypair.generate();
      const metadata = {
        mint: mintKeypair.publicKey,
        name: tokenName,
        symbol: tokenSymbol,
        uri: metadataUri,
        additionalMetadata: [],
      };

      // Calculate token supply with decimals
      const amount = parseFloat(tokenSupply) * Math.pow(10, tokenDecimals);

      // Calculate space needed for mint account
      const mintLen = getMintLen([ExtensionType.MetadataPointer]);
      const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
      const lamports = await connection.getMinimumBalanceForRentExemption(
        mintLen + metadataLen
      );

      // Build transaction
      const transaction = new Transaction().add(
        // Create mint account
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        // Initialize metadata pointer
        createInitializeMetadataPointerInstruction(
          mintKeypair.publicKey,
          wallet.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        // Initialize mint
        createInitializeMintInstruction(
          mintKeypair.publicKey,
          tokenDecimals,
          wallet.publicKey,
          null,
          TOKEN_2022_PROGRAM_ID
        ),
        // Initialize token metadata
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

      // Get associated token account
      const associatedToken = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Add instructions to create token account and mint tokens
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          associatedToken,
          wallet.publicKey,
          mintKeypair.publicKey,
          TOKEN_2022_PROGRAM_ID
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          associatedToken,
          wallet.publicKey,
          amount,
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      // Finalize and send transaction
      const recentBlockHash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = recentBlockHash.blockhash;
      transaction.feePayer = wallet.publicKey;
      transaction.partialSign(mintKeypair);

      const signature = await wallet.sendTransaction(transaction, connection);
      setTokenAddress(mintKeypair.publicKey.toBase58());

      console.log("✅ Token created:", signature);
    } catch (err) {
      console.error("❌ Error creating token:", err);
      alert("Error creating token: " + err.message);
    } finally {
      setIsCreating(false);
      setIsUploading(false);
      setUploadProgress("");
    }
  }

  // Handle image file selection
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) setTokenImage(file);
  };

  // Copy token address to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Coins className="w-8 h-8 text-purple-400" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Token Launchpad
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Create your own SPL token on Solana
          </p>
          <br/>
          <WalletMultiButton/>
        </div>

        {/* Main Card */}
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm shadow-2xl animate-slide-up">
          <CardHeader>
            <CardTitle className="text-white">Token Details</CardTitle>
            <CardDescription className="text-gray-400">
              Fill in your token information and upload an image
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Token Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-300">
                Token Name
              </Label>
              <Input
                id="name"
                placeholder="e.g., My Awesome Token"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 transition-all duration-200"
              />
            </div>

            {/* Token Symbol */}
            <div className="space-y-2">
              <Label htmlFor="symbol" className="text-gray-300">
                Token Symbol
              </Label>
              <Input
                id="symbol"
                placeholder="e.g., MAT"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 transition-all duration-200"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-gray-300">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Describe your token..."
                value={tokenDescription}
                onChange={(e) => setTokenDescription(e.target.value)}
                className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 transition-all duration-200 resize-none"
                rows={3}
              />
            </div>

            {/* Supply and Decimals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supply" className="text-gray-300">
                  Supply
                </Label>
                <Input
                  id="supply"
                  type="number"
                  placeholder="1000000"
                  value={tokenSupply}
                  onChange={(e) => setTokenSupply(Number(e.target.value))}
                  className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decimals" className="text-gray-300">
                  Decimals
                </Label>
                <Input
                  id="decimals"
                  type="number"
                  value={tokenDecimals}
                  onChange={(e) => setTokenDecimals(Number(e.target.value))}
                  className="bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:border-purple-400 transition-all duration-200"
                />
              </div>
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image" className="text-gray-300">
                Token Image
              </Label>
              <div className="relative">
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="bg-gray-700/50 border-gray-600 text-white file:bg-purple-600 file:text-white file:border-0 file:rounded-md file:px-3 file:py-2 file:mr-4 hover:file:bg-purple-700 transition-all duration-200"
                />
                <Upload className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Create Button */}
            <Button
              onClick={createToken}
              disabled={isCreating || !wallet.publicKey}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {uploadProgress || "Creating Token..."}
                </>
              ) : (
                <>
                  <Coins className="w-5 h-5 mr-2" />
                  Create Token
                </>
              )}
            </Button>

            {/* Success Message */}
            {tokenAddress && (
              <Alert className="bg-green-900/20 border-green-600 animate-fade-in">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-400">
                  <div className="flex items-center justify-between">
                    <span>Token created successfully!</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(tokenAddress)}
                      className="text-green-400 hover:text-green-300"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="mt-2 text-sm font-mono bg-gray-800 p-2 rounded break-all">
                    {tokenAddress}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.8s ease-out;
        }
      `}</style>
    </div>
  );
}
