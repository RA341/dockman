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
