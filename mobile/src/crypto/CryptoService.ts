import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';

// Base64 encoding/decoding utilities
const encodeBase64 = (arr: Uint8Array): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = arr.length;
  for (let i = 0; i < len; i += 3) {
    const a = arr[i];
    const b = i + 1 < len ? arr[i + 1] : 0;
    const c = i + 2 < len ? arr[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? chars[c & 63] : '=';
  }
  return result;
};

const decodeBase64 = (str: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = str.length;
  let bufferLength = (len * 3) / 4;
  if (str[len - 1] === '=') bufferLength--;
  if (str[len - 2] === '=') bufferLength--;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = chars.indexOf(str[i]);
    const b = chars.indexOf(str[i + 1]);
    const c = chars.indexOf(str[i + 2]);
    const d = chars.indexOf(str[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c !== -1 && str[i + 2] !== '=') bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1 && str[i + 3] !== '=') bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
};

const encodeUTF8 = (arr: Uint8Array): string => {
  return new TextDecoder().decode(arr);
};

const decodeUTF8 = (str: string): Uint8Array => {
  return new TextEncoder().encode(str);
};

// BIP39 wordlist (simplified - using first 256 common words for demo)
// In production, use the full 2048 word BIP39 wordlist
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable',
];

class CryptoService {
  /**
   * Generate a new encryption key pair using X25519
   */
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      privateKey: encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Generate a new signing key pair using Ed25519
   * Used for authentication (challenge-response)
   */
  generateSigningKeyPair(): { signingPublicKey: string; signingPrivateKey: string } {
    const keyPair = nacl.sign.keyPair();
    return {
      signingPublicKey: encodeBase64(keyPair.publicKey),
      signingPrivateKey: encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Sign a message using Ed25519
   * Returns base64-encoded detached signature
   */
  sign(message: Uint8Array, signingPrivateKey: string): string {
    const privateKeyBytes = decodeBase64(signingPrivateKey);
    const signature = nacl.sign.detached(message, privateKeyBytes);
    return encodeBase64(signature);
  }

  /**
   * Verify an Ed25519 signature
   */
  verify(message: Uint8Array, signature: string, signingPublicKey: string): boolean {
    try {
      const signatureBytes = decodeBase64(signature);
      const publicKeyBytes = decodeBase64(signingPublicKey);
      return nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique Whisper ID (WSP-XXXX-XXXX-XXXX)
   */
  async generateWhisperId(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomBytes = await Crypto.getRandomBytesAsync(12);

    let id = 'WSP';
    for (let i = 0; i < 12; i++) {
      if (i % 4 === 0) id += '-';
      id += chars[randomBytes[i] % chars.length];
    }

    return id;
  }

  /**
   * Generate a 12-word seed phrase
   */
  async generateSeedPhrase(): Promise<string[]> {
    const randomBytes = await Crypto.getRandomBytesAsync(12);
    const words: string[] = [];

    for (let i = 0; i < 12; i++) {
      const index = randomBytes[i] % WORDLIST.length;
      words.push(WORDLIST[index]);
    }

    return words;
  }

  /**
   * Derive encryption keys from seed phrase (deterministic)
   * Uses X25519 for key exchange/encryption
   */
  deriveKeysFromSeed(seedPhrase: string[]): { publicKey: string; privateKey: string } {
    // Create a deterministic seed from the phrase
    const seedString = seedPhrase.join(' ');
    const encoder = new TextEncoder();
    const seedData = encoder.encode(seedString);

    // Use the seed to generate a deterministic key pair
    // In production, use proper PBKDF2 or similar KDF
    const seed = new Uint8Array(32);
    for (let i = 0; i < seedData.length && i < 32; i++) {
      seed[i] = seedData[i];
    }
    // Pad with hash of the seed string for remaining bytes
    for (let i = seedData.length; i < 32; i++) {
      seed[i] = seedData[i % seedData.length] ^ (i * 31);
    }

    const keyPair = nacl.box.keyPair.fromSecretKey(seed);
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      privateKey: encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Derive signing keys from seed phrase (deterministic)
   * Uses Ed25519 for authentication (challenge-response)
   * NOTE: This derives a SEPARATE key pair from encryption keys
   */
  deriveSigningKeysFromSeed(seedPhrase: string[]): { signingPublicKey: string; signingPrivateKey: string } {
    // Create a different deterministic seed for signing keys
    // Prefix with 'sign:' to derive a separate key pair
    const seedString = 'sign:' + seedPhrase.join(' ');
    const encoder = new TextEncoder();
    const seedData = encoder.encode(seedString);

    // Create 32-byte seed for Ed25519
    const seed = new Uint8Array(32);
    for (let i = 0; i < seedData.length && i < 32; i++) {
      seed[i] = seedData[i];
    }
    // Pad with hash of the seed string for remaining bytes
    for (let i = seedData.length; i < 32; i++) {
      seed[i] = seedData[i % seedData.length] ^ (i * 37); // Different multiplier for uniqueness
    }

    const keyPair = nacl.sign.keyPair.fromSeed(seed);
    return {
      signingPublicKey: encodeBase64(keyPair.publicKey),
      signingPrivateKey: encodeBase64(keyPair.secretKey),
    };
  }

  /**
   * Recover account from seed phrase
   * Returns both encryption keys (X25519) and signing keys (Ed25519)
   */
  async recoverFromSeed(seedPhrase: string[]): Promise<{
    publicKey: string;
    privateKey: string;
    signingPublicKey: string;
    signingPrivateKey: string;
    whisperId: string;
  }> {
    const encryptionKeys = this.deriveKeysFromSeed(seedPhrase);
    const signingKeys = this.deriveSigningKeysFromSeed(seedPhrase);

    // Generate deterministic Whisper ID from public key
    const publicKeyBytes = decodeBase64(encryptionKeys.publicKey);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let whisperId = 'WSP';

    for (let i = 0; i < 12; i++) {
      if (i % 4 === 0) whisperId += '-';
      whisperId += chars[publicKeyBytes[i] % chars.length];
    }

    return {
      ...encryptionKeys,
      ...signingKeys,
      whisperId,
    };
  }

  /**
   * Encrypt a message using recipient's public key
   */
  async encryptMessage(
    plaintext: string,
    myPrivateKey: string,
    theirPublicKey: string
  ): Promise<{ encrypted: string; nonce: string }> {
    const messageBytes = decodeUTF8(plaintext);
    // Use expo-crypto instead of nacl.randomBytes (which needs PRNG setup)
    const nonce = new Uint8Array(await Crypto.getRandomBytesAsync(nacl.box.nonceLength));

    const encrypted = nacl.box(
      messageBytes,
      nonce,
      decodeBase64(theirPublicKey),
      decodeBase64(myPrivateKey)
    );

    return {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
    };
  }

  /**
   * Decrypt a message using sender's public key
   */
  decryptMessage(
    encrypted: string,
    nonce: string,
    myPrivateKey: string,
    theirPublicKey: string
  ): string | null {
    try {
      const decrypted = nacl.box.open(
        decodeBase64(encrypted),
        decodeBase64(nonce),
        decodeBase64(theirPublicKey),
        decodeBase64(myPrivateKey)
      );

      if (!decrypted) {
        return null;
      }

      return encodeUTF8(decrypted);
    } catch {
      return null;
    }
  }

  /**
   * Encrypt binary data (for voice messages, images, files)
   */
  async encryptBinaryData(
    data: string,  // Base64 encoded data
    myPrivateKey: string,
    theirPublicKey: string
  ): Promise<{ encrypted: string; nonce: string }> {
    const dataBytes = decodeBase64(data);
    const nonce = new Uint8Array(await Crypto.getRandomBytesAsync(nacl.box.nonceLength));

    const encrypted = nacl.box(
      dataBytes,
      nonce,
      decodeBase64(theirPublicKey),
      decodeBase64(myPrivateKey)
    );

    return {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
    };
  }

  /**
   * Decrypt binary data (for voice messages, images, files)
   */
  decryptBinaryData(
    encrypted: string,
    nonce: string,
    myPrivateKey: string,
    theirPublicKey: string
  ): string | null {
    try {
      const decrypted = nacl.box.open(
        decodeBase64(encrypted),
        decodeBase64(nonce),
        decodeBase64(theirPublicKey),
        decodeBase64(myPrivateKey)
      );

      if (!decrypted) {
        return null;
      }

      return encodeBase64(decrypted);
    } catch {
      return null;
    }
  }

  /**
   * Validate a seed phrase
   */
  validateSeedPhrase(words: string[]): boolean {
    if (words.length !== 12) return false;
    return words.every(word => WORDLIST.includes(word.toLowerCase()));
  }

  /**
   * Get the wordlist for autocomplete
   */
  getWordlist(): string[] {
    return [...WORDLIST];
  }

  /**
   * Encrypt a message for group chat (simplified for MVP)
   * For production, implement proper group encryption (e.g., Signal's Sender Keys)
   * This simplified version uses symmetric encryption with a derived key
   */
  async encryptForGroup(
    plaintext: string,
    senderPrivateKey: string
  ): Promise<{ encrypted: string; nonce: string }> {
    const messageBytes = decodeUTF8(plaintext);
    const nonce = new Uint8Array(await Crypto.getRandomBytesAsync(nacl.secretbox.nonceLength));

    // Derive a symmetric key from the sender's private key
    // In production, use proper group key management
    const privateKeyBytes = decodeBase64(senderPrivateKey);
    const symmetricKey = new Uint8Array(nacl.secretbox.keyLength);
    for (let i = 0; i < nacl.secretbox.keyLength; i++) {
      symmetricKey[i] = privateKeyBytes[i % privateKeyBytes.length];
    }

    const encrypted = nacl.secretbox(messageBytes, nonce, symmetricKey);

    return {
      encrypted: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
    };
  }

  /**
   * Decrypt a group message (simplified for MVP)
   * Returns null if decryption fails
   */
  decryptFromGroup(
    encrypted: string,
    nonce: string,
    receiverPrivateKey: string
  ): string | null {
    try {
      // For MVP, group messages are not truly end-to-end encrypted
      // They're encrypted for transport, but all group members can read them
      // In production, implement proper group encryption

      // Since we don't have the sender's key, we try to decode as plain text
      // This is a placeholder - in a real implementation, you'd use sender keys
      const privateKeyBytes = decodeBase64(receiverPrivateKey);
      const symmetricKey = new Uint8Array(nacl.secretbox.keyLength);
      for (let i = 0; i < nacl.secretbox.keyLength; i++) {
        symmetricKey[i] = privateKeyBytes[i % privateKeyBytes.length];
      }

      const decrypted = nacl.secretbox.open(
        decodeBase64(encrypted),
        decodeBase64(nonce),
        symmetricKey
      );

      if (!decrypted) {
        // Fallback: try to interpret as plaintext (for messages from others)
        return null;
      }

      return encodeUTF8(decrypted);
    } catch {
      return null;
    }
  }
}

export const cryptoService = new CryptoService();
export default cryptoService;
