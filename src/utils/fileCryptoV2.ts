import {
    clearKeyCacheV2,
    deriveNamedAesGcmKeyV2,
    encodeUtf8,
    isWebCryptoV2Available,
} from './e2eeV2';
export { toArrayBuffer } from './e2eeV2';

const FILE_CRYPTO_V2_MAGIC_STRING = 'FTNV2F01';

const fileKeyCache = new Map<string, Promise<CryptoKey>>();

export const FILE_CRYPTO_V2_MAGIC = encodeUtf8(FILE_CRYPTO_V2_MAGIC_STRING);
export const FILE_CRYPTO_V2_HEADER_SIZE = FILE_CRYPTO_V2_MAGIC.length;
export const FILE_CRYPTO_V2_IV_LENGTH = 12;
export const FILE_CRYPTO_V2_CHUNK_PREFIX_SIZE = 4 + FILE_CRYPTO_V2_IV_LENGTH;
export const isFileCryptoV2Available = isWebCryptoV2Available;

export const concatUint8Arrays = (...chunks: Uint8Array[]): Uint8Array => {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }

    return merged;
};

export const getUint32BigEndian = (bytes: Uint8Array, offset: number): number => (
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false)
);

export const createChunkPrefixV2 = (ciphertextLength: number, iv: Uint8Array): Uint8Array => {
    const prefix = new Uint8Array(FILE_CRYPTO_V2_CHUNK_PREFIX_SIZE);
    const view = new DataView(prefix.buffer);
    view.setUint32(0, ciphertextLength, false);
    prefix.set(iv, 4);
    return prefix;
};

export const deriveFileKeyV2 = async (password: string): Promise<CryptoKey> => {
    return deriveNamedAesGcmKeyV2(
        password,
        'FT-NET-E2EE-V2-FILE-KEY',
        fileKeyCache,
    );
};

export const clearFileKeyCacheV2 = (password?: string) => {
    clearKeyCacheV2(fileKeyCache, password);
};
