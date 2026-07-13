import * as crypto from 'node:crypto';
import * as secp from '../vendored/@noble/secp256k1/index.js';
import {
  decodeSignerMessage,
  SignerMessageTypeID,
  type DecodedNakamotoBlockResult,
  type BlockResponseAccepted,
  type BlockResponseRejected,
  type SignerMessageBlockProposal,
} from '@stacks/codec';
import {
  NewBlockMessage,
  StackerDbChunksMessage,
  StackerDbChunksModifiedSlot,
} from '@stacks/node-publisher-client';

export interface ParsedNakamotoBlock {
  blockHeight: number;
  blockHash: string;
  burnBlockHeight: number;
  burnBlockHash: string;
  indexBlockHash: string;
  tenureHeight: number | null;
  blockTime: number;
  signerSignatures: string[];
  signerBitvec: string | null;
  signerPubKeys: string[];
  rewardSet: ParsedRewardSet | null;
  cycleNumber: number | null;
}

export interface ParsedRewardSet {
  pox_ustx_threshold: string; // "666720000000000"
  rewarded_addresses: string[]; // burnchain (btc) addresses
  signers?: {
    signing_key: string; // "03a80704b1eb07b4d526f069d6ac592bb9b8216bcf1734fa40badd8f9867b4c79e",
    weight: number; // 1,
    stacked_amt: string; // "3000225000000000"
  }[];
  start_cycle_state: {
    missed_reward_slots: [];
  };
}

export function parseNakamotoBlockMsg(block: NewBlockMessage): ParsedNakamotoBlock {
  const signerPubkeys = recoverBlockSignerPubkeys(block);
  const blockData: ParsedNakamotoBlock = {
    blockHeight: block.block_height,
    blockHash: block.block_hash,
    burnBlockHeight: block.burn_block_height,
    burnBlockHash: block.burn_block_hash,
    indexBlockHash: block.index_block_hash,
    tenureHeight: block.tenure_height ?? null,
    blockTime: block.block_time ?? 0,
    signerSignatures: block.signer_signature ?? [],
    signerBitvec: block.signer_bitvec ?? null,
    rewardSet: block.reward_set ?? null,
    cycleNumber: block.cycle_number ?? null,
    signerPubKeys: signerPubkeys,
  };
  return blockData;
}

interface ChunkMetadata {
  pubkey: string;
  contract: string;
  sig: string;
}

export interface BlockProposalChunkType extends ChunkMetadata {
  messageType: 'BlockProposal';
  blockProposal: ReturnType<typeof mapBlockProposal>;
}

export interface BlockResponseChunkType extends ChunkMetadata {
  messageType: 'BlockResponse';
  blockResponse: ReturnType<typeof mapBlockResponse>;
}

export interface BlockPushedChunkType extends ChunkMetadata {
  messageType: 'BlockPushed';
  blockPushed: ReturnType<typeof mapNakamotoBlock>;
}

export interface MockProposalChunkType extends ChunkMetadata {
  messageType: 'MockProposal';
}

export interface MockSignatureChunkType extends ChunkMetadata {
  messageType: 'MockSignature';
}

export interface MockBlockChunkType extends ChunkMetadata {
  messageType: 'MockBlock';
}

// https://github.com/stacks-network/stacks-core/blob/9d4cc3acd2c07d103b16750c1f3bdd6bf99a5232/libsigner/src/v0/messages.rs#L551
export interface StateMachineUpdate extends ChunkMetadata {
  messageType: 'StateMachineUpdate';
}

// https://github.com/stacks-network/stacks-core/blob/develop/libsigner/src/v0/messages.rs#L191
export interface BlockPreCommitChunkType extends ChunkMetadata {
  messageType: 'BlockPreCommit';
}

export type ParsedStackerDbChunk =
  | BlockProposalChunkType
  | BlockResponseChunkType
  | BlockPushedChunkType
  | MockProposalChunkType
  | MockSignatureChunkType
  | MockBlockChunkType
  | StateMachineUpdate
  | BlockPreCommitChunkType;

export function parseStackerDbChunk(chunk: StackerDbChunksMessage): ParsedStackerDbChunk[] {
  return chunk.modified_slots.flatMap(msg => {
    return {
      contract: chunk.contract_id.name,
      pubkey: recoverChunkSlotPubkey(msg).pubkey,
      sig: msg.sig,
      ...parseSignerMessage(msg.data),
    };
  });
}

