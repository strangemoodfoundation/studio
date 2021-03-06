import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import type { NextPage } from 'next';
import { useState } from 'react';
import {
  onChainAccountData,
  useListingModifications,
} from '../components/stores/useCreateListingStore';
import { MainLayout } from '../components/Layout';
import { asImage } from '../lib/asImage';
import { saveFile, saveJson } from '../lib/storage';
import { useNotifications } from '../components/Notifications';
import { grabStrangemood } from '../components/strangemood';
import { initListing } from '@strangemood/strangemood';
import { BN } from '@project-serum/anchor';
import * as splToken from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useRouter } from 'next/router';
import { FormElement } from '../components/FormElement';
import { postListingMetadata } from '../lib/graphql';
import Link from 'next/link';
import omit from 'lodash/omit';
import { BLANK_METADATA, ImageNodeMetadata } from '../lib/metadata';

const Home: NextPage = () => {
  const [uploadingImage, setUploadingImage] = useState(false);
  const notify = useNotifications();
  const store = useListingModifications();

  async function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const file = e.target.files[0];
    if (!file || !file.name) return;

    setUploadingImage(true);
    const cid = await saveFile(file);
    const img = await asImage(file);

    store.change((data) => {
      let primaryImage = {
        alt: data.primaryImage?.alt || '',
        src: {
          uri: 'https://ipfs.io/ipfs/' + cid,
          contentType: file.type,
        },
        width: img.width,
        height: img.height,
      };
      return {
        primaryImage,
      };
    });

    setUploadingImage(false);

    // notify('success', 'Image uploaded!');
  }

  const [isPublishing, setIsPublishing] = useState(false);
  const wallet = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  async function onPublish() {
    if (!store.modifications.primaryImage) {
      notify('error', 'Please select an image');
      return;
    }
    // notify('info', 'Uploading...');
    setIsPublishing(true);

    // upload metadata to IPFS
    let metadata = omit(store.modifications, 'onChainAccountData');
    const { key } = await postListingMetadata({
      ...BLANK_METADATA,
      ...metadata,
    });

    // notify('info', 'Created metadata...');

    // Create a new listing
    const program = await grabStrangemood(connection, wallet);
    const inx = await initListing({
      program,
      signer: program.provider.wallet.publicKey,
      uri: 'ipfs://' + key,
      price: new BN(store.modifications.onChainAccountData.price * 1000000000),
      currency: new PublicKey(
        store.modifications.onChainAccountData.currencyPublicKey
      ),
      cashierSplit: store.modifications.onChainAccountData.bounty,
      isAvailable: true,
      isConsumable: false,
      isRefundable: false,
      // Testnet charter, TODO fix this to use the correct charter
      charter: new PublicKey('8iKjJx3hUNB2mtzMXnoghYiGy73GZXUW8vu8h1ASQDTR'),
    });
    let tx = new Transaction();
    tx.add(...inx.instructions);
    await program.provider.send(tx, inx.signers);

    setIsPublishing(false);
    router.push('/listings/' + inx.listing.toBase58());
    // notify('info', inx.listing.toBase58());
  }

  return (
    <MainLayout>
      <div className="dark:bg-gray-900 bg-gray-50 flex flex-col w-full pb-12">
        <div className="px-4 pt-2 text-sm  ">
          <Link href="/">
            <a className="underline text-muted">{`<~`} go back</a>
          </Link>
        </div>
        <div className="flex flex-col flex-1 max-w-4xl pt-8  mx-auto w-full">
          <h1 className="mb-1 font-bold text-lg dark:text-gray-200 pt-2 px-4">
            Create a new game for sale
          </h1>
          <p className="px-4 mb-4 text-muted"></p>
          <div className="w-full flex lg:border-l lg:border-r border-t border-b flex-col w-full  bg-background">
            <div className="px-4 py-8 border-b bg-gray-100 dark:bg-black">
              <h2 className=" font-bold text-lg ">Basics</h2>
            </div>
            <FormElement label="title" required className="">
              <input
                className="px-4 py-2 flex w-full bg-foreground "
                placeholder="ex: 'Form Field Simulator 2'"
                autoFocus={true}
                value={store.modifications.name}
                onChange={(e) => store.change(() => ({ name: e.target.value }))}
                disabled={isPublishing}
              />
            </FormElement>
            <FormElement label="description" className="">
              <textarea
                className="px-4 py-2 flex w-full bg-foreground border-0"
                placeholder="A short paragraph that appears on stores"
                autoFocus={true}
                value={store.modifications.description}
                onChange={(e) =>
                  store.change(() => ({ description: e.target.value }))
                }
                disabled={isPublishing}
              />
            </FormElement>

            <div className="flex">
              <FormElement
                label="primary image"
                hint="A cover image or thumbnail that appears in stores, social media embeds, and so on."
              >
                <div className="p-4 bg-foreground flex justify-between">
                  <input
                    type={'file'}
                    accept={'image/png, image/gif, image/jpeg'}
                    onChange={(e) => onSelectImage(e).catch(console.error)}
                    disabled={uploadingImage || isPublishing}
                  />

                  {uploadingImage && (
                    <div className="text-muted animate-pulse">Uploading...</div>
                  )}
                </div>
              </FormElement>
              <FormElement
                label="alt text"
                className="bg-white dark:bg-gray-900"
                hint="The screen-reader accessible text for the primary image."
              >
                <input
                  className="px-4 py-2 flex-1  flex w-full bg-foreground"
                  placeholder={`ex: "A cast of interesting characters"`}
                  autoFocus={true}
                  disabled={isPublishing}
                  value={store.modifications.primaryImage?.alt}
                  onChange={(e) =>
                    store.change((s) => {
                      let primaryImage: ImageNodeMetadata = {
                        height: s.primaryImage?.height || 0,
                        width: s.primaryImage?.width || 0,
                        src: s.primaryImage?.src || {
                          uri: '',
                          contentType: '',
                        },
                        alt: e.target.value,
                      };
                      return { primaryImage };
                    })
                  }
                />
              </FormElement>
            </div>

            <div className="px-4 py-8 border-b border-t bg-gray-100 dark:bg-black">
              <h2 className=" font-bold text-lg ">Pricing</h2>
            </div>
            <div className="flex">
              <FormElement
                className="flex-1"
                label="price"
                hint="You can change this later if you'd like."
              >
                <input
                  className="px-4 py-2 flex w-full bg-foreground h-10"
                  placeholder={`10.00`}
                  type="number"
                  value={store.modifications.onChainAccountData.price}
                  onChange={(e) =>
                    store.change((s) => {
                      let onChainAccountData: onChainAccountData = {
                        price: parseFloat(e.target.value),
                        bounty: s.onChainAccountData?.bounty,
                        currencyPublicKey:
                          s.onChainAccountData?.currencyPublicKey,
                      };
                      return {
                        onChainAccountData,
                      };
                    })
                  }
                  autoFocus={true}
                  disabled={isPublishing}
                />
              </FormElement>
              <FormElement label="Unit" hint="Currency">
                <select
                  id="currency"
                  className="flex h-full p-2 w-full h-10 border-l  dark:bg-gray-900"
                >
                  <option className="w-full" value={'SOL'}>
                    SOL
                  </option>
                </select>
              </FormElement>
            </div>

            <div className="flex">
              <FormElement
                className="flex-1 "
                label="% of sale shared with a marketplace"
                hint="The amount of each sale that goes to a marketplace that begins the sale. Setting a higher number may make you appear in more stores, and potentially earn more sales."
              >
                <div className="px-4 py-2 flex items-center">
                  <div className="font-mono text-sm w-20">
                    {(
                      store.modifications.onChainAccountData.bounty * 100
                    ).toFixed(1)}{' '}
                    %
                  </div>

                  <input
                    className="ml-4 inline-flex w-full bg-foreground transition-all"
                    placeholder={`ex: "${store.modifications.name || 'title'}"`}
                    autoFocus={true}
                    type="range"
                    min="0"
                    max="100"
                    value={store.modifications.onChainAccountData.bounty * 100}
                    disabled={isPublishing}
                    onChange={(e) => {
                      store.change((s) => {
                        let onChainAccountData: onChainAccountData = {
                          price: s.onChainAccountData?.price || 0.0,
                          bounty: parseFloat(e.target.value) / 100,
                          currencyPublicKey:
                            s.onChainAccountData.currencyPublicKey,
                        };
                        return {
                          onChainAccountData,
                        };
                      });
                    }}
                  />
                </div>
              </FormElement>
            </div>
          </div>
          <div className="pr-4 pt-4 flex justify-end rounded items-center">
            <div className="w-full flex items-center">
              <div className="h-px flex-1 bg-black dark:bg-gray-500" />
              <div className="font-mono text-sm inline px-1">
                <div className="text-green-600 inline">$0.30</div> network fee
                to publish
              </div>
              <div className="h-px w-full bg-black dark:bg-gray-500 w-4" />
              <button
                className="btn secondary p-base disabled:opacity-20"
                disabled={
                  !store.modifications.name ||
                  !store.modifications.primaryImage ||
                  uploadingImage ||
                  isPublishing
                }
                onClick={() => {
                  onPublish().catch(console.error);
                }}
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Home;
