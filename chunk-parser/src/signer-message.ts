import { BufferCursor } from "./common";

const SignerMessageTypePrefix = {
  BlockProposal: 0,
  BlockResponse: 1,
  BlockPushed: 2,
  MockProposal: 3,
  MockSignature: 4,
  MockBlock: 5,
} as const;

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/v0/messages.rs#L206
export function parseSignerMessage(msg: BufferCursor) {
  const typePrefix = msg.readU8Enum(SignerMessageTypePrefix);

  switch (typePrefix) {
    case SignerMessageTypePrefix.BlockProposal:
      return parseBlockProposal(msg);
    case SignerMessageTypePrefix.BlockResponse:
      return parseBlockResponse(msg);
    case SignerMessageTypePrefix.BlockPushed:
      return parseBlockPushed(msg);
    case SignerMessageTypePrefix.MockProposal:
      return parseMockProposal(msg);
    case SignerMessageTypePrefix.MockSignature:
      return parseMockSignature(msg);
    case SignerMessageTypePrefix.MockBlock:
      return parseMockBlock(msg);
    default:
      throw new Error(`Unknown message type prefix: ${typePrefix}`);
  }
}

const BlockResponseTypePrefix = {
  // An accepted block response
  Accepted: 0,
  // A rejected block response
  Rejected: 1
} as const;