function recoverBlockSignerPubkeys(block: NewBlockMessage): string[] {
  const sigHash = Buffer.from(block.signer_signature_hash.replace(/^0x/, ''), 'hex');

  return (
    block.signer_signature?.map(signerSig => {
      const signerSigBuff = Buffer.from(signerSig.replace(/^0x/, ''), 'hex');
      const recid = signerSigBuff[0]; // recovery ID (first byte of the signature)
      const sig = signerSigBuff.subarray(1); // actual signature (remaining 64 bytes)

      const pubkey = secp.Signature.fromCompact(sig)
        .addRecoveryBit(recid)
        .recoverPublicKey(sigHash);

      return pubkey.toHex();
    }) ?? []
  );
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/v0/messages.rs#L206
function parseSignerMessage(data: string) {
  const msg = decodeSignerMessage(data);

  switch (msg.type_id) {
    case SignerMessageTypeID.BlockProposal:
      return {
        messageType: 'BlockProposal',
        blockProposal: mapBlockProposal(msg.block_proposal),
      } as const;
    case SignerMessageTypeID.BlockResponse:
      return {
        messageType: 'BlockResponse',
        blockResponse: mapBlockResponse(msg.block_response),
      } as const;
    case SignerMessageTypeID.BlockPushed:
      return {
        messageType: 'BlockPushed',
        blockPushed: mapNakamotoBlock(msg.block_pushed),
      } as const;
    case SignerMessageTypeID.MockProposal:
      return { messageType: 'MockProposal' } as const;
    case SignerMessageTypeID.MockSignature:
      return { messageType: 'MockSignature' } as const;
    case SignerMessageTypeID.MockBlock:
      return { messageType: 'MockBlock' } as const;
    case SignerMessageTypeID.StateMachineUpdate:
      return { messageType: 'StateMachineUpdate' } as const;
    case SignerMessageTypeID.BlockPreCommit:
      return { messageType: 'BlockPreCommit' } as const;
    default:
      throw new Error(`Unknown signer message type: ${(msg as { type_id: number }).type_id}`);
  }
}

/** Map a codec-decoded Nakamoto block to the fields consumed by the ingestion layer. */
function mapNakamotoBlock(block: DecodedNakamotoBlockResult) {
  return {
    blockHash: block.header.block_hash,
    indexBlockHash: block.header.index_block_hash,
    header: {
      chainLength: block.header.chain_length,
      timestamp: block.header.timestamp,
    },
  };
}

function mapBlockProposal(proposal: SignerMessageBlockProposal['block_proposal']) {
  return {
    block: mapNakamotoBlock(proposal.block),
    burnHeight: proposal.burn_height,
    rewardCycle: proposal.reward_cycle,
  };
}

function mapBlockResponse(response: BlockResponseAccepted | BlockResponseRejected) {
  // Older signer versions omit metadata; keep it optional (null when absent) to
  // match the ingestion contract, which reads it as `metadata?.server_version`.
  const metadata = response.metadata
    ? { server_version: response.metadata.server_version }
    : null;
  if (response.response_type === 'accepted') {
    return {
      type: 'accepted',
      signerSignatureHash: response.signer_signature_hash,
      signature: response.signature,
      metadata,
    } as const;
  }
  return {
    type: 'rejected',
    reason: response.reason,
    reasonCode: {
      rejectCode: response.reason_code.reject_code_name,
      validateRejectCode: response.reason_code.validate_reject_code_name ?? null,
    },
    signerSignatureHash: response.signer_signature_hash,
    chainId: response.chain_id,
    signature: response.signature,
    metadata,
  } as const;
}

/** Convert a u32 integer into a 4 byte big-endian buffer */
function toU32BeBytes(num: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(num, 0);
  return buf;
}

/** Get the digest to sign that authenticates this chunk data and metadata */
function authDigest(slot: StackerDbChunksModifiedSlot): Buffer {
  const hasher = crypto.createHash('sha512-256');
  hasher.update(toU32BeBytes(slot.slot_id));
  hasher.update(toU32BeBytes(slot.slot_version));

  // Calculate the hash of the chunk bytes. This is the SHA512/256 hash of the data
  const dataHash = crypto.hash('sha512-256', Buffer.from(slot.data, 'hex'), 'buffer');
  hasher.update(dataHash);

  return hasher.digest();
}

function recoverChunkSlotPubkey(slot: StackerDbChunksModifiedSlot) {
  const digest = authDigest(slot);
  const sigBuff = Buffer.from(slot.sig, 'hex');

  const recid = sigBuff[0]; // recovery ID (first byte of the signature)
  const sig = sigBuff.subarray(1); // actual signature (remaining 64 bytes)

  const pubkey = secp.Signature.fromCompact(sig).addRecoveryBit(recid).recoverPublicKey(digest);

  return {
    pubkey: pubkey.toHex(),
    // pubkeyHash: crypto.hash('ripemd160', pubkey.toRawBytes(), 'hex'),
  };
}
