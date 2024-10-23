import { BufferCursor, BufferWriter, getEnumName } from "./common";
import { deserializeTransaction, BytesReader } from '@stacks/transactions';
import crypto from 'node:crypto';

enum SignerMessageTypePrefix {
  BlockProposal = 0,
  BlockResponse = 1,
  BlockPushed = 2,
  MockProposal = 3,
  MockSignature = 4,
  MockBlock = 5,
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/v0/messages.rs#L206
export function parseSignerMessage(msg: Buffer) {
  const cursor = new BufferCursor(msg);
  const messageType = cursor.readU8Enum(SignerMessageTypePrefix);
  
  switch (messageType) {
    case SignerMessageTypePrefix.BlockProposal:
      return {
        messageType: 'BlockProposal',
        blockProposal: parseBlockProposal(cursor),
      } as const;
    case SignerMessageTypePrefix.BlockResponse:
      return {
        messageType: 'BlockResponse',
        blockResponse: parseBlockResponse(cursor),
      } as const;
    case SignerMessageTypePrefix.BlockPushed:
      return {
        messageType: 'BlockPushed',
        blockPushed: parseBlockPushed(cursor),
      } as const;
    case SignerMessageTypePrefix.MockProposal:
      return {
        messageType: 'MockProposal',
        mockProposal: parseMockProposal(cursor),
      } as const;
    case SignerMessageTypePrefix.MockSignature:
      return {
        messageType: 'MockSignature',
        mockSignature: parseMockSignature(cursor),
      } as const;
    case SignerMessageTypePrefix.MockBlock:
      return {
        messageType: 'MockBlock',
        mockBlock: parseMockBlock(cursor),
      } as const;
    default:
      throw new Error(`Unknown message type prefix: ${messageType}`);
  }
}

enum BlockResponseTypePrefix {
  // An accepted block response
  Accepted = 0,
  // A rejected block response
  Rejected = 1
}

interface SignerMessageMetadata {
  server_version: string;
}

function parseSignerMessageMetadata(cursor: BufferCursor): SignerMessageMetadata | null {
  if (cursor.buffer.length === 0) {
    return null;
  }
  return { server_version: cursor.readVecString() };
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/v0/messages.rs#L650
function parseBlockResponse(cursor: BufferCursor) {
  const typePrefix = cursor.readU8Enum(BlockResponseTypePrefix);
  switch (typePrefix) {
    case BlockResponseTypePrefix.Accepted: {
      const signerSignatureHash = cursor.readBytes(32).toString('hex');
      const sig = cursor.readBytes(65).toString('hex');
      const metadata = parseSignerMessageMetadata(cursor);
      return { type: 'accepted', signerSignatureHash, sig, metadata } as const;
    }
    case BlockResponseTypePrefix.Rejected: {
      const reason = cursor.readVecString();
      const reasonCode = parseBlockResponseRejectCode(cursor);
      const signerSignatureHash = cursor.readBytes(32).toString('hex');
      const chainId = cursor.readU32BE();
      const signature = cursor.readBytes(65).toString('hex');
      const metadata = parseSignerMessageMetadata(cursor);
      return { type: 'rejected', reason, reasonCode, signerSignatureHash, chainId, signature, metadata } as const;
    }
    default:
      throw new Error(`Unknown block response type prefix: ${typePrefix}`);
  }
}

const RejectCodeTypePrefix = {
  // The block was rejected due to validation issues
  ValidationFailed: 0,
  // The block was rejected due to connectivity issues with the signer
  ConnectivityIssues: 1,
  // The block was rejected in a prior round
  RejectedInPriorRound: 2,
  // The block was rejected due to no sortition view
  NoSortitionView: 3,
  // The block was rejected due to a mismatch with expected sortition view
  SortitionViewMismatch: 4,
  // The block was rejected due to a testing directive
  TestingDirective: 5
} as const;

enum ValidateRejectCode {
  BadBlockHash = 0,
  BadTransaction = 1,
  InvalidBlock = 2,
  ChainstateError = 3,
  UnknownParent = 4,
  NonCanonicalTenure = 5,
  NoSuchTenure = 6
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/v0/messages.rs#L812
function parseBlockResponseRejectCode(cursor: BufferCursor) {
  const rejectCode = cursor.readU8Enum(RejectCodeTypePrefix);
  switch (rejectCode) {
    case RejectCodeTypePrefix.ValidationFailed: {
      const validateRejectCode = cursor.readU8Enum(ValidateRejectCode);
      return {
        rejectCode: getEnumName(RejectCodeTypePrefix, rejectCode),
        validateRejectCode: getEnumName(ValidateRejectCode, validateRejectCode),
      } as const;
    }
    case RejectCodeTypePrefix.ConnectivityIssues:
    case RejectCodeTypePrefix.RejectedInPriorRound:
    case RejectCodeTypePrefix.NoSortitionView:
    case RejectCodeTypePrefix.SortitionViewMismatch:
    case RejectCodeTypePrefix.TestingDirective:
      return { 
        rejectCode: getEnumName(RejectCodeTypePrefix, rejectCode),
      } as const;
    default:
      throw new Error(`Unknown reject code type prefix: ${rejectCode}`);
  }
}

function parseBlockPushed(cursor: BufferCursor) {
  const block = parseNakamotoBlock(cursor);
  return block;
}

function parseMockProposal(cursor: BufferCursor) {
  console.log('MockProposal ignored');
}

function parseMockSignature(cursor: BufferCursor) {
  console.log('MockSignature ignored');
}

function parseMockBlock(cursor: BufferCursor) {
  console.log('MockBlock ignored');
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/events.rs#L74
function parseBlockProposal(cursor: BufferCursor) {
  const block = parseNakamotoBlock(cursor);
  const burnHeight = cursor.readU64BE();
  const rewardCycle = cursor.readU64BE();
  return { block, burnHeight, rewardCycle };
}

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/nakamoto/mod.rs#L4547-L4550
function parseNakamotoBlock(cursor: BufferCursor) {
  const header = parseNakamotoBlockHeader(cursor);
  const blockHash = getNakamotoBlockHash(header);
  const indexBlockHash = getNakamotoIndexBlockHash(blockHash, header.consensusHash);
  const tx = cursor.readArray(parseStacksTransaction);
  return { blockHash, indexBlockHash, header, tx };
}

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/stacks/transaction.rs#L682-L692
function parseStacksTransaction(cursor: BufferCursor) {
  const bytesReader = new BytesReader(cursor.buffer);
  const stacksTransaction = deserializeTransaction(bytesReader);
  cursor.buffer = cursor.buffer.subarray(bytesReader.consumed);
  return stacksTransaction;
}

// https://github.com/stacks-network/stacks-core/blob/a2dcd4c3ffdb625a6478bb2c0b23836bc9c72f9f/stacks-common/src/types/chainstate.rs#L268-L279
function getNakamotoIndexBlockHash(blockHash: string, consensusHash: string): string {
  const hasher = crypto.createHash('sha512-256');
  hasher.update(Buffer.from(blockHash, 'hex'));
  hasher.update(Buffer.from(consensusHash, 'hex'));
  return hasher.digest('hex');
}

// https://github.com/stacks-network/stacks-core/blob/a2dcd4c3ffdb625a6478bb2c0b23836bc9c72f9f/stackslib/src/chainstate/nakamoto/mod.rs#L764-L795
function getNakamotoBlockHash(blockHeader: ReturnType<typeof parseNakamotoBlockHeader>): string {
  const blockHeaderBytes = new BufferWriter();
  blockHeaderBytes.writeU8(blockHeader.version);
  blockHeaderBytes.writeU64BE(blockHeader.chainLength);
  blockHeaderBytes.writeU64BE(blockHeader.burnSpent);
  blockHeaderBytes.writeBytes(Buffer.from(blockHeader.consensusHash, 'hex'));
  blockHeaderBytes.writeBytes(Buffer.from(blockHeader.parentBlockId, 'hex'));
  blockHeaderBytes.writeBytes(Buffer.from(blockHeader.txMerkleRoot, 'hex'));
  blockHeaderBytes.writeBytes(Buffer.from(blockHeader.stateIndexRoot, 'hex'));
  blockHeaderBytes.writeU64BE(blockHeader.timestamp);
  blockHeaderBytes.writeBytes(Buffer.from(blockHeader.minerSignature, 'hex'));
  blockHeaderBytes.writeBitVec(blockHeader.poxTreatment);
  const blockHash = crypto.hash('sha512-256', blockHeaderBytes.buffer, 'hex');
  return blockHash;
}

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/nakamoto/mod.rs#L696-L711
function parseNakamotoBlockHeader(cursor: BufferCursor) {
  const version = cursor.readU8();
  const chainLength = cursor.readU64BE();
  const burnSpent = cursor.readU64BE();
  const consensusHash = cursor.readBytes(20).toString('hex');
  const parentBlockId = cursor.readBytes(32).toString('hex');
  const txMerkleRoot = cursor.readBytes(32).toString('hex');
  const stateIndexRoot = cursor.readBytes(32).toString('hex');
  const timestamp = cursor.readU64BE();
  const minerSignature = cursor.readBytes(65).toString('hex');
  const signerSignature = cursor.readArray(c => c.readBytes(65).toString('hex'));
  const poxTreatment = cursor.readBitVec();

  return {
    version,
    chainLength,
    burnSpent,
    consensusHash,
    parentBlockId,
    txMerkleRoot,
    stateIndexRoot,
    timestamp,
    minerSignature,
    signerSignature,
    poxTreatment,
  };
}

/* 

pub enum SignerMessage {
    /// The block proposal from miners for signers to observe and sign
    BlockProposal(BlockProposal),
    /// The block response from signers for miners to observe
    BlockResponse(BlockResponse),
    /// A block pushed from miners to the signers set
    BlockPushed(NakamotoBlock),
    /// A mock signature from the epoch 2.5 signers
    MockSignature(MockSignature),
    /// A mock message from the epoch 2.5 miners
    MockProposal(MockProposal),
    /// A mock block from the epoch 2.5 miners
    MockBlock(MockBlock),
} 

SignerMessage::BlockProposal(_) => SignerMessageTypePrefix::BlockProposal, // 0
SignerMessage::BlockResponse(_) => SignerMessageTypePrefix::BlockResponse, // 1
SignerMessage::BlockPushed(_) => SignerMessageTypePrefix::BlockPushed, // 2
SignerMessage::MockProposal(_) => SignerMessageTypePrefix::MockProposal, // 3
SignerMessage::MockSignature(_) => SignerMessageTypePrefix::MockSignature, // 4
SignerMessage::MockBlock(_) => SignerMessageTypePrefix::MockBlock, // 5

*/
