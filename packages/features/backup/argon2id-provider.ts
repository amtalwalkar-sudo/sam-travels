import { argon2id } from "hash-wasm";
import type { Argon2idProvider } from "./crypto";

/** Production Argon2id v1.3 provider backed by the bundled hash-wasm WebAssembly implementation. */
export class HashWasmArgon2idProvider implements Argon2idProvider {
  async deriveKey(input: {
    passphrase: string;
    salt: Uint8Array;
    parameters: { memoryKiB: number; iterations: number; parallelism: number; hashLength: number };
  }): Promise<Uint8Array> {
    const derived = await argon2id({
      password: input.passphrase,
      salt: input.salt,
      memorySize: input.parameters.memoryKiB,
      iterations: input.parameters.iterations,
      parallelism: input.parameters.parallelism,
      hashLength: input.parameters.hashLength,
      outputType: "binary",
    });
    if (!(derived instanceof Uint8Array) || derived.byteLength !== input.parameters.hashLength) {
      throw new Error("backup_argon2id_invalid_output");
    }
    return new Uint8Array(derived);
  }
}
