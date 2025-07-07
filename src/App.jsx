// wallet adapter imports
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import {
    WalletModalProvider,
    WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import '@solana/wallet-adapter-react-ui/styles.css';

import { TokenLaunchpad } from './components/tokenLaunchpad';

function App() {

  return (
    <>
      <ConnectionProvider endpoint={"https://api.devnet.solana.com"}>
        <WalletProvider wallets={[]} autoConnect>
            <WalletModalProvider>
              <div>
                <TokenLaunchpad></TokenLaunchpad>
              </div>
            </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider> 
    </>
  )
}

export default App
