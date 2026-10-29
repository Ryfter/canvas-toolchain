/**
 * Compile-time contract (spec 4.3): module-contract re-declares the credential
 * value types because it has no shared-types dependency. These assertions fail
 * to compile if the two declarations drift in either direction.
 * Type-checked by ../credential-types.test.ts (vitest itself does not type-check).
 */
import type * as Contract from '@canvas-toolchain/module-contract';
import type * as Shared from '@canvas-toolchain/shared-types';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type KindsAgree = Assert<Mutual<Contract.CredentialKind, Shared.CredentialKind>>;
export type CanvasAgrees = Assert<Mutual<Contract.CanvasCredential, Shared.CanvasCredential>>;
export type AnthropicAgrees = Assert<Mutual<Contract.AnthropicCredential, Shared.AnthropicCredential>>;
export type PanoptoAgrees = Assert<Mutual<Contract.PanoptoCredential, Shared.PanoptoCredential>>;

// Negative control: proves the check bites. A drifted shape must NOT be mutually assignable.
// @ts-expect-error a credential missing `token` is not the contract's CanvasCredential
export type DriftIsCaught = Assert<Mutual<Contract.CanvasCredential, { host: string }>>;