function parseBlockResponse(msg: BufferCursor) {
  const typePrefix = msg.readU8Enum(BlockResponseTypePrefix);
  switch (typePrefix) {
    case BlockResponseTypePrefix.Accepted: {
      const hash = msg.readBytes(32);
      const sig = msg.readBytes(65);
      return { type: 'accepted', hash, sig } as const;
    }
    case BlockResponseTypePrefix.Rejected: {
      const reason = msg.readVecString();
      const reasonCode = parseBlockResponseRejectCode(msg);
      const signerSignatureHash = msg.readBytes(32);
      const chainId = msg.readU32BE();
      const signature = msg.readBytes(65);
      return { type: 'rejected', reason, reasonCode, signerSignatureHash, chainId, signature } as const;
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

const ValidateRejectCode = {
  BadBlockHash: 0,
  BadTransaction: 1,
  InvalidBlock: 2,
  ChainstateError: 3,
  UnknownParent: 4,
  NonCanonicalTenure: 5,
  NoSuchTenure: 6
} as const;

function parseBlockResponseRejectCode(msg: BufferCursor) {
  const rejectCode = msg.readU8Enum(RejectCodeTypePrefix);
  switch (rejectCode) {
    case RejectCodeTypePrefix.ValidationFailed: {
      const validateRejectCode = msg.readU8Enum(ValidateRejectCode);
      return { rejectCode, validateRejectCode } as const;
    }
    case RejectCodeTypePrefix.ConnectivityIssues:
    case RejectCodeTypePrefix.RejectedInPriorRound:
    case RejectCodeTypePrefix.NoSortitionView:
    case RejectCodeTypePrefix.SortitionViewMismatch:
    case RejectCodeTypePrefix.TestingDirective:
      return { rejectCode } as const;
    default:
      throw new Error(`Unknown reject code type prefix: ${rejectCode}`);
  }
}

function parseBlockPushed(msg: BufferCursor) {
  const block = parseNakamotoBlock(msg);
  return block;
}

function parseMockProposal(msg: BufferCursor) {
  console.log('MockProposal ignored');
}

function parseMockSignature(msg: BufferCursor) {
  console.log('MockSignature ignored');
}

function parseMockBlock(msg: BufferCursor) {
  console.log('MockBlock ignored');
}

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/libsigner/src/events.rs#L74
function parseBlockProposal(msg: BufferCursor) {
  const block = parseNakamotoBlock(msg);
  const burnHeight = msg.readU64BE();
  const rewardCycle = msg.readU64BE();
  return { block, burnHeight, rewardCycle };
}

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/nakamoto/mod.rs#L4547-L4550
function parseNakamotoBlock(msg: BufferCursor) {
  const header = parseNakamotoBlockHeader(msg);
  const tx = msg.readArray(parseStacksTransaction);
  return { header, tx };
}

const TransactionAnchorMode = {
  OnChainOnly: 1,
  OffChainOnly: 2,
  Any: 3,
} as const;

const TransactionPostConditionMode = {
  Allow: 0x01,
  Deny: 0x02,
} as const;

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/stacks/transaction.rs#L682-L692
function parseStacksTransaction(msg: BufferCursor) {
  // write_next(fd, &(self.version as u8))?;
  const version = msg.readU8();

  // write_next(fd, &self.chain_id)?;
  const chainId = msg.readU32BE();

  // write_next(fd, &self.auth)?;
  const auth = parseStacksTransactionAuth(msg);

  // write_next(fd, &(self.anchor_mode as u8))?;
  const anchorMode = msg.readU8Enum(TransactionAnchorMode);

  // write_next(fd, &(self.post_condition_mode as u8))?;
  const postConditionMode = msg.readU8Enum(TransactionPostConditionMode);

  // write_next(fd, &self.post_conditions)?;
  const postConditions = msg.readArray(parseStacksTransactionPostCondition);

  // write_next(fd, &self.payload)?;
  const payload = parseTransactionPayload(msg);

  return {
    version,
    chainId,
    auth,
    anchorMode,
    postConditionMode,
    postConditions,
    payload,
  }
}

const TransactionPayloadID = {
  TokenTransfer: 0,
  SmartContract: 1,
  ContractCall: 2,
  PoisonMicroblock: 3,
  Coinbase: 4,
  CoinbaseToAltRecipient: 5,
  VersionedSmartContract: 6,
  TenureChange: 7,
  NakamotoCoinbase: 8,
} as const;

// https://github.com/stacks-network/stacks-core/blob/cd702e7dfba71456e4983cf530d5b174e34507dc/stackslib/src/chainstate/stacks/transaction.rs#L249
function parseTransactionPayload(msg: BufferCursor) {
  const payloadId = msg.readU8Enum(TransactionPayloadID);
  throw new Error(`Not yet implemented, payload ID: ${payloadId}`);
}

const AssetInfoID = {
  STX: 0,
  FungibleAsset: 1,
  NonfungibleAsset: 2,
} as const;

const FungibleConditionCode = {
  SentEq: 0x01,
  SentGt: 0x02,
  SentGe: 0x03,
  SentLt: 0x04,
  SentLe: 0x05,
} as const;

const NonfungibleConditionCode = {
  Sent: 0x10,
  NotSent: 0x11,
} as const;

function parseStacksTransactionPostCondition(msg: BufferCursor) {
  const assetInfoId = msg.readU8Enum(AssetInfoID);
  switch (assetInfoId) {
    case AssetInfoID.STX: {
      const principal = parsePostConditionPrincipal(msg);
      const conditionCode = msg.readU8Enum(FungibleConditionCode);
      const amount = msg.readU64BE();
      return { assetInfoId, principal, conditionCode, amount } as const;
    }
    case AssetInfoID.FungibleAsset: {
      const principal = parsePostConditionPrincipal(msg);
      const asset = parseAssetInfo(msg);
      const conditionCode = msg.readU8Enum(FungibleConditionCode);
      const amount = msg.readU64BE();
      return { assetInfoId, principal, asset, conditionCode, amount } as const;
    }
    case AssetInfoID.NonfungibleAsset: {
      const principal = parsePostConditionPrincipal(msg);
      const asset = parseAssetInfo(msg);
      const assetValue = parseClarityValue(msg);
      const conditionCode = msg.readU8Enum(NonfungibleConditionCode);
      return { assetInfoId, principal, asset, assetValue, conditionCode } as const;
    }
    default:
      throw new Error(`Unknown asset info ID: ${assetInfoId}`);
  }
}

function parseClarityValue(msg: BufferCursor) {
  // TODO: grab this from somewhere else where it's already implemented FML ...
  return {};
}

function parseAssetInfo(msg: BufferCursor) {
  const contractAddress = {
    version: msg.readU8(),
    hashbytes: msg.readBytes(20),
  };
  const contractName = msg.readUtf8String();
  const assetName = msg.readUtf8String();
  return { contractAddress, contractName, assetName } as const;
}

const PostConditionPrincipalID = {
  Origin: 0x01,
  Standard: 0x02,
  Contract: 0x03,
} as const;

function parsePostConditionPrincipal(msg: BufferCursor) {
  const principalId = msg.readU8Enum(PostConditionPrincipalID);
  switch (principalId) {
    case PostConditionPrincipalID.Origin: {
      return { principalId } as const;
    }
    case PostConditionPrincipalID.Standard: {
      const stacksAddress = {
        version: msg.readU8(),
        hashbytes: msg.readBytes(20),
      };
      return { principalId, stacksAddress } as const;
    }
    case PostConditionPrincipalID.Contract: {
      const stacksAddress = {
        version: msg.readU8(),
        hashbytes: msg.readBytes(20),
      };
      const contractName = msg.readUtf8String();
      return { principalId, stacksAddress, contractName } as const;
    }
    default:
      throw new Error(`Unknown principal ID: ${principalId}`);
  }
}

const StacksTransactionAuthType = {
  AuthStandard: 0x04,
  AuthSponsored: 0x05,
} as const;

function parseStacksTransactionAuth(msg: BufferCursor) {
  const authType = msg.readU8Enum(StacksTransactionAuthType);
  switch (authType) {
    case StacksTransactionAuthType.AuthStandard: {
      const originCondition = parseStacksTransactionAuthSpendingCondition(msg);
      return { originCondition } as const;
    }
    case StacksTransactionAuthType.AuthSponsored: {
      const originCondition = parseStacksTransactionAuthSpendingCondition(msg);
      const sponsorCondition = parseStacksTransactionAuthSpendingCondition(msg);
      return { originCondition, sponsorCondition } as const;
    }
    default:
      throw new Error(`Unknown auth type: ${authType}`);
  }
}

const HashMode = {
  P2PKH: 0x00, // singlesig
  P2WPKH: 0x02, // singlesig
  P2SH: 0x01, // multisig
  P2WSH: 0x03, // multisig
  OrderIndependentP2SH: 0x05, // order independent multisig
  OrderIndependentP2WSH: 0x07, // order independent multisig
} as const;

const TransactionAuthFieldID = {
  PublicKeyCompressed: 0x00,
  PublicKeyUncompressed: 0x01,
  SignatureCompressed: 0x02,
  SignatureUncompressed: 0x03,
} as const;

function parseStacksTransactionAuthSpendingCondition(msg: BufferCursor) {
  const hashMode = msg.readU8Enum(HashMode);
  switch (hashMode) {
    case HashMode.P2PKH:
    case HashMode.P2WPKH: {
      const signer = msg.readBytes(20);
      const nonce = msg.readU64BE();
      const txFee = msg.readU64BE();
      const keyEncoding = msg.readU8();
      const signature = msg.readBytes(65);
      return { signer, nonce, txFee, keyEncoding, signature } as const;
    }
    case HashMode.P2SH:
    case HashMode.P2WSH: {
      const signer = msg.readBytes(20);
      const nonce = msg.readU64BE();
      const txFee = msg.readU64BE();
      const fields = msg.readArray(parseTransactionAuthField);
      const signaturesRequired = msg.readU16BE();
      return { signer, nonce, txFee, fields, signaturesRequired } as const;
    }
    case HashMode.OrderIndependentP2SH:
    case HashMode.OrderIndependentP2WSH: {
      const signer = msg.readBytes(20);
      const nonce = msg.readU64BE();
      const txFee = msg.readU64BE();
      const fields = msg.readArray(parseTransactionAuthField);
      const signaturesRequired = msg.readU16BE();
      return { signer, nonce, txFee, fields, signaturesRequired } as const;
    }
    default:
      throw new Error(`Unknown hash mode: ${hashMode}`);
  }
}

function parseTransactionAuthField(msg: BufferCursor) {
  const fieldId = msg.readU8Enum(TransactionAuthFieldID);
  switch (fieldId) {
    case TransactionAuthFieldID.PublicKeyCompressed:
      return { compressed: true, pubkey: msg.readBytes(33) };
    case TransactionAuthFieldID.PublicKeyUncompressed:
      return { compressed: false, pubkey: msg.readBytes(33) };
    case TransactionAuthFieldID.SignatureCompressed: 
      return { compressed: true, signature: msg.readBytes(65) };
    case TransactionAuthFieldID.SignatureUncompressed:
      return { compressed: false, signature: msg.readBytes(65) };
    default:
      throw new Error(`Unknown field ID: ${fieldId}`);
  }
}

// https://github.com/stacks-network/stacks-core/blob/30acb47f0334853def757b877773ae3ec45c6ba5/stackslib/src/chainstate/nakamoto/mod.rs#L696-L711
function parseNakamotoBlockHeader(msg: BufferCursor) {
  // write_next(fd, &self.version)?;
  const version = msg.readU8();

  // write_next(fd, &self.chain_length)?;
  const chainLength = msg.readU64BE();

  // write_next(fd, &self.burn_spent)?;
  const burnSpent = msg.readU64BE();

  // write_next(fd, &self.consensus_hash)?;
  const consensusHash = msg.readBytes(20);

  // write_next(fd, &self.parent_block_id)?;
  const parentBlockId = msg.readBytes(32);

  // write_next(fd, &self.tx_merkle_root)?;
  const txMerkleRoot = msg.readBytes(32);

  // write_next(fd, &self.state_index_root)?;
  const stateIndexRoot = msg.readBytes(32);

  // write_next(fd, &self.timestamp)?;
  const timestamp = msg.readU64BE();

  // write_next(fd, &self.miner_signature)?;
  const minerSignature = msg.readBytes(65);

  // write_next(fd, &self.signer_signature)?;
  const signerSignature = msg.readArray(c => c.readBytes(65));

  // write_next(fd, &self.pox_treatment)?;
  const poxTreatment = msg.readBitVec();

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
