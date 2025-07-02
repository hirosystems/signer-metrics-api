## [0.13.4](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.3...v0.13.4) (2025-07-02)


### Bug Fixes

* update SNP lib ([#86](https://github.com/hirosystems/signer-metrics-api/issues/86)) ([6506bef](https://github.com/hirosystems/signer-metrics-api/commit/6506beffc13b79c6650f196e42ca2ab475f4ad16))

## [0.13.3](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.2...v0.13.3) (2025-05-08)


### Bug Fixes

* parsing new enums in the BlockResponse(ValidationFailed) chunks ([#83](https://github.com/hirosystems/signer-metrics-api/issues/83)) ([8078267](https://github.com/hirosystems/signer-metrics-api/commit/8078267a7aa95985c0fe19eea470b19358f13f67))

## [0.13.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.1...v0.13.2) (2025-04-18)


### Bug Fixes

* upgrade stacks.js to 7.0.6 ([#81](https://github.com/hirosystems/signer-metrics-api/issues/81)) ([0802b57](https://github.com/hirosystems/signer-metrics-api/commit/0802b57b5116d4a462e7a4bc125895059d386a1f))

## [0.13.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0...v0.13.1) (2025-04-16)


### Bug Fixes

* ignore `StateMachineUpdate` msg types while parsing ([#79](https://github.com/hirosystems/signer-metrics-api/issues/79)) ([18dc008](https://github.com/hirosystems/signer-metrics-api/commit/18dc0081703becd4b86004433460497dd22964da))

## [0.13.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.7...v0.13.0) (2025-04-11)


### Features

* ingest messages from redis ([#65](https://github.com/hirosystems/signer-metrics-api/issues/65)) ([43a0e81](https://github.com/hirosystems/signer-metrics-api/commit/43a0e815e4cfb54ee40c9d189ec3f14bda8c77c9)), closes [#66](https://github.com/hirosystems/signer-metrics-api/issues/66) [#66](https://github.com/hirosystems/signer-metrics-api/issues/66) [#70](https://github.com/hirosystems/signer-metrics-api/issues/70) [#69](https://github.com/hirosystems/signer-metrics-api/issues/69) [#71](https://github.com/hirosystems/signer-metrics-api/issues/71) [#73](https://github.com/hirosystems/signer-metrics-api/issues/73)

## [0.13.0-redis-stream.7](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.6...v0.13.0-redis-stream.7) (2025-04-10)


### Bug Fixes

* update stacks.js to fix tx parsing error ([9601efd](https://github.com/hirosystems/signer-metrics-api/commit/9601efde7d5eb083aead54b424b9a3c83edc0b4b))

## [0.13.0-redis-stream.6](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.5...v0.13.0-redis-stream.6) (2025-04-10)


### Bug Fixes

* more logging for threaded worker parser errors (addition 2) ([74c57fb](https://github.com/hirosystems/signer-metrics-api/commit/74c57fb77a3780c0211d9adffeddebd9514343b1))

## [0.13.0-redis-stream.5](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.4...v0.13.0-redis-stream.5) (2025-04-10)


### Bug Fixes

* more logging for threaded worker parser errors ([a5c8172](https://github.com/hirosystems/signer-metrics-api/commit/a5c81725362ef35e0acf1ac5ec96d8214e628e90))

## [0.13.0-redis-stream.4](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.3...v0.13.0-redis-stream.4) (2025-03-31)


### Bug Fixes

* sanitize redis client name string ([e0960da](https://github.com/hirosystems/signer-metrics-api/commit/e0960da28b4d87d0051388aa358e1d6f7263971d))

## [0.13.0-redis-stream.3](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.2...v0.13.0-redis-stream.3) (2025-03-31)


### Bug Fixes

* create optimized query to get current cycle signer weight percentages ([#70](https://github.com/hirosystems/signer-metrics-api/issues/70)) ([8bcb54b](https://github.com/hirosystems/signer-metrics-api/commit/8bcb54bde240070fa4ab078df1dda8c207ea251c))
* integrate custom metrics to private endpoint and add signer weight percentage metric ([#69](https://github.com/hirosystems/signer-metrics-api/issues/69)) ([d113b7c](https://github.com/hirosystems/signer-metrics-api/commit/d113b7c7b7a91d843989fbee1465a6e239959379))
* newest unconfirmed block propsal metric ([#71](https://github.com/hirosystems/signer-metrics-api/issues/71)) ([cb4b117](https://github.com/hirosystems/signer-metrics-api/commit/cb4b11754e8b1814d49cbbedfa2d6467e9b3aa05))
* optimize sql query used for the `signer_state_count` metric ([#73](https://github.com/hirosystems/signer-metrics-api/issues/73)) ([6394e58](https://github.com/hirosystems/signer-metrics-api/commit/6394e58c2a6d4668783e543dbc2c7e071ceda701))
* **prometheus:** adds prefix to each metric and fixes default prom port ([7825bb5](https://github.com/hirosystems/signer-metrics-api/commit/7825bb5604d8937195e67bc81c68f0dd487b260b))

## [0.13.0-redis-stream.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.13.0-redis-stream.1...v0.13.0-redis-stream.2) (2025-03-31)


### Bug Fixes

* close worker thread on process shutdown ([968374c](https://github.com/hirosystems/signer-metrics-api/commit/968374caadb8a1e0a6979a965dd719ef49f8fb9a))

## [0.12.7](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.6...v0.12.7) (2025-03-03)


### Bug Fixes

* optimize sql query used for the `signer_state_count` metric ([#73](https://github.com/hirosystems/signer-metrics-api/issues/73)) ([6394e58](https://github.com/hirosystems/signer-metrics-api/commit/6394e58c2a6d4668783e543dbc2c7e071ceda701))

## [0.12.6](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.5...v0.12.6) (2025-01-27)


### Bug Fixes

* newest unconfirmed block propsal metric ([#71](https://github.com/hirosystems/signer-metrics-api/issues/71)) ([cb4b117](https://github.com/hirosystems/signer-metrics-api/commit/cb4b11754e8b1814d49cbbedfa2d6467e9b3aa05))

## [0.12.5](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.4...v0.12.5) (2025-01-17)


### Bug Fixes

* create optimized query to get current cycle signer weight percentages ([#70](https://github.com/hirosystems/signer-metrics-api/issues/70)) ([8bcb54b](https://github.com/hirosystems/signer-metrics-api/commit/8bcb54bde240070fa4ab078df1dda8c207ea251c))

## [0.12.4](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.3...v0.12.4) (2025-01-17)


### Bug Fixes

* integrate custom metrics to private endpoint and add signer weight percentage metric ([#69](https://github.com/hirosystems/signer-metrics-api/issues/69)) ([d113b7c](https://github.com/hirosystems/signer-metrics-api/commit/d113b7c7b7a91d843989fbee1465a6e239959379))

## [0.12.3](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.2...v0.12.3) (2025-01-15)


### Bug Fixes

* **prometheus:** adds prefix to each metric and fixes default prom port ([7825bb5](https://github.com/hirosystems/signer-metrics-api/commit/7825bb5604d8937195e67bc81c68f0dd487b260b))

## [0.12.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.1...v0.12.2) (2024-12-17)


### Bug Fixes

* remove unused vercel url ([#64](https://github.com/hirosystems/signer-metrics-api/issues/64)) ([e05712d](https://github.com/hirosystems/signer-metrics-api/commit/e05712d913992e96707272d22635ee4a795f34a2))

## [0.12.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.12.0...v0.12.1) (2024-11-25)


### Bug Fixes

* remove accidental cartesian product of `blocks_pushes` * `blocks` in pending proposal date query ([#62](https://github.com/hirosystems/signer-metrics-api/issues/62)) ([1bcc4c1](https://github.com/hirosystems/signer-metrics-api/commit/1bcc4c14a66a133c28a9d57ff2f58487774cff91))

## [0.12.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.11.0...v0.12.0) (2024-11-22)


### Features

* signer prometheus metrics ([#61](https://github.com/hirosystems/signer-metrics-api/issues/61)) ([d7a84f4](https://github.com/hirosystems/signer-metrics-api/commit/d7a84f47df419c4f6cfe271379a0442b083c35da))

## [0.11.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.10.1...v0.11.0) (2024-11-22)


### Features

* ingest block-push events ([#60](https://github.com/hirosystems/signer-metrics-api/issues/60)) ([47f524d](https://github.com/hirosystems/signer-metrics-api/commit/47f524d7bd5c63b23d052848873e1b3789764f55))

## [0.10.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.10.0...v0.10.1) (2024-11-15)


### Bug Fixes

* socket-io cors ([#59](https://github.com/hirosystems/signer-metrics-api/issues/59)) ([da5164e](https://github.com/hirosystems/signer-metrics-api/commit/da5164e7f52c1843809fce2352d6f0c50dd269c8))

## [0.10.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.9.0...v0.10.0) (2024-11-15)


### Features

* socket-io blockProposal notifications ([#58](https://github.com/hirosystems/signer-metrics-api/issues/58)) ([79334e2](https://github.com/hirosystems/signer-metrics-api/commit/79334e23d1ab0d5b27b3df90c1160b487f498026))

## [0.9.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.8.2...v0.9.0) (2024-11-12)


### Features

* implement `/v1/block_proposals` endpoint ([#56](https://github.com/hirosystems/signer-metrics-api/issues/56)) ([49fc6e8](https://github.com/hirosystems/signer-metrics-api/commit/49fc6e88fcafa50895e5efc5b3e4811f2861d4a5))

## [0.8.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.8.1...v0.8.2) (2024-11-08)


### Bug Fixes

* downgrade breaking change typebox ([#54](https://github.com/hirosystems/signer-metrics-api/issues/54)) ([c11afe6](https://github.com/hirosystems/signer-metrics-api/commit/c11afe6eb10c39e3731308a15d6a62e9a069561b))

## [0.8.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.8.0...v0.8.1) (2024-11-08)


### Bug Fixes

* re-org issue with cycle-signer-set data ([#53](https://github.com/hirosystems/signer-metrics-api/issues/53)) ([4f592e7](https://github.com/hirosystems/signer-metrics-api/commit/4f592e7e00907480b714dc6e72169fc0976c36e7))

## [0.8.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.7.0...v0.8.0) (2024-11-08)


### Features

* add slot_index property to signers ([#46](https://github.com/hirosystems/signer-metrics-api/issues/46)) ([79e399a](https://github.com/hirosystems/signer-metrics-api/commit/79e399a568e53d8c4d1ec48e30ee13cde3e898d8))

## [0.7.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.6.0...v0.7.0) (2024-11-08)


### Features

* implement `/v1/blocks/{hash_or_height}` endpoint ([#42](https://github.com/hirosystems/signer-metrics-api/issues/42)) ([3ec299e](https://github.com/hirosystems/signer-metrics-api/commit/3ec299efe0983769d6ff06881af6fe7a556aac37))

## [0.6.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.5.0...v0.6.0) (2024-11-05)


### Features

* add signer last_seen and version fields ([bcc0b16](https://github.com/hirosystems/signer-metrics-api/commit/bcc0b16b00c321564169f93da59319481d0cd636))

## [0.5.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.6...v0.5.0) (2024-11-05)


### Features

* support from/to time range query in cycle signers endpoint ([#37](https://github.com/hirosystems/signer-metrics-api/issues/37)) ([a96736b](https://github.com/hirosystems/signer-metrics-api/commit/a96736bf30d4dd6f9345b1fbdaf3cc88ff88ed76))

## [0.4.6](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.5...v0.4.6) (2024-11-02)


### Bug Fixes

* correct ordering for cycle signers endpoint ([#31](https://github.com/hirosystems/signer-metrics-api/issues/31)) ([9fd2fc4](https://github.com/hirosystems/signer-metrics-api/commit/9fd2fc456ff0f46cf0a5e90a507c9541b58d314f))

## [0.4.5](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.4...v0.4.5) (2024-11-01)


### Bug Fixes

* max start block height for signer predicate messages ([#29](https://github.com/hirosystems/signer-metrics-api/issues/29)) ([6d16ff2](https://github.com/hirosystems/signer-metrics-api/commit/6d16ff2798d1384a4098a974f4d093719df36bbb))

## [0.4.4](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.3...v0.4.4) (2024-10-31)


### Bug Fixes

* skip postgres ingestion for pre-nakamoto blocks ([dda2167](https://github.com/hirosystems/signer-metrics-api/commit/dda2167d0ae30b58acbcc3a4adb3303379b44a68))

## [0.4.3](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.2...v0.4.3) (2024-10-31)


### Bug Fixes

* memleak in sleep abort event listener ([e68e90e](https://github.com/hirosystems/signer-metrics-api/commit/e68e90e0aaad878aa01222afca7efb7a1fd6c873))

## [0.4.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.1...v0.4.2) (2024-10-30)


### Bug Fixes

* signer message predicate startBlock from db chaintip ([8ee51dd](https://github.com/hirosystems/signer-metrics-api/commit/8ee51dd5a578359fc65de3a36d11a6c5c869e2e3))

## [0.4.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.4.0...v0.4.1) (2024-10-30)


### Bug Fixes

* disable predicate healthcheck likely causing predicate restarts ([6c9b802](https://github.com/hirosystems/signer-metrics-api/commit/6c9b802f209545575ee7d3c1281bbb368243d714))

## [0.4.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.3.0...v0.4.0) (2024-10-30)


### Features

* skip reward-set check query during initial mainnet block ingestion ([#18](https://github.com/hirosystems/signer-metrics-api/issues/18)) ([8212d52](https://github.com/hirosystems/signer-metrics-api/commit/8212d5247c4c40545315bc19ba09844bfd30271a))

## [0.3.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.2.2...v0.3.0) (2024-10-28)


### Features

* detect and fetch missing pox cycle signer sets ([#16](https://github.com/hirosystems/signer-metrics-api/issues/16)) ([501cfaa](https://github.com/hirosystems/signer-metrics-api/commit/501cfaaf0cb75c75ef9a53bfc707c976b1e36ce1))

## [0.2.2](https://github.com/hirosystems/signer-metrics-api/compare/v0.2.1...v0.2.2) (2024-10-28)


### Bug Fixes

* rename url prefix from signer-monitor to signer-metrics ([#17](https://github.com/hirosystems/signer-metrics-api/issues/17)) ([529e1c6](https://github.com/hirosystems/signer-metrics-api/commit/529e1c6e451a53482b4fb9fad849659243da5e14))

## [0.2.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.2.0...v0.2.1) (2024-10-28)


### Bug Fixes

* do not store duplicate BlockProposals or BlockResponses ([447cf14](https://github.com/hirosystems/signer-metrics-api/commit/447cf14b2227657d958d6b910732ae372b2256a8))
* do not store duplicate MockProposals, MockSignatures, or MockBlocks ([eda79d0](https://github.com/hirosystems/signer-metrics-api/commit/eda79d07f804839d35fbd544dfc1c774c33c43a4))

## [0.2.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.1.0...v0.2.0) (2024-10-25)


### Features

* include is_nakamoto_block flag in blocks table ([bde4666](https://github.com/hirosystems/signer-metrics-api/commit/bde46665e45e02c0da7e9701874b9ba2647b4211))
* pg schema for mock payload tables ([2511f77](https://github.com/hirosystems/signer-metrics-api/commit/2511f77409e954c93153f60cdd9bb4ffe8b08a0c))
* sql writes for mock payloads ([fb06793](https://github.com/hirosystems/signer-metrics-api/commit/fb06793a8619b13df52e3fd31186dca856e6add3))

## [0.1.0](https://github.com/hirosystems/signer-metrics-api/compare/v0.0.1...v0.1.0) (2024-10-25)


### Features

* add cycle signer id endpoint ([#2](https://github.com/hirosystems/signer-metrics-api/issues/2)) ([a5d5455](https://github.com/hirosystems/signer-metrics-api/commit/a5d545576fdb60d0c684c114208a5a2cccf5dcc8))
* blocks endpoint ([29d1666](https://github.com/hirosystems/signer-metrics-api/commit/29d16664bea16d827d04373cbd5bb3b0dd620393))
* fetch pox constants from stacks-core /v2/pox and store in pg for cycle calculations ([032e33d](https://github.com/hirosystems/signer-metrics-api/commit/032e33da925c13ededf7ba6f0ac1ed4735738658))


### Bug Fixes

* bad hex encode in sql ([3c90815](https://github.com/hirosystems/signer-metrics-api/commit/3c908159ba011a7858829f313e7e847f512182ee))
* bad string number concat ([8df7f1b](https://github.com/hirosystems/signer-metrics-api/commit/8df7f1baa4b33be69e9c36392fd209cd5f049785))

## [0.1.0-beta.1](https://github.com/hirosystems/signer-metrics-api/compare/v0.0.1...v0.1.0-beta.1) (2024-10-25)


### Features

* add cycle signer id endpoint ([#2](https://github.com/hirosystems/signer-metrics-api/issues/2)) ([a5d5455](https://github.com/hirosystems/signer-metrics-api/commit/a5d545576fdb60d0c684c114208a5a2cccf5dcc8))
* blocks endpoint ([29d1666](https://github.com/hirosystems/signer-metrics-api/commit/29d16664bea16d827d04373cbd5bb3b0dd620393))
* fetch pox constants from stacks-core /v2/pox and store in pg for cycle calculations ([032e33d](https://github.com/hirosystems/signer-metrics-api/commit/032e33da925c13ededf7ba6f0ac1ed4735738658))


### Bug Fixes

* bad hex encode in sql ([3c90815](https://github.com/hirosystems/signer-metrics-api/commit/3c908159ba011a7858829f313e7e847f512182ee))
* bad string number concat ([8df7f1b](https://github.com/hirosystems/signer-metrics-api/commit/8df7f1baa4b33be69e9c36392fd209cd5f049785))
