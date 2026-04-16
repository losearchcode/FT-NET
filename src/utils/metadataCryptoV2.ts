import type { EncryptedFileMetadataPayloadV2, FileMetadataSecretV2 } from '../types';
import {
    base64ToBytes,
    bytesToBase64,
    clearKeyCacheV2,
    decodeUtf8,
    deriveNamedAesGcmKeyV2,
    encodeUtf8,
    ensureSubtleCrypto,
    isWebCryptoV2Available,
    toArrayBuffer,
} from './e2eeV2';

const metadataKeyCache = new Map<string, Promise<CryptoKey>>();

export const isMetadataCryptoV2Available = isWebCryptoV2Available;

export const deriveMetadataKeyV2 = async (password: string): Promise<CryptoKey> => (
    deriveNamedAesGcmKeyV2(
        password,
        'FT-NET-E2EE-V2-METADATA-KEY',
        metadataKeyCache,
    )
);

export const encryptFileMetadataV2 = async (
    metadata: FileMetadataSecretV2,
    password: string,
): Promise<EncryptedFileMetadataPayloadV2> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMetadataKeyV2(password);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        toArrayBuffer(encodeUtf8(JSON.stringify(metadata))),
    );

    return {
        version: 'v2',
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
};

export const decryptFileMetadataV2 = async (
    payload: EncryptedFileMetadataPayloadV2,
    password: string,
): Promise<FileMetadataSecretV2> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMetadataKeyV2(password);
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    const plaintext = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext),
    );

    const parsed = JSON.parse(decodeUtf8(plaintext)) as Partial<FileMetadataSecretV2>;
    if (typeof parsed.fileName !== 'string' || !parsed.fileName.trim()) {
        throw new Error('Invalid decrypted file metadata');
    }

    return {
        fileName: parsed.fileName,
    };
};

export const clearMetadataKeyCacheV2 = (password?: string) => {
    clearKeyCacheV2(metadataKeyCache, password);
};
