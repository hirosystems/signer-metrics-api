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