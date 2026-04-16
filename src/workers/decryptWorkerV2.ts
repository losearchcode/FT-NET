import {
    concatUint8Arrays,
    deriveFileKeyV2,
    FILE_CRYPTO_V2_CHUNK_PREFIX_SIZE,
    FILE_CRYPTO_V2_HEADER_SIZE,
    FILE_CRYPTO_V2_IV_LENGTH,
    FILE_CRYPTO_V2_MAGIC,
    getUint32BigEndian,
    isFileCryptoV2Available,
    toArrayBuffer,
} from '../utils/fileCryptoV2';

type WorkerRequest =
    | { type: 'CHUNK'; chunk: Uint8Array; key: string }
    | { type: 'FINALIZE' };

type WorkerScope = typeof globalThis & {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

let keyPromise: Promise<CryptoKey> | null = null;
let pendingBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
let headerValidated = false;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : 'Unknown error'
);

const resetState = () => {
    keyPromise = null;
    pendingBuffer = new Uint8Array(0);
    headerValidated = false;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        if (event.data.type === 'CHUNK') {
            if (!isFileCryptoV2Available()) {
                throw new Error('Web Crypto API is unavailable');
            }

            if (!keyPromise) {
                keyPromise = deriveFileKeyV2(event.data.key);
            }

            pendingBuffer = concatUint8Arrays(pendingBuffer, event.data.chunk);

            if (!headerValidated) {
                if (pendingBuffer.length < FILE_CRYPTO_V2_HEADER_SIZE) {
                    return;
                }

                const header = pendingBuffer.slice(0, FILE_CRYPTO_V2_HEADER_SIZE);
                if (!header.every((byte, index) => byte === FILE_CRYPTO_V2_MAGIC[index])) {
                    throw new Error('Invalid encrypted file header');
                }

                pendingBuffer = pendingBuffer.slice(FILE_CRYPTO_V2_HEADER_SIZE);
                headerValidated = true;
            }

            const key = await keyPromise;

            while (pendingBuffer.length >= FILE_CRYPTO_V2_CHUNK_PREFIX_SIZE) {
                const ciphertextLength = getUint32BigEndian(pendingBuffer, 0);
                const totalRecordLength = FILE_CRYPTO_V2_CHUNK_PREFIX_SIZE + ciphertextLength;

                if (pendingBuffer.length < totalRecordLength) {
                    return;
                }

                const ivStart = 4;
                const ciphertextStart = ivStart + FILE_CRYPTO_V2_IV_LENGTH;
                const iv = pendingBuffer.slice(ivStart, ciphertextStart);
                const ciphertext = pendingBuffer.slice(ciphertextStart, totalRecordLength);

                const plaintext = await globalThis.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
                    key,
                    toArrayBuffer(ciphertext),
                );

                const decryptedChunk = new Uint8Array(plaintext);
                workerScope.postMessage({ type: 'CHUNK', chunk: decryptedChunk }, [decryptedChunk.buffer]);
                pendingBuffer = pendingBuffer.slice(totalRecordLength);
            }

            return;
        }

        if (!headerValidated) {
            throw new Error('Encrypted file header is incomplete');
        }

        if (pendingBuffer.length !== 0) {
            throw new Error('Encrypted file ended with a partial chunk');
        }

        workerScope.postMessage({ type: 'DONE' });
        resetState();
    } catch (error) {
        resetState();
        workerScope.postMessage({ type: 'ERROR', error: getErrorMessage(error) });
    }
};
