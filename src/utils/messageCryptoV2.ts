import type { EncryptedTextPayloadV2 } from '../types';
import {
    base64ToBytes,
    bytesToBase64,
    clearKeyCacheV2,
    decodeUtf8,
    deriveNamedAesGcmKeyV2,
    ensureSubtleCrypto,
    isWebCryptoV2Available,
    toArrayBuffer,
} from './e2eeV2';

const messageKeyCache = new Map<string, Promise<CryptoKey>>();

const deriveMessageKeyV2 = async (password: string): Promise<CryptoKey> => {
    return deriveNamedAesGcmKeyV2(
        password,
        'FT-NET-E2EE-V2-MESSAGE-KEY',
        messageKeyCache,
    );
};

export const isMessageCryptoV2Available = isWebCryptoV2Available;

export const encryptTextV2 = async (text: string, password: string): Promise<EncryptedTextPayloadV2> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMessageKeyV2(password);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(text),
    );

    return {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
};

export const decryptTextV2 = async (payload: EncryptedTextPayloadV2, password: string): Promise<string> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMessageKeyV2(password);
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);

    const plaintext = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext),
    );

    return decodeUtf8(plaintext);
};

export const encryptSenderNameV2 = async (
    senderName: string,
    password: string,
): Promise<{ encryptedSenderName: string; senderNameIv: string }> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMessageKeyV2(password);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(senderName),
    );

    return {
        encryptedSenderName: bytesToBase64(new Uint8Array(ciphertext)),
        senderNameIv: bytesToBase64(iv),
    };
};

export const decryptSenderNameV2 = async (
    encryptedSenderName: string,
    senderNameIv: string,
    password: string,
): Promise<string> => {
    const subtle = ensureSubtleCrypto();
    const key = await deriveMessageKeyV2(password);
    const iv = base64ToBytes(senderNameIv);
    const ciphertext = base64ToBytes(encryptedSenderName);
    const plaintext = await subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        toArrayBuffer(ciphertext),
    );
    return decodeUtf8(plaintext);
};

export const clearMessageKeyCacheV2 = (password?: string) => {
    clearKeyCacheV2(messageKeyCache, password);
};
