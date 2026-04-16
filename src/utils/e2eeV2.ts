const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PBKDF2_ITERATIONS = 200000;
const MASTER_SALT = encoder.encode('FT-NET-E2EE-V2-MASTER-SALT');
const HKDF_SALT = encoder.encode('FT-NET-E2EE-V2-HKDF-SALT');

export const ensureSubtleCrypto = (): SubtleCrypto => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('Web Crypto API is unavailable');
    }
    return subtle;
};

export const isWebCryptoV2Available = (): boolean => (
    typeof globalThis !== 'undefined'
    && typeof globalThis.crypto !== 'undefined'
    && typeof globalThis.crypto.subtle !== 'undefined'
);

export const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

export const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => (
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
);

export const encodeUtf8 = (value: string): Uint8Array => encoder.encode(value);

export const decodeUtf8 = (buffer: BufferSource): string => decoder.decode(buffer);

export const deriveNamedAesGcmKeyV2 = async (
    password: string,
    infoLabel: string,
    cache: Map<string, Promise<CryptoKey>>,
): Promise<CryptoKey> => {
    const cacheKey = `${password}:${infoLabel}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const derivePromise = (async () => {
        const subtle = ensureSubtleCrypto();
        const passwordKey = await subtle.importKey(
            'raw',
            toArrayBuffer(encodeUtf8(password)),
            'PBKDF2',
            false,
            ['deriveBits'],
        );

        const masterBits = await subtle.deriveBits(
            {
                name: 'PBKDF2',
                hash: 'SHA-256',
                iterations: PBKDF2_ITERATIONS,
                salt: toArrayBuffer(MASTER_SALT),
            },
            passwordKey,
            256,
        );

        const hkdfKey = await subtle.importKey(
            'raw',
            masterBits,
            'HKDF',
            false,
            ['deriveKey'],
        );

        return subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: toArrayBuffer(HKDF_SALT),
                info: toArrayBuffer(encodeUtf8(infoLabel)),
            },
            hkdfKey,
            {
                name: 'AES-GCM',
                length: 256,
            },
            false,
            ['encrypt', 'decrypt'],
        );
    })();

    cache.set(cacheKey, derivePromise);
    return derivePromise;
};

export const clearKeyCacheV2 = (
    cache: Map<string, Promise<CryptoKey>>,
    password?: string,
) => {
    if (password) {
        for (const key of cache.keys()) {
            if (key.startsWith(`${password}:`)) {
                cache.delete(key);
            }
        }
        return;
    }

    cache.clear();
};
