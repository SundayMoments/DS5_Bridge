import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BootloaderAuthorizationStore } from './bootloader-authorization-store';
import type { BootloaderAuthorizationProtectionPort } from './bootloader-authorization-store';

const BRIDGE = '1011121314151617';
const directories: string[] = [];

function protection(available = true): BootloaderAuthorizationProtectionPort {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
    decryptString: (value) => {
      const text = value.toString('utf8');
      if (!text.startsWith('sealed:')) throw new Error('foreign record');
      return text.slice('sealed:'.length);
    }
  };
}

function tempDir(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'ds5-bootloader-store-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('BootloaderAuthorizationStore', () => {
  it('round-trips a key and never writes the secret in clear text', () => {
    const directory = tempDir();
    const store = new BootloaderAuthorizationStore(directory, protection());
    const secret = Buffer.alloc(32, 0xab);
    store.set(BRIDGE.toUpperCase(), { keyId: [1, 2, 3, 4], secret });

    expect(store.get(BRIDGE)).toEqual({ keyId: [1, 2, 3, 4], secret });
    const text = readFileSync(path.join(directory, 'security', 'bootloader-authorizations.v1.json'), 'utf8');
    expect(text).not.toContain(secret.toString('hex'));
    expect(text).not.toContain(secret.toString('base64'));
  });

  it('treats a record this account cannot decrypt as no key', () => {
    const directory = tempDir();
    const file = path.join(directory, 'security', 'bootloader-authorizations.v1.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({
      version: 1,
      records: { [BRIDGE]: { keyIdHex: '01020304', encryptedSecretBase64: Buffer.from('other').toString('base64') } }
    }));

    expect(new BootloaderAuthorizationStore(directory, protection()).get(BRIDGE)).toBeNull();
  });

  it('quarantines an unreadable store and starts empty', () => {
    const directory = tempDir();
    const file = path.join(directory, 'security', 'bootloader-authorizations.v1.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '\0\0\0');

    expect(new BootloaderAuthorizationStore(directory, protection()).get(BRIDGE)).toBeNull();
    expect(readdirSync(path.dirname(file)).some((name) => name.includes('.corrupt-'))).toBe(true);
  });

  it('refuses to work without Windows protected storage', () => {
    const store = new BootloaderAuthorizationStore(tempDir(), protection(false));
    expect(() => store.get(BRIDGE)).toThrow('BOOTSEL');
  });

  it('rejects malformed bridge IDs and keys', () => {
    const store = new BootloaderAuthorizationStore(tempDir(), protection());
    expect(() => store.get('not-an-id')).toThrow('unique hardware ID');
    expect(() => store.set(BRIDGE, { keyId: [1, 2, 3], secret: Buffer.alloc(32) })).toThrow('invalid');
  });
});
