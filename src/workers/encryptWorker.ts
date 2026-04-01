/* eslint-disable @typescript-eslint/no-explicit-any */
import CryptoJS from 'crypto-js';

type WorkerRequest =
    | { type: 'INIT'; key: string; salt: string; iterations: number }
    | { type: 'PROCESS'; chunk: ArrayBuffer }
    | { type: 'FINALIZE' };

type WorkerScope = typeof globalThis & {
    postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

let encryptor: any = null;

const getErrorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : 'Unknown error'
);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    try {
        if (event.data.type === 'INIT') {
            const { key, salt, iterations } = event.data;

            const derivedKey = CryptoJS.PBKDF2(key, salt, {
                keySize: 256 / 32,
                iterations,
            });

            const randomSalt = CryptoJS.lib.WordArray.random(8);
            const keyWithSalt = CryptoJS.PBKDF2(derivedKey.toString(), randomSalt, {
                keySize: 256 / 32 + 128 / 32,
                iterations: 1,
            });

            const aesKey = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(0, 256 / 32));
            const iv = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(256 / 32, 256 / 32 + 128 / 32));

            encryptor = CryptoJS.algo.AES.createEncryptor(aesKey, {
                iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            });

            const header = CryptoJS.lib.WordArray.create([
                0x53616c74,
                0x65645f5f,
                randomSalt.words[0],
                randomSalt.words[1],
            ], 16);
            const headerChunk = wordArrayToUint8Array(header);
            workerScope.postMessage({ type: 'HEADER', chunk: headerChunk }, [headerChunk.buffer]);
            return;
        }

        if (!encryptor) {
            throw new Error('Encryptor not initialized');
        }

        if (event.data.type === 'PROCESS') {
            const wordArray = arrayBufferToWordArray(event.data.chunk);
            const encryptedChunk = encryptor.process(wordArray);

            if (encryptedChunk && encryptedChunk.sigBytes > 0) {
                const chunk = wordArrayToUint8Array(encryptedChunk);
                workerScope.postMessage({ type: 'PROCESSED', chunk }, [chunk.buffer]);
                return;
            }

            workerScope.postMessage({ type: 'PROCESSED' });
            return;
        }

        const finalized = encryptor.finalize();
        encryptor = null;

        if (finalized && finalized.sigBytes > 0) {
            const chunk = wordArrayToUint8Array(finalized);
            workerScope.postMessage({ type: 'FINAL', chunk }, [chunk.buffer]);
            return;
        }

        workerScope.postMessage({ type: 'FINAL' });
    } catch (error) {
        encryptor = null;
        workerScope.postMessage({ type: 'ERROR', error: getErrorMessage(error) });
    }
};

function arrayBufferToWordArray(buffer: ArrayBuffer) {
    const uint8Array = new Uint8Array(buffer);
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
