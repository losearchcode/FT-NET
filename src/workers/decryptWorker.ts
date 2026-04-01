/* eslint-disable @typescript-eslint/no-explicit-any */
import CryptoJS from 'crypto-js';

let decryptor: any = null;
let headerBuffer = new Uint8Array(0);
const HEADER_SIZE = 16;
const HEADER_PREFIX = 'Salted__';

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : 'Unknown error'
);
type WorkerScope = typeof globalThis & {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
const workerScope = self as unknown as WorkerScope;

self.onmessage = async (event: MessageEvent) => {
    const { type, chunk, key, iterations } = event.data as {
        type: 'CHUNK' | 'FINALIZE';
        chunk?: Uint8Array;
        key?: string;
        iterations?: number;
    };

    try {
        if (type === 'CHUNK') {
            if (!chunk) {
                throw new Error('缺少解密分片');
            }
            let dataToProcess = new Uint8Array(chunk);

            if (!decryptor) {
                const combined = new Uint8Array(headerBuffer.length + dataToProcess.length);
                combined.set(headerBuffer);
                combined.set(dataToProcess, headerBuffer.length);

                if (combined.length < HEADER_SIZE) {
                    headerBuffer = combined;
                    return;
                }

                const header = combined.slice(0, HEADER_SIZE);
                const prefix = new TextDecoder().decode(header.slice(0, 8));
                if (prefix !== HEADER_PREFIX) {
                    throw new Error('未检测到有效的加密文件头');
                }

                const salt = uint8ArrayToWordArray(header.slice(8, 16));
                const derivedKey = CryptoJS.PBKDF2(key, 'FT-NET-SECURE-SALT-2024', {
                    keySize: 256 / 32,
                    iterations: iterations || 1000,
                });

                const keyWithSalt = CryptoJS.PBKDF2(derivedKey.toString(), salt, {
                    keySize: 256 / 32 + 128 / 32,
                    iterations: 1,
                });

                const aesKey = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(0, 256 / 32));
                const iv = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(256 / 32, 256 / 32 + 128 / 32));

                decryptor = CryptoJS.algo.AES.createDecryptor(aesKey, {
                    iv,
                    mode: CryptoJS.mode.CBC,
                    padding: CryptoJS.pad.Pkcs7,
                });

                dataToProcess = combined.slice(HEADER_SIZE);
                headerBuffer = new Uint8Array(0);
            }

            if (dataToProcess.length > 0) {
                const wordArray = uint8ArrayToWordArray(dataToProcess);
                const decrypted = decryptor.process(wordArray);
                if (decrypted && decrypted.sigBytes > 0) {
                    const decryptedChunk = wordArrayToUint8Array(decrypted);
                    workerScope.postMessage({ type: 'CHUNK', chunk: decryptedChunk }, [decryptedChunk.buffer]);
                }
            }
            return;
        }

        if (decryptor) {
            const finalized = decryptor.finalize();
            if (finalized && finalized.sigBytes > 0) {
                const finalChunk = wordArrayToUint8Array(finalized);
                workerScope.postMessage({ type: 'CHUNK', chunk: finalChunk }, [finalChunk.buffer]);
            }
        }

        decryptor = null;
        headerBuffer = new Uint8Array(0);
        workerScope.postMessage({ type: 'DONE' });
    } catch (error) {
        decryptor = null;
        headerBuffer = new Uint8Array(0);
        workerScope.postMessage({ type: 'ERROR', error: getErrorMessage(error) });
    }
};

function uint8ArrayToWordArray(uint8Array: Uint8Array) {
    const words = [];
    for (let i = 0; i < uint8Array.length; i += 4) {
        words.push(
            (uint8Array[i] << 24)
            | (uint8Array[i + 1] << 16)
            | (uint8Array[i + 2] << 8)
            | uint8Array[i + 3],
        );
    }
    return CryptoJS.lib.WordArray.create(words, uint8Array.length);
}

function wordArrayToUint8Array(wordArray: any) {
    const uint8Array = new Uint8Array(wordArray.sigBytes);
    for (let i = 0; i < wordArray.sigBytes; i++) {
        uint8Array[i] = (wordArray.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return uint8Array;
}
