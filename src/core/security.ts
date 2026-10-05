/**
 * Cryptographic and Security Utilities for Hisab Sathi
 * Uses standard Web Crypto API (SubtleCrypto) for:
 * 1. Cryptographically secure Recovery Code generation & SHA-256 hashing
 * 2. Client-side password-based AES-GCM 256-bit backup encryption & decryption
 */

// Helper to convert Uint8Array to Hex string
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert Hex string to Uint8Array
export function hexToBuffer(hex: string): Uint8Array {
  const cleanHex = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/* ==========================================================================
   1. RECOVERY CODE UTILITIES
   ========================================================================== */

/**
 * Generates a cryptographically strong 20-character recovery code in 5 blocks
 * Example: 'HS8K-39AF-92M1-78BC-54DE'
 * Uses crypto.getRandomValues (never Math.random).
 */
export function generateSecureRecoveryCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32-like (no 0, 1, I, O to avoid confusion)
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);

  const rawChars = Array.from(randomBytes).map(byte => chars[byte % chars.length]);
  
  // Format into 5 groups of 4: XXXX-XXXX-XXXX-XXXX-XXXX
  const blocks: string[] = [];
  for (let i = 0; i < 20; i += 4) {
    blocks.push(rawChars.slice(i, i + 4).join(''));
  }
  return blocks.join('-');
}

/**
 * Computes SHA-256 hash of a normalized recovery code.
 * Raw recovery codes are NEVER stored in Firestore; only the SHA-256 verifier hash is stored.
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(`HISAB_SATHI_RECOVERY_SALT_V1:${normalized}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

/* ==========================================================================
   2. ENCRYPTED BACKUP UTILITIES (AES-GCM 256-bit + PBKDF2)
   ========================================================================== */

export interface EncryptedBackupPayload {
  format: 'hisab_sathi_encrypted_backup';
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // hex
  createdAt: string;
}

/**
 * Derives an AES-GCM 256-bit CryptoKey from a user passphrase and salt using PBKDF2
 */
async function deriveEncryptionKey(passphrase: string, salt: Uint8Array, iterations = 100000): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary data (JSON string or object) with AES-GCM 256-bit.
 * Generates fresh cryptographically random 16-byte salt and 12-byte IV.
 */
export async function encryptDataWithPassphrase(
  data: unknown,
  passphrase: string
): Promise<EncryptedBackupPayload> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }

  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const enc = new TextEncoder();
  const encodedData = enc.encode(jsonString);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const iterations = 100000;
  const key = await deriveEncryptionKey(passphrase, salt, iterations);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  return {
    format: 'hisab_sathi_encrypted_backup',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bufferToHex(salt),
    iv: bufferToHex(iv),
    ciphertext: bufferToHex(encryptedBuffer),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decrypts an EncryptedBackupPayload using the user-supplied passphrase.
 * Throws a clear error if the passphrase is wrong or data is corrupted.
 */
export async function decryptDataWithPassphrase<T = unknown>(
  payload: EncryptedBackupPayload,
  passphrase: string
): Promise<T> {
  if (payload.format !== 'hisab_sathi_encrypted_backup' || payload.version !== 1) {
    throw new Error('Invalid backup file format or unsupported version.');
  }

  const salt = hexToBuffer(payload.salt);
  const iv = hexToBuffer(payload.iv);
  const ciphertext = hexToBuffer(payload.ciphertext);

  const key = await deriveEncryptionKey(passphrase, salt, payload.iterations || 100000);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    const jsonString = dec.decode(decryptedBuffer);
    return JSON.parse(jsonString) as T;
  } catch {
    throw new Error('Decryption failed. Incorrect passphrase or corrupted backup file.');
  }
}

