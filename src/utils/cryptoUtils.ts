/* eslint-disable @typescript-eslint/no-explicit-any */
import CryptoJS from 'crypto-js';

const SALT = 'FT-NET-SECURE-SALT-2024';
const KEY_SIZE = 256 / 32;
const ITERATIONS = 1000;
const derivedKeyCache = new Map<string, string>();

export function hashRoomPassword(password: string): string {
    return CryptoJS.SHA256(password).toString();
}

export function deriveEncryptionKey(password: string): string {
    const cachedKey = derivedKeyCache.get(password);
    if (cachedKey) {
        return cachedKey;
    }

    const key = CryptoJS.PBKDF2(password, SALT, {
        keySize: KEY_SIZE,
        iterations: ITERATIONS,
    });

    const keyString = key.toString();
    derivedKeyCache.set(password, keyString);
    return keyString;
}

export function encryptText(text: string, key: string): string {
    return CryptoJS.AES.encrypt(text, key).toString();
}

export function decryptText(encryptedBase64: string, key: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedBase64, key);
    return bytes.toString(CryptoJS.enc.Utf8);
}

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

export function encryptFileBuffer(buffer: ArrayBuffer, key: string): Uint8Array {
    const wordArray = arrayBufferToWordArray(buffer);
    const encrypted = CryptoJS.AES.encrypt(wordArray, key);
    return new TextEncoder().encode(encrypted.toString());
}

export function decryptFileBuffer(data: Uint8Array, key: string): ArrayBuffer {
    const header = uint8ArrayToWordArray(data.slice(0, 8));
    if (header.words[0] !== 0x53616c74 || header.words[1] !== 0x65645f5f) {
        throw new Error('未检测到加密文件头');
    }

    const salt = uint8ArrayToWordArray(data.slice(8, 16));
    const ciphertext = uint8ArrayToWordArray(data.slice(16));

    const derivedKey = CryptoJS.PBKDF2(key, SALT, {
        keySize: KEY_SIZE,
        iterations: ITERATIONS,
    });

    const keyWithSalt = CryptoJS.PBKDF2(derivedKey.toString(), salt, {
        keySize: 256 / 32 + 128 / 32,
        iterations: 1,
    });

    const aesKey = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(0, 256 / 32));
    const iv = CryptoJS.lib.WordArray.create(keyWithSalt.words.slice(256 / 32, 256 / 32 + 128 / 32));

    const decrypted = CryptoJS.AES.decrypt({ ciphertext } as any, aesKey, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });

    return wordArrayToUint8Array(decrypted).buffer;
}

export function clearKeyCache(password?: string) {
    if (password) {
        derivedKeyCache.delete(password);
        return;
    }

    derivedKeyCache.clear();
}
