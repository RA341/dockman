# [2.5.0](https://github.com/RA341/dockman/compare/v2.4.1...v2.5.0) (2025-12-05)


### Bug Fixes

* added tz package to fix time ([52271fe](https://github.com/RA341/dockman/commit/52271fe8b80d9a54bc12a2c9b651a1e8a172fe75)), closes [#125](https://github.com/RA341/dockman/issues/125)
* compose up starting all services ([8d00053](https://github.com/RA341/dockman/commit/8d000534f8c7e1d5501d340216369f4e9d70c6e5)), closes [#124](https://github.com/RA341/dockman/issues/124)
* incorrect date translation ([6e98110](https://github.com/RA341/dockman/commit/6e981101829c1af0595ae7c2d1812b91888f44b4)), closes [#117](https://github.com/RA341/dockman/issues/117)
* incorrect repo and tag url ([ea2a86f](https://github.com/RA341/dockman/commit/ea2a86f718b40e0f409cd0e37b0cb0f6e6311e9b))
* set tab length 2 spaces ([023201d](https://github.com/RA341/dockman/commit/023201db169e5d4ca656165f6a2b37842457bbb1))


### Features

* added container ip addr to list ([5ced4e3](https://github.com/RA341/dockman/commit/5ced4e3e3a943c2c16704e844ec3f418d7d456db)), closes [#122](https://github.com/RA341/dockman/issues/122)
* added new session based auth system ([52bba32](https://github.com/RA341/dockman/commit/52bba3272826a674eb55a7fe6146c447ffe424df))
* added oidc ([3527b71](https://github.com/RA341/dockman/commit/3527b71333e8d681366e58838c0f7b2061a902a4)), closes [#99](https://github.com/RA341/dockman/issues/99)

## [2.4.1](https://github.com/RA341/dockman/compare/v2.4.0...v2.4.1) (2025-11-22)


### Bug Fixes

* incorrect date display ([9c3e24b](https://github.com/RA341/dockman/commit/9c3e24bbd805dbd2da3fff9ace8a42f227a7edbc)), closes [#117](https://github.com/RA341/dockman/issues/117)

# [2.4.0](https://github.com/RA341/dockman/compare/v2.3.0...v2.4.0) (2025-11-07)


### Bug Fixes

* header of containers page. ([5188f8f](https://github.com/RA341/dockman/commit/5188f8f5f7e06723e7956c5a6e1722d36ef90608))


### Features

* added collapsable filelist ([a61ab1c](https://github.com/RA341/dockman/commit/a61ab1ce4b05912e2f9ebb1c16dd40f4b3bb881a))
* added yaml formatter ([f5ab87a](https://github.com/RA341/dockman/commit/f5ab87a8374ce78e323a1be69dab4f71600fbee0))
* arm64 images ([283e52e](https://github.com/RA341/dockman/commit/283e52e17145f2325aa082991f0159936b966407))
* remove git repo and auto chowning ([14e3634](https://github.com/RA341/dockman/commit/14e36348340cc322477e0e9a65b5caec23ef1fe3))

# [2.3.0](https://github.com/RA341/dockman/compare/v2.2.0...v2.3.0) (2025-09-22)


### Bug Fixes

* ctrl z clearing file contents ([96729f4](https://github.com/RA341/dockman/commit/96729f48f3f44d68649566c001b7959b22352d37)), closes [#60](https://github.com/RA341/dockman/issues/60)
* file permissions ([3a07821](https://github.com/RA341/dockman/commit/3a07821e4f7b29f468a6c09d81d9c8fac8493043))
* set default perm to root ([937179a](https://github.com/RA341/dockman/commit/937179a425b4be1dfd53abeb8e10996e19c63106))


### Features

* added compose validator ([1616969](https://github.com/RA341/dockman/commit/161696981cceab77bae133c531e9452d463143ee))
* added disable compose actions ([e43c05f](https://github.com/RA341/dockman/commit/e43c05f5f66bfdbab164088e1899f5a7c755a234))
* container exec ([1c646ee](https://github.com/RA341/dockman/commit/1c646eee9254d50a400d2f688f4023b62c10fbe5)), closes [#82](https://github.com/RA341/dockman/issues/82)
* improved logs panel, added search and download ([4ea1cb4](https://github.com/RA341/dockman/commit/4ea1cb4156170a0e95fb6050c22da6325b32295f))

# [2.2.0](https://github.com/RA341/dockman/compare/v2.1.2...v2.2.0) (2025-09-02)


### Bug Fixes

* [#71](https://github.com/RA341/dockman/issues/71) file sorting ([a72f1d9](https://github.com/RA341/dockman/commit/a72f1d9bc76e73c381e6508aca896e3daea64f37))
* [#85](https://github.com/RA341/dockman/issues/85) ([a689977](https://github.com/RA341/dockman/commit/a689977a537569e1a62242c16564294765a3a355))
* change tab names to fullpath ([1e841dd](https://github.com/RA341/dockman/commit/1e841dd9429f10ae4b89753f4984522789a6782e)), closes [#79](https://github.com/RA341/dockman/issues/79) [#78](https://github.com/RA341/dockman/issues/78)
* import dialog opening add ([e610df8](https://github.com/RA341/dockman/commit/e610df8fc57f17a6e0bd5a0953aef29539a55bb0))
* non compose files having tabs ([b3953d2](https://github.com/RA341/dockman/commit/b3953d2a1c8922e18267be0e47eccc3e23cbd34e)), closes [#81](https://github.com/RA341/dockman/issues/81)
* tty streams ([c333b7e](https://github.com/RA341/dockman/commit/c333b7e978ba1cd9543bc66ec5f253a52d909b2b)), closes [#76](https://github.com/RA341/dockman/issues/76)


### Features

* added file pinning ([88b8a95](https://github.com/RA341/dockman/commit/88b8a954636e0998b651c10c746b0270f0a8e428))
* added rename ([127d008](https://github.com/RA341/dockman/commit/127d008ebba67aaae02803b56d9bb53259e06d77)), closes [#72](https://github.com/RA341/dockman/issues/72)
* container updater ([26a2173](https://github.com/RA341/dockman/commit/26a217308f0e7433ecf6a4a37d3835ba2c3cd9a2))
* custom sorts in .dockman.yaml ([52eed5e](https://github.com/RA341/dockman/commit/52eed5ea5118575aa7da73b1ef2a9ec50f25a2d8)), closes [#84](https://github.com/RA341/dockman/issues/84)
* remember cursor positions ([3c06bf6](https://github.com/RA341/dockman/commit/3c06bf6ff9ab243392a8cf0497b71861b03db057)), closes [#85](https://github.com/RA341/dockman/issues/85) [#80](https://github.com/RA341/dockman/issues/80)
* remember open tabs ([2c0cc6b](https://github.com/RA341/dockman/commit/2c0cc6bd4272db5b8d37e569a54a4d976b29b079)), closes [#80](https://github.com/RA341/dockman/issues/80)

## [2.1.2](https://github.com/RA341/dockman/compare/v2.1.1...v2.1.2) (2025-08-23)


### Bug Fixes

* added delete dialog on files ([f93ed8d](https://github.com/RA341/dockman/commit/f93ed8d54b3e3e89c6d41819812f7c5891d45370)), closes [#62](https://github.com/RA341/dockman/issues/62)
* env loading ([2c20f19](https://github.com/RA341/dockman/commit/2c20f194263972adc04ab043a8f2a33ebf102fa3)), closes [#64](https://github.com/RA341/dockman/issues/64)
* improved volumes page ([ccdcc62](https://github.com/RA341/dockman/commit/ccdcc62bb3ae7c18bcc59c101ecc19a6ddd5df70)), closes [#59](https://github.com/RA341/dockman/issues/59)
* network page ([e625d44](https://github.com/RA341/dockman/commit/e625d4407f7c8709379f3bdc52e4c85d2ddd4c89)), closes [#59](https://github.com/RA341/dockman/issues/59)

## [2.1.1](https://github.com/RA341/dockman/compare/v2.1.0...v2.1.1) (2025-08-13)


### Bug Fixes

* container logs ([98c70c9](https://github.com/RA341/dockman/commit/98c70c993702f3b26eea8f9f471b45560272123e))
* move compose files to feature flag ([f549e35](https://github.com/RA341/dockman/commit/f549e35a59b1142bbacbf343ed7f351b07249b01))

# [2.1.0](https://github.com/RA341/dockman/compare/v2.0.1...v2.1.0) (2025-08-13)


### Features

* added configurable cookie expiry limit ([a48a382](https://github.com/RA341/dockman/commit/a48a3827d75fc15290094a8cb9d496e0cd361ed3))
* added direct link to stack file from container ([5f42658](https://github.com/RA341/dockman/commit/5f4265848379e64248b681033a48d3da53dff0ab))
* added search and shortcuts for containers and images ([e632765](https://github.com/RA341/dockman/commit/e63276523718bfab170bb634a175ec1f3aadc0d6))
* image controls ([6b37043](https://github.com/RA341/dockman/commit/6b370438975001234be1c8111af41de952e91808))
* implemented container controls ([dd48570](https://github.com/RA341/dockman/commit/dd485705bc9f97aa32bae0227b8a8ed37178240d))
* network/volumes/image controls ([fa89603](https://github.com/RA341/dockman/commit/fa896035c80e521abae1610fb9f72491c04455a3))
* new add file dialog ([fca7ff2](https://github.com/RA341/dockman/commit/fca7ff2588889984d07f5c2cb6987e4d0e7d26c2))
* new file item view ([d5a146b](https://github.com/RA341/dockman/commit/d5a146b1e1a9c28054ef43d4c471c85d7bdd7eae))
* new shortcuts for file and dashboard ([fe1d16e](https://github.com/RA341/dockman/commit/fe1d16e820e4b96dbfa79cd9b840bef8c62a1969))

## [2.0.1](https://github.com/RA341/dockman/compare/v2.0.0...v2.0.1) (2025-07-28)


### Bug Fixes

* [#40](https://github.com/RA341/dockman/issues/40) git commit hangs for large compose roots ([1610f61](https://github.com/RA341/dockman/commit/1610f6155f9a561e5c89d61f7d4df0659886ec0b))

# [2.0.0](https://github.com/RA341/dockman/compare/v1.1.0...v2.0.0) (2025-07-23)


* Merge pull request [#39](https://github.com/RA341/dockman/issues/39) from RA341/main ([f7f4c0c](https://github.com/RA341/dockman/commit/f7f4c0c9fc958385a6c5d673fd7cf8d93a0c4bae))


### Bug Fixes

* empty hosts on first login ([0bd35c9](https://github.com/RA341/dockman/commit/0bd35c9e26b465118719db7be22366c1ff49fc76))
* infinite refresh on git list fail ([43c16cf](https://github.com/RA341/dockman/commit/43c16cf8fcbcef7d13b70249c2b8bc922ec24287))
* page switch to empty page on host switch ([d0a7ca3](https://github.com/RA341/dockman/commit/d0a7ca35137ab2ae13551b5db7d94d9cf130ff37))
* table and layout issues ([a1ba85f](https://github.com/RA341/dockman/commit/a1ba85f98e041528e7ebd61ff2ee6bb9bdedd6e5))


### Features

* improved multi-host config and management ([3ea713a](https://github.com/RA341/dockman/commit/3ea713ae59c34f09040279bd252a66c318c5b1d1))
* new version/changelog tracker ([05fa5bf](https://github.com/RA341/dockman/commit/05fa5bf6b4b3a7b2aa3f9fc39687032d5c7f6e3f))


### BREAKING CHANGES

* Remove host.yaml for multihost in favor of UI method

- host.yaml removed (RIP, we barely knew ya)
- dockman now uses config database
- Config mount= <path to dockman config>:/config
- Existing SSH keys will not be used

# [1.1.0](https://github.com/RA341/dockman/compare/v1.0.2...v1.1.0) (2025-07-05)


### Bug Fixes

* infinite git list refresh ([1a76d16](https://github.com/RA341/dockman/commit/1a76d163622967c6eb2c8ea9464062cf33b2080b))
* switched to a hybrid frontend/backend sort for better ux ([9fad0f0](https://github.com/RA341/dockman/commit/9fad0f00c6ef6c3c34ee7efb6906404d567f6a0f))


### Features

* added file sync ([14c1776](https://github.com/RA341/dockman/commit/14c17763802c870532cab6f01bb566ad2ef802a3))
* added individual container controls ([7049541](https://github.com/RA341/dockman/commit/70495411c05ad933d016f6c6e3dddec20c47aaad))
* finalized multi-docker host support ([aa71a94](https://github.com/RA341/dockman/commit/aa71a943a66df09aeabab9c5b2dbc0b4f1a32bab))
* setting auth user/pass ([a26e3fb](https://github.com/RA341/dockman/commit/a26e3fbc97d3be9db37d675dd7ff97f7d95aa95f))

## [1.0.2](https://github.com/RA341/dockman/compare/v1.0.1...v1.0.2) (2025-06-28)


### Bug Fixes

* charts perf ([8cf2975](https://github.com/RA341/dockman/commit/8cf2975fe27e639515ba351bcec7e876a17be75a))
* improved table loader ([40dabdc](https://github.com/RA341/dockman/commit/40dabdca4726609ee6877c69ba0da31c4fa83eab))

## [1.0.1](https://github.com/RA341/dockman/compare/v1.0.0...v1.0.1) (2025-06-27)


### Bug Fixes

* added auth loader ([cc74596](https://github.com/RA341/dockman/commit/cc7459697d91ec6d76ee2bb9b6fccf5047d201f6))
* empty error box for logs ([07c26af](https://github.com/RA341/dockman/commit/07c26af61984c9a0e3f0ffd58a4943b359a87cc8))
* improved logs panel ([f32dffd](https://github.com/RA341/dockman/commit/f32dffd76910b904c50659aaf8430edc807cfc6d))

# 1.0.0 (2025-06-26)


### Features

* initial release ([09470a5](https://github.com/RA341/dockman/commit/09470a5d49f4e9fca6b69fec6d72ea98db208209))
