import * as Crypto from 'expo-crypto';

/**
 * Hash un mot de passe en SHA256
 * @param password Le mot de passe en clair
 * @returns Le hash SHA256 en hexadécimal
 */
export async function hashPassword(password: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    password
  );
}
