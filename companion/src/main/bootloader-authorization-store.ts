import fs from 'node:fs';
import path from 'node:path';

// Ported from Kitsune Input. Keeps this computer's bootloader authorization
// key for each bridge, encrypted with Windows protected storage (DPAPI via
// Electron safeStorage), so only this Windows account can use it.

export interface BootloaderAuthorizationKeyRecord {
  keyId: number[];
  secret: Buffer;
}

export interface BootloaderAuthorizationStorePort {
  /** Null when this computer has no usable key, so the caller enrolls a new one. */
  get(bridgeUniqueId: string): BootloaderAuthorizationKeyRecord | null;
  set(bridgeUniqueId: string, record: BootloaderAuthorizationKeyRecord): void;
  delete(bridgeUniqueId: string): void;
}

export interface BootloaderAuthorizationProtectionPort {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface ProtectedRecord {
  keyIdHex: string;
  encryptedSecretBase64: string;
}

interface ProtectedStoreFile {
  version: 1;
  records: Record<string, ProtectedRecord>;
}

function normalizeUniqueId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(normalized)) {
    throw new Error('The Pico did not provide a valid unique hardware ID.');
  }
  return normalized;
}

function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (value) => (value & 0xff).toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): number[] {
  if (!/^[0-9a-f]{8}$/i.test(hex)) {
    throw new Error('The protected Pico authorization key ID is invalid.');
  }
  return Array.from({ length: 4 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

export class BootloaderAuthorizationStore implements BootloaderAuthorizationStorePort {
  private readonly filePath: string;

  constructor(
    userDataPath: string,
    private readonly protection: BootloaderAuthorizationProtectionPort
  ) {
    this.filePath = path.join(userDataPath, 'security', 'bootloader-authorizations.v1.json');
  }

  get(bridgeUniqueId: string): BootloaderAuthorizationKeyRecord | null {
    // Without protected storage no key could be saved either, so stop before
    // the caller asks for the controller sequence.
    this.assertEncryptionAvailable();
    const entry = this.read().records[normalizeUniqueId(bridgeUniqueId)];
    if (!entry) return null;
    try {
      const secretHex = this.protection.decryptString(Buffer.from(entry.encryptedSecretBase64, 'base64'));
      if (!/^[0-9a-f]{64}$/i.test(secretHex)) {
        throw new Error('The protected Pico authorization secret is invalid.');
      }
      return {
        keyId: hexToBytes(entry.keyIdHex),
        secret: Buffer.from(secretHex, 'hex')
      };
    } catch (error) {
      // A record this Windows account cannot use, such as one restored from
      // another account or machine, is no key. Enrollment still needs the
      // controller sequence on the bridge, then set() replaces the record.
      console.warn(`[BootloaderAuthorizationStore] A saved bridge key is unusable on this computer and will be re-enrolled: ${errorMessage(error)}`);
      return null;
    }
  }

  set(bridgeUniqueId: string, record: BootloaderAuthorizationKeyRecord): void {
    if (record.keyId.length !== 4 || record.secret.length !== 32) {
      throw new Error('Refusing to store an invalid Pico authorization key.');
    }
    this.assertEncryptionAvailable();
    const data = this.read();
    data.records[normalizeUniqueId(bridgeUniqueId)] = {
      keyIdHex: bytesToHex(record.keyId),
      encryptedSecretBase64: this.protection.encryptString(record.secret.toString('hex')).toString('base64')
    };
    this.write(data);
  }

  delete(bridgeUniqueId: string): void {
    const data = this.read();
    delete data.records[normalizeUniqueId(bridgeUniqueId)];
    this.write(data);
  }

  private assertEncryptionAvailable(): void {
    if (!this.protection.isEncryptionAvailable()) {
      throw new Error('Windows protected storage is unavailable, so DS5 Bridge cannot keep a bootloader key. Hold BOOTSEL while plugging in the Pico to update it instead.');
    }
  }

  private read(): ProtectedStoreFile {
    let text: string;
    try {
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, records: {} };
      throw error;
    }
    try {
      const parsed = JSON.parse(text) as Partial<ProtectedStoreFile>;
      if (parsed.version === 1 && typeof parsed.records === 'object'
        && parsed.records !== null && !Array.isArray(parsed.records)) {
        return { version: 1, records: { ...parsed.records } };
      }
    } catch {
      // Torn or zero-filled text is handled with any other invalid store below.
    }
    // An unreadable store holds no usable key. Keep it for diagnosis and start
    // empty, so the next authorization re-enrolls instead of failing forever.
    const quarantinePath = `${this.filePath}.corrupt-${new Date().toISOString().replace(/[-:.]/g, '')}`;
    fs.renameSync(this.filePath, quarantinePath);
    console.warn(`[BootloaderAuthorizationStore] Moved an unreadable store to ${quarantinePath}; bridges will be re-enrolled.`);
    return { version: 1, records: {} };
  }

  private write(data: ProtectedStoreFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const descriptor = fs.openSync(temporaryPath, 'w', 0o600);
    try {
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        // Flush before the rename so a power loss cannot leave an empty or
        // zero-filled store in place of the previous one.
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
