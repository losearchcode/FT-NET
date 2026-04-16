import {
    concatUint8Arrays,
    createChunkPrefixV2,
    deriveFileKeyV2,
    FILE_CRYPTO_V2_IV_LENGTH,
    FILE_CRYPTO_V2_MAGIC,
    isFileCryptoV2Available,
} from '../utils/fileCryptoV2';

type WorkerRequest =
    | { type: 'INIT'; key: string }
    | { type: 'PROCESS'; chunk: ArrayBuffer }
    | { type: 'FINALIZE' };

type WorkerScope = typeof globalThis & {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

let fileKeyPromise: Promise<CryptoKey> | null = null;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : 'Unknown error'
);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        if (event.data.type === 'INIT') {
            if (!isFileCryptoV2Available()) {
                throw new Error('Web Crypto API is unavailable');
            }

            fileKeyPromise = deriveFileKeyV2(event.data.key);
            const header = new Uint8Array(FILE_CRYPTO_V2_MAGIC);
            workerScope.postMessage({ type: 'HEADER', chunk: header }, [header.buffer]);
            return;
        }

        if (!fileKeyPromise) {
            throw new Error('Encryptor not initialized');
        }

        if (event.data.type === 'PROCESS') {
            const key = await fileKeyPromise;
            const iv = globalThis.crypto.getRandomValues(new Uint8Array(FILE_CRYPTO_V2_IV_LENGTH));
            const encryptedChunk = await globalThis.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                event.data.chunk,
            );

            const ciphertext = new Uint8Array(encryptedChunk);
            const framedChunk = concatUint8Arrays(
                createChunkPrefixV2(ciphertext.byteLength, iv),
                ciphertext,
            );

            workerScope.postMessage({ type: 'PROCESSED', chunk: framedChunk }, [framedChunk.buffer]);
            return;
        }

        fileKeyPromise = null;
        workerScope.postMessage({ type: 'FINAL' });
    } catch (error) {
        fileKeyPromise = null;
        workerScope.postMessage({ type: 'ERROR', error: getErrorMessage(error) });
    }
};
