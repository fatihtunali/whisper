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
   * Generate a new key pair using X25519
   */
  generateKeyPair(): { publicKey: string; privateKey: string } {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      privateKey: encodeBase64(keyPair.secretKey),
    };
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
   * Derive keys from seed phrase (deterministic)
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
   * Recover account from seed phrase
   */
  async recoverFromSeed(seedPhrase: string[]): Promise<{
    publicKey: string;
    privateKey: string;
    whisperId: string;
  }> {
    const keys = this.deriveKeysFromSeed(seedPhrase);

    // Generate deterministic Whisper ID from public key
    const publicKeyBytes = decodeBase64(keys.publicKey);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let whisperId = 'WSP';

    for (let i = 0; i < 12; i++) {
      if (i % 4 === 0) whisperId += '-';
      whisperId += chars[publicKeyBytes[i] % chars.length];
    }

    return {
      ...keys,
      whisperId,
    };
  }

  /**
   * Encrypt a message using recipient's public key
   */
  encryptMessage(
    plaintext: string,
    myPrivateKey: string,
    theirPublicKey: string
  ): { encrypted: string; nonce: string } {
    const messageBytes = decodeUTF8(plaintext);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

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
}

export const cryptoService = new CryptoService();
export default cryptoService;
