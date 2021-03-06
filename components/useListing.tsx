import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { grabStrangemood } from './strangemood';
import { getListingMetadata, postListingMetadata } from '../lib/graphql';
import { useEffect, useState } from 'react';
import { Listing, setListingUri } from '@strangemood/strangemood';
import { BLANK_METADATA, StrangemoodMetadata } from '../lib/metadata';
import create, { SetState } from 'zustand';
import { useListingModifications } from './stores/useCreateListingStore';
import { merge, omit } from 'lodash';

interface ListingsStore {
  put: (key: string, value: ListingData) => void;
  listings: { [key: string]: ListingData };
}

const useListingStore = create<ListingsStore>((set) => ({
  put: (key, value) => {
    set((s) => {
      s.listings = { ...s.listings, [key]: value };
      return { ...s };
    });
  },
  listings: {},
}));

interface ListingData {
  account: Listing;
  metadata: StrangemoodMetadata;
  publicKey: string;
}

export function useListing(publicKey: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const store = useListingStore();

  async function fetchListing() {
    const program = await grabStrangemood(connection, wallet);
    const listing = await program.account.listing.fetch(
      new PublicKey(publicKey)
    );

    const metadata = await getListingMetadata(listing.uri);

    return {
      account: listing,
      metadata: metadata,
      publicKey: publicKey,
    } as ListingData;
  }

  useEffect(() => {
    fetchListing()
      .then((listing) => {
        store.put(publicKey, listing);
      })
      .catch(console.error);
  }, [publicKey]);

  return { listing: store.listings[publicKey], refetch: fetchListing };
}

function useDebounce(value: any, delay: number) {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(
    () => {
      // Update debounced value after delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);
      // Cancel the timeout if value changes (also on delay change or unmount)
      // This is how we prevent debounced value from updating if value is changed ...
      // .. within the delay period. Timeout gets cleared and restarted.
      return () => {
        clearTimeout(handler);
      };
    },
    [value, delay] // Only re-call effect if value or delay changes
  );
  return debouncedValue;
}

function deepClone(object: any) {
  return JSON.parse(JSON.stringify(object));
}

export function useUpdateListing(publicKey: string) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const store = useListingModifications();
  const { listing } = useListing(publicKey);
  const [cid, setCID] = useState<string>();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDiff, setIsDiff] = useState<boolean>(false);

  const debouncedStoreModifications = useDebounce(store.modifications, 100);

  // If the listing updates (either from load or from refetch)
  // load the changes into the input fields, without removing
  // the user's changes
  useEffect(() => {
    if (!listing || !listing.metadata) return;
    store.change((data) => {
      const final = merge(
        { ...deepClone(listing.metadata) },
        { ...deepClone(data) }
      );
      return final;
    });
  }, [listing]);

  // This ensures that the buttons are grayed out when the user starts
  // typing / modifying, and not when the debounce has hit.
  //
  // If you're unsure what that means, try commenting this hook out
  // and seeing for yourself!
  useEffect(() => {
    if (!listing) return;
    let metadata = omit(store.modifications, 'onChainAccountData');
    const final = merge(
      { ...deepClone(listing.metadata) },
      { ...deepClone(metadata) }
    ); // merge mutates, hence the ... and deepClone

    if (JSON.stringify(final) !== JSON.stringify(listing.metadata)) {
      setIsDiff(true);
      setIsLoading(true);
    } else {
      setIsDiff(false);
    }
  }, [store.modifications]);

  useEffect(() => {
    async function load() {
      if (!listing) return;
      let metadata = omit(debouncedStoreModifications, 'onChainAccountData');
      const { key } = await postListingMetadata({
        ...listing.metadata,
        ...metadata,
      });
      if (
        key.replace('ipfs://', '') ===
        listing.account.uri.replace('ipfs://', '')
      ) {
        setIsLoading(false);
        return;
      }

      setCID(key);
      setIsLoading(false);
    }
    load().catch(console.error);
  }, [debouncedStoreModifications]);

  async function publish() {
    console.log('Publish');
    if (!connection || !wallet || !listing) return;
    const program = await grabStrangemood(connection, wallet);

    let metadata = omit(store.modifications, 'onChainAccountData');
    const { key } = await postListingMetadata({
      ...BLANK_METADATA,
      ...metadata,
    });

    const { instructions } = await setListingUri({
      program,
      listing: new PublicKey(listing.publicKey),
      signer: program.provider.wallet.publicKey,
      uri: 'ipfs://' + key,
    });

    let tx = new Transaction();
    tx.add(...instructions);
    await program.provider.send(tx);
    console.log('did it');
  }

  return {
    publish,
    change: store.change,
    draft: store.modifications,
    isLoading,
    isDiff,
    cid,
    listing,
  };
}
