import { useWallet } from '@solana/wallet-adapter-react';
import type { NextPage } from 'next';
import { useState } from 'react';
import { useLocalStorage } from '../components/useLocalStorage';
import { Web3Storage, Filelike } from 'web3.storage';
import { useStrangemoodMetadataStore } from '../components/store';
import { Layout } from '../components/Layout';
import { asImage } from '../lib/asImage';
import { saveFile, saveJson } from '../lib/storage';
import { metadataToOpenMetaGraph } from '../lib/metadata';
import { useNotifications } from '../components/Notifications';
import cn from 'classnames';

function FormElement(props: {
  children: any;
  label: string;
  required?: boolean;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={'flex flex-col border-b ' + props.className}>
      <div className="text-sm flex bg-gray-50 dark:bg-gray-800 justify-between font-mono ">
        <div className="pl-4 py-1">{props.label}</div>

        {props.required && (
          <div className="bg-gray-100 dark:bg-gray-700 border-b items-center border-l px-4 py-0.5 text-xs inline-flex">
            required
          </div>
        )}
      </div>

      {props.hint && (
        <div className="bg-gray-50 dark:bg-gray-800 text-muted text-sm px-4 pb-2">
          {props.hint}
        </div>
      )}
      <div className="">{props.children}</div>
    </label>
  );
}

const Home: NextPage = () => {
  const [isLoading, setIsLoading] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const notify = useNotifications();
  const store = useStrangemoodMetadataStore();

  async function onSelectImage(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const file = e.target.files[0];
    if (!file || !file.name) return;

    setUploadingImage(true);
    const cid = await saveFile(file);
    const img = await asImage(file);

    store.set((data) => {
      let primaryImage = {
        ...(data.metadata.primaryImage || {}),
        src: 'https://ipfs.io/ipfs/' + cid,
        width: img.width,
        height: img.height,
        type: file.type,
      };
      return { ...data, metadata: { ...data.metadata, primaryImage } };
    });
    setUploadingImage(false);

    notify('success', 'Image uploaded!');
  }

  const [isPublishing, setIsPublishing] = useState(false);
  async function onPublish() {
    if (!store.metadata || !store.metadata.primaryImage) {
      notify('error', 'Please select an image');
      console.log(store.metadata);
      return;
    }
    notify('info', 'Uploading...');
    setIsPublishing(true);
    const doc = await metadataToOpenMetaGraph(store.metadata, saveJson);
    const cid = await saveJson(doc);
    setIsPublishing(false);
    notify('info', cid);
  }

  return (
    <Layout>
      <div className="dark:bg-gray-900 bg-gray-50 flex flex-col h-full  w-full">
        <div className="flex flex-col flex-1 max-w-4xl pt-12  mx-auto w-full">
          <h1 className="mb-1 font-bold text-lg dark:text-gray-200 pt-2 px-4">
            Create a new game for sale
          </h1>
          <p className="px-4 mb-4 text-muted">
            Last saved {new Date().toLocaleTimeString()}
          </p>
          <div className="w-full flex  lg:border-l lg:border-r border-t flex-col w-full  bg-background">
            <FormElement label="title" required className="">
              <input
                className="px-4 py-2 flex w-full bg-foreground"
                placeholder="ex: 'Form Field Simulator 2'"
                autoFocus={true}
                value={store.metadata.name}
                onChange={(e) => store.put('name', e.target.value)}
                disabled={isPublishing}
              />
            </FormElement>

            <FormElement label="description" className="">
              <textarea
                className="px-4 py-2 flex w-full bg-foreground border-0"
                placeholder="A short paragraph that appears on stores"
                autoFocus={true}
                value={store.metadata.description}
                onChange={(e) => store.put('description', e.target.value)}
                disabled={isPublishing}
              />
            </FormElement>

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
              label="primary image alt text"
              hint="The screen-reader accessible text for the primary image."
            >
              <input
                className="px-4 py-2 flex w-full bg-foreground"
                placeholder={`ex: "${store.metadata.name || 'title'}"`}
                autoFocus={true}
                disabled={isPublishing}
                value={store.metadata.primaryImage?.alt}
                onChange={(e) =>
                  store.set((data) => {
                    let primaryImage = {
                      ...(data.metadata.primaryImage || {}),
                      alt: e.target.value,
                    };
                    return {
                      ...data,
                      metadata: { ...data.metadata, primaryImage },
                    };
                  })
                }
              />
            </FormElement>
          </div>
          <div className="p-4 flex justify-end rounded items-center">
            <div className="w-full flex items-center">
              <div className="rounded-full h-2 w-2 bg-black dark:bg-gray-500" />

              <div className="h-px flex-1 bg-black dark:bg-gray-500" />
              <div className="font-mono text-sm inline">
                <div className="text-green-600 inline">$0.30</div> network fee
                to publish
              </div>
              <div className="h-px w-full bg-black dark:bg-gray-500 w-5" />
              <button
                className="btn secondary p-base disabled:opacity-20"
                disabled={
                  !store.metadata ||
                  !store.metadata.name ||
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
    </Layout>
  );
};

export default Home;
