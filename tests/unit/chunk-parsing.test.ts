import { describe, test } from 'node:test';
import * as assert from 'node:assert';
import { StackerDbChunksMessage } from '@stacks/node-publisher-client';
import { parseStackerDbChunk } from '../../src/event-stream/msg-parsing.ts';

describe('Chunk parsing tests', () => {
  test('parse block response with ValidationFailed(InvalidParentBlock)', () => {
    const payload = `{"contract_id":{"issuer":[22,[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],"name":"signers-1-1"},"modified_slots":[{"data":"010100000038426c6f636b206973206e6f7420686967686572207468616e20746865206869676865737420626c6f636b20696e206974732074656e7572650008257441ee3785f859ed3a302f2ee19b4ecb3fc3e494c9f982011d6a49a29b36df0000000100f82c5e8637fe8eaf0cee174700841e921c7c16b6163b3804a780f7cbfe35fa8b79a3a2f22878dd66caff6f2ba891b647991147326bbb10de079759edcda3142a00000055737461636b732d7369676e657220332e312e302e302e392e30202872656c656173652f332e312e302e302e393a636262323264362b2c2072656c65617365206275696c642c206c696e7578205b7838365f36345d29030000000a00000000681bbe160008","sig":"01031fe2a0528a2cea71b5cc23e660b5ccddadb730caee4cc0a8388d6df8c5c8fa52d75d243c840c2f34bbc68878b63e7bbb2a6fb0711a843d37f390d366f6d0b4","slot_id":10,"slot_version":176385}]}`;
    const payloadJson: StackerDbChunksMessage = JSON.parse(payload);
    const parsed = parseStackerDbChunk(payloadJson);
    // Reject-code names come from stacks-core's current `ValidateRejectCode` enum
    // (via @stacks/codec), where inner code 8 is `invalid_parent_block`.
    assert.deepStrictEqual(parsed[0], {
      contract: 'signers-1-1',
      pubkey: '025588e24e2bf387fe8cc7bccba1aac7fe599b96724892431e992a40d06e8fe220',
      sig: '01031fe2a0528a2cea71b5cc23e660b5ccddadb730caee4cc0a8388d6df8c5c8fa52d75d243c840c2f34bbc68878b63e7bbb2a6fb0711a843d37f390d366f6d0b4',
      messageType: 'BlockResponse',
      blockResponse: {
        type: 'rejected',
        reason: 'Block is not higher than the highest block in its tenure',
        reasonCode: {
          rejectCode: 'validation_failed',
          validateRejectCode: 'invalid_parent_block',
        },
        signerSignatureHash:
          '0x257441ee3785f859ed3a302f2ee19b4ecb3fc3e494c9f982011d6a49a29b36df',
        chainId: 1,
        signature:
          '0x00f82c5e8637fe8eaf0cee174700841e921c7c16b6163b3804a780f7cbfe35fa8b79a3a2f22878dd66caff6f2ba891b647991147326bbb10de079759edcda3142a',
        metadata: {
          server_version:
            'stacks-signer 3.1.0.0.9.0 (release/3.1.0.0.9:cbb22d6+, release build, linux [x86_64])',
        },
      },
    });
  });

  // Reject reasons added in stacks-core 84224a59 (@stacks/codec 2.2.0). libsigner
  // has no dedicated `RejectCode` for them, so they arrive as `sortition_view_mismatch`.
  for (const [reasonName, data, reason] of [
    [
      'proposal_too_old',
      '01010000004d54686520626c6f636b2070726f706f73616c2773206865616465722074696d657374616d70206973206f6c646572207468616e20746865206d6178696d756d2070726f706f73616c206167652e040303030303030303030303030303030303030303030303030303030303030303800000000045381ac619d341cc22233dc28685e3b5d9c09047c4e64a8ff9902af1bb2a4a4f0714f2e67fb04ad683991f17ab1bceea7830ec8151cb0a6b5391cc1a4a6a82060000003e737461636b732d7369676e657220342e302e352028383432323461353930382c206465627567206275696c642c206d61636f73205b616172636836345d290500000012000000006553f10012000000006553f10100',
      "The block proposal's header timestamp is older than the maximum proposal age.",
    ],
    [
      'reward_cycle_retired',
      '01010000006a4120736f72746974696f6e20686173206f6363757272656420696e2061206c6174657220726577617264206379636c653b2074686973207369676e657220736574206e6f206c6f6e676572207369676e7320666f72207468652070726f706f7365642074656e7572652e040303030303030303030303030303030303030303030303030303030303030303800000000045381ac619d341cc22233dc28685e3b5d9c09047c4e64a8ff9902af1bb2a4a4f0714f2e67fb04ad683991f17ab1bceea7830ec8151cb0a6b5391cc1a4a6a82060000003e737461636b732d7369676e657220342e302e352028383432323461353930382c206465627567206275696c642c206d61636f73205b616172636836345d290500000012000000006553f10013000000006553f10100',
      'A sortition has occurred in a later reward cycle; this signer set no longer signs for the proposed tenure.',
    ],
  ]) {
    test(`parse block response rejected with ${reasonName}`, () => {
      const payloadJson: StackerDbChunksMessage = {
        contract_id: { issuer: [22, Array(20).fill(0)], name: 'signers-1-1' },
        modified_slots: [
          {
            data,
            sig: '01031fe2a0528a2cea71b5cc23e660b5ccddadb730caee4cc0a8388d6df8c5c8fa52d75d243c840c2f34bbc68878b63e7bbb2a6fb0711a843d37f390d366f6d0b4',
            slot_id: 10,
            slot_version: 1,
          },
        ],
      } as unknown as StackerDbChunksMessage;
      const parsed = parseStackerDbChunk(payloadJson);
      assert.strictEqual(parsed[0].messageType, 'BlockResponse');
      assert.deepStrictEqual(parsed[0].blockResponse, {
        type: 'rejected',
        reason,
        reasonCode: {
          rejectCode: 'sortition_view_mismatch',
          validateRejectCode: null,
        },
        signerSignatureHash:
          '0x0303030303030303030303030303030303030303030303030303030303030303',
        chainId: 2147483648,
        signature:
          '0x0045381ac619d341cc22233dc28685e3b5d9c09047c4e64a8ff9902af1bb2a4a4f0714f2e67fb04ad683991f17ab1bceea7830ec8151cb0a6b5391cc1a4a6a8206',
        metadata: {
          server_version: 'stacks-signer 4.0.5 (84224a5908, debug build, macos [aarch64])',
        },
      });
    });
  }
});
