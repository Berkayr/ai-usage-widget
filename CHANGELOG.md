# Changelog

Notable changes are recorded here.

## [1.0.0](https://github.com/Berkayr/ai-usage-widget/compare/v0.2.1...v1.0.0) (2026-11-28)


### ⚠ BREAKING CHANGES

* the app identifier and settings folder changed; the autostart entry and Windows Run value are migrated automatically.

### Features

* **app:** add an optional daily quote card ([dcbb480](https://github.com/Berkayr/ai-usage-widget/commit/dcbb48077042249333112443bb2b234d8e4e1636))
* **brand:** use the countdown ring logo ([60c98d6](https://github.com/Berkayr/ai-usage-widget/commit/60c98d692d144b37296a587afedf2e629d9ba0c2))
* **claude:** add opt-in local usage history from Claude Code logs ([4fa59aa](https://github.com/Berkayr/ai-usage-widget/commit/4fa59aa3cb33cc7361958c6670d7c6b0fd18c907))
* **codex:** read daily account token history from app-server ([9660488](https://github.com/Berkayr/ai-usage-widget/commit/96604888f102f9fdd1b68b0c119b6e24ef55cf6e))
* **core:** expose every quota pool and model limit ([f586169](https://github.com/Berkayr/ai-usage-widget/commit/f5861691356de7baad72ab81435fb76e14d968b3))
* **history:** add opt-in Antigravity CLI usage history ([1feb869](https://github.com/Berkayr/ai-usage-widget/commit/1feb869fdc7ebdc63099ad3c6192ee05e9fb0dc6))
* **history:** add today view and all-tools totals, keep history on screen ([5285142](https://github.com/Berkayr/ai-usage-widget/commit/52851429442a1afe036266c4caf042a361b1a547))
* **history:** show usage history under cards, on click or in a side panel ([0978567](https://github.com/Berkayr/ai-usage-widget/commit/09785678169b39ff08e2c8f93282f6ba23fb9922))
* **history:** stack providers in the side panel and move the toggle into the header ([270cad3](https://github.com/Berkayr/ai-usage-widget/commit/270cad30896c6c0856ca509f90f0ae365846adbf))
* **install:** add one-line Linux installer and install smoke job ([548b81f](https://github.com/Berkayr/ai-usage-widget/commit/548b81f03c57dd86b225ae1bb3b99ffc4646a0de))
* **kde:** use fixed warning colors by default ([348ae9f](https://github.com/Berkayr/ai-usage-widget/commit/348ae9f76c59b9257356b6cdc1aeb4a7a3db04f0))
* **layout:** add First in list as the default featured provider ([36d24c5](https://github.com/Berkayr/ai-usage-widget/commit/36d24c584ef18b38088de7c092eba1f1b62bea9e))
* **layout:** add fit-to-screen size mode using the usable work area ([41673b4](https://github.com/Berkayr/ai-usage-widget/commit/41673b418adda3df1b25b4007917db2cac5981b2))
* **layout:** choose provider order and the featured provider ([33e4fc9](https://github.com/Berkayr/ai-usage-widget/commit/33e4fc91b53f5a7a91894b34ae13d25196d8879d))
* **linux:** add layer-shell widget, panel integrations and packages ([fcc9739](https://github.com/Berkayr/ai-usage-widget/commit/fcc9739bccc37e08b7e5470648ec3ec993cad576))
* **linux:** blur behind glass themes on KDE ([620a81c](https://github.com/Berkayr/ai-usage-widget/commit/620a81c517a3c1c42d926c680badc7c5c8ed6eec))
* **linux:** redesign panel widgets and add login/layer settings ([de73a57](https://github.com/Berkayr/ai-usage-widget/commit/de73a576cd0cfda58fe39395d467a6b3b71ac9e9))
* **providers:** add Z.ai, Kimi, SiliconFlow and API spend readers ([cf0df76](https://github.com/Berkayr/ai-usage-widget/commit/cf0df76e2670c44452cadf9b31afab0038ce2a14))
* **providers:** show logos and explain providers without data ([a7f5a47](https://github.com/Berkayr/ai-usage-widget/commit/a7f5a4760e2c930cd5ff4798f00cc8ece7c6e9ca))
* **quotacore:** add an opt-in daily quote command ([5a55339](https://github.com/Berkayr/ai-usage-widget/commit/5a55339c0a37c1d2131615116d162ccc86d1185c))
* **quotacore:** give anniversaries, works and author notes for daily quotes ([5d406a2](https://github.com/Berkayr/ai-usage-widget/commit/5d406a229fe0459326c00b78cd8dc35855a24169))
* **quote:** readable quote card, top or bottom placement, gentler size steps ([be0b3d0](https://github.com/Berkayr/ai-usage-widget/commit/be0b3d0ee1bf24ed795066a18c816fe490fab319))
* rename the app to AI Usage ([2cd4d8f](https://github.com/Berkayr/ai-usage-widget/commit/2cd4d8f49531a317a4e892ea9588415cb83239f9))
* **runtime:** bundle python on windows and prefer an existing install ([62748ae](https://github.com/Berkayr/ai-usage-widget/commit/62748aed107131e2c88ddaa3b7fe906e893ccfc4))
* **settings:** add per-widget settings model ([126b8e3](https://github.com/Berkayr/ai-usage-widget/commit/126b8e31153ee5793e78f501632c59b24ab2562f))
* **settings:** choose which quota pools and limits to show ([e498fe1](https://github.com/Berkayr/ai-usage-widget/commit/e498fe15b879478b087c37752ec0cf458fe43cdb))
* **settings:** give the daily quote its own tab ([f1b9627](https://github.com/Berkayr/ai-usage-widget/commit/f1b9627e19c77e437c7da9a16e401c010f0d64e4))
* **settings:** move settings into a sidebar layout ([e4622e7](https://github.com/Berkayr/ai-usage-widget/commit/e4622e70c6d82f76987d43560aa09160dce63268))
* **settings:** open settings in a separate window ([3700493](https://github.com/Berkayr/ai-usage-widget/commit/3700493d9e696ca04c5da92e9e375d1800f15a7d))
* **settings:** pick, add and remove widgets per monitor ([e5df88d](https://github.com/Berkayr/ai-usage-widget/commit/e5df88df181f39a1195d9bd75b20f78ce4d8f799))
* **settings:** rework pages and make save honest ([5a63864](https://github.com/Berkayr/ai-usage-widget/commit/5a63864edc39b89e8d750b3fc75410962adcb14a))
* **settings:** split appearance into theme, colors, shape and display tabs ([70c7eea](https://github.com/Berkayr/ai-usage-widget/commit/70c7eeaa2adfcd0b0183f1b1cb51a81662d36428))
* **theme:** add a reactor theme and real color modes on round shapes ([71de23f](https://github.com/Berkayr/ai-usage-widget/commit/71de23f063c17c4db179cf000e446002d37472c4))
* **theme:** add a system theme as the new default ([1573734](https://github.com/Berkayr/ai-usage-widget/commit/15737347e20cbdb8574812579b086a048dbb8fe3))
* **theme:** add calm color mode and accent edge setting ([ac1d0c2](https://github.com/Berkayr/ai-usage-widget/commit/ac1d0c254fbbc8fb466cfb964496a8dab221014a))
* **theme:** add circle and pill widget shapes ([f5be6b1](https://github.com/Berkayr/ai-usage-widget/commit/f5be6b1813cebad8ee6fa5e836a76dd7e43939c1))
* **theme:** add five size presets with one fixed aspect ratio ([84cd7b5](https://github.com/Berkayr/ai-usage-widget/commit/84cd7b56c86d732ce1be2118c19cff6cea0c0c5b))
* **theme:** add landscape and square widget shapes ([e4f33f3](https://github.com/Berkayr/ai-usage-widget/commit/e4f33f31de620f6bfef50331befbf4e3351f4d5b))
* **theme:** add light appearance and light taskbar strip ([f3bd5ed](https://github.com/Berkayr/ai-usage-widget/commit/f3bd5ed1c355a06c32112d9298c9e43aa362e9a5))
* **theme:** add mono color mode and a fixed dot count ([5aec2da](https://github.com/Berkayr/ai-usage-widget/commit/5aec2dad45c22eed301669998a63dcf99650e66b))
* **theme:** add seven themes and a theme picker ([63633b9](https://github.com/Berkayr/ai-usage-widget/commit/63633b9bebb4bdc490abedee7c1a4e3af423efb6))
* **theme:** label circle arcs and let users pick provider colors ([2b8a269](https://github.com/Berkayr/ai-usage-widget/commit/2b8a269e63a5c53846e38089faacba432d604f70))
* **themes:** add 12 palettes per theme and a custom palette editor ([cc99dc1](https://github.com/Berkayr/ai-usage-widget/commit/cc99dc18345cab67852b06af7c0eb28d48ebab64))
* **themes:** add clear glass, layer, aurora, crisp, pebble, glyph and pastel ([1418572](https://github.com/Berkayr/ai-usage-widget/commit/14185728c9f26cda22d9d667b3baf62127cc755f))
* **themes:** turn Pastel into a pink theme with Rose, Blush and Bubblegum palettes ([f515f5f](https://github.com/Berkayr/ai-usage-widget/commit/f515f5fe03536aef30240dcc0a9dcbfef7f778a0))
* **window:** open a window for each extra widget ([f140383](https://github.com/Berkayr/ai-usage-widget/commit/f140383a3c56a8f0e0acff7b30f85e998ca153c1))


### Bug Fixes

* **app:** add first-run provider picker and escape snapshot text ([eca7c1b](https://github.com/Berkayr/ai-usage-widget/commit/eca7c1bc98540b5605c3987c7bcaaf21bf832cbb))
* **bar:** mark snapshots older than 10 minutes as stale ([eba1548](https://github.com/Berkayr/ai-usage-widget/commit/eba154836a121c1d1321483202532496f8fec1cd))
* **circular-rings:** wrap long pool names ([3f69741](https://github.com/Berkayr/ai-usage-widget/commit/3f697411774e0165654907c0219e06c1a24a3fbd))
* **claude:** keep an explicit 0% from the status line ([1044466](https://github.com/Berkayr/ai-usage-widget/commit/1044466c70df196cf7b2123e01d447c64937e5e0))
* **claude:** keep cached usage windows when falling back to the cache ([fe7e56f](https://github.com/Berkayr/ai-usage-widget/commit/fe7e56f4afa27c0ee4b9d9b95a9c01575a9bbc80))
* **codex:** accept app-server replies in any order ([191e597](https://github.com/Berkayr/ai-usage-widget/commit/191e597111cefd1cc6138f8530665f4cd0063051))
* **config:** always report the claude history permission as a boolean ([00a8ffa](https://github.com/Berkayr/ai-usage-widget/commit/00a8ffad06fdff56dfdb9f9d3e3486b4e1992673))
* **core:** ask before reading credentials and harden local files ([d15709c](https://github.com/Berkayr/ai-usage-widget/commit/d15709c05bf3730195ee66c4574034792b912b87))
* **core:** retry atomic writes on Windows sharing violations ([61c207e](https://github.com/Berkayr/ai-usage-widget/commit/61c207ecaa4ae8aedbafdafdaf20b69493a849d6))
* **daemon:** don't back off on disabled providers ([ec8e34b](https://github.com/Berkayr/ai-usage-widget/commit/ec8e34b81763a2dcb255e27363d7eb4ac173637e))
* **footprint:** report unreadable PIDs and keep partial samples out of PSS ([07ada0c](https://github.com/Berkayr/ai-usage-widget/commit/07ada0c170e99b842310b08d790e4a507f4e129c))
* **history:** count the final output tokens of streamed messages ([db0c1e8](https://github.com/Berkayr/ai-usage-widget/commit/db0c1e8b01abaf6717c144a0a63fdc62fb05bcc6))
* **history:** keep all-tools totals the same on every square page ([dc179e0](https://github.com/Berkayr/ai-usage-widget/commit/dc179e0a970d77355cb5a5da69693dbf80b3f798))
* **history:** keep yesterday's hourly usage out of today's chart ([69318bd](https://github.com/Berkayr/ai-usage-widget/commit/69318bd050c9376d553ee9345e7b094bba78fab2))
* **history:** show missing account days as no data instead of zero ([2f06174](https://github.com/Berkayr/ai-usage-widget/commit/2f06174a5f3bcfc137809d2ac22b42600e6bfc26))
* **history:** skip a log file that is not valid UTF-8 instead of dropping all history ([783e9ab](https://github.com/Berkayr/ai-usage-widget/commit/783e9abafca4f328f7bb0716d84b3817d595e9f9))
* **hooks:** keep finished chained commands from reporting a timeout ([4700de8](https://github.com/Berkayr/ai-usage-widget/commit/4700de838fdc5e45292f6d7ff5e8ade1c342c0da))
* **icons:** show the Kimi logo on light themes ([bacaf60](https://github.com/Berkayr/ai-usage-widget/commit/bacaf602aa1421b7e39ed0cfff526a1c34a5bb9a))
* **kde:** give the expanded panel view a usable size ([b1ea134](https://github.com/Berkayr/ai-usage-widget/commit/b1ea13452154fef907e70c218da0cefc47d2c589))
* **layer:** use provider logos instead of placeholder squares ([815f8df](https://github.com/Berkayr/ai-usage-widget/commit/815f8df9b14b308d93862ae2dccc7e725627b539))
* **layout:** fill portrait cards and scroll instead of clipping them ([66c21c1](https://github.com/Berkayr/ai-usage-widget/commit/66c21c15025e7f2ccd6c901ee1e1df03c6755af7))
* **layout:** keep every shape usable at every size ([7ca965b](https://github.com/Berkayr/ai-usage-widget/commit/7ca965b002b64c02387b4c6d5e570a46d2649c6b))
* **layout:** keep extra pools inside pill and circle shapes ([3aa260a](https://github.com/Berkayr/ai-usage-widget/commit/3aa260a2001605e1cd7512c1aba5fcba6be47834))
* **layout:** keep usage cards unscrolled with a featured provider and quote ([1a094c2](https://github.com/Berkayr/ai-usage-widget/commit/1a094c27115f5349f72a18976abc8457347fc5c1))
* **layout:** keep widget size independent of theme, add strip shape ([384f3f8](https://github.com/Berkayr/ai-usage-widget/commit/384f3f89c68094b453e87fbf006beba924f66376))
* **layout:** wrap quota labels when a portrait card is too narrow ([96bc596](https://github.com/Berkayr/ai-usage-widget/commit/96bc5967a6e832544c9e8eeb7a92f083d3d15b12))
* **linux:** destroy Settings webview on close ([3014046](https://github.com/Berkayr/ai-usage-widget/commit/3014046d6f4885eb7a3e121532282f7aefc24413))
* **linux:** draw the widget on layer-shell surfaces ([335ecfd](https://github.com/Berkayr/ai-usage-widget/commit/335ecfdaa8a768f6b3e1a246d99a37d22598e253))
* **linux:** escape desktop entry paths so unusual home folders still launch ([6d6aff6](https://github.com/Berkayr/ai-usage-widget/commit/6d6aff6aa3eced3fd8b1d58f09ddff432744ddb9))
* **linux:** name the AppImage icon after the binary ([895e0d1](https://github.com/Berkayr/ai-usage-widget/commit/895e0d1f4b44a7e2fe00b7b0346277465827c43b))
* **linux:** stop pinning the X11 window at its first clipped height ([fc601a8](https://github.com/Berkayr/ai-usage-widget/commit/fc601a84d185206adab7273a44773093dac18200))
* **linux:** stop the snapshot watcher from re-reading in a loop ([2bedc09](https://github.com/Berkayr/ai-usage-widget/commit/2bedc09ca78dc77156b28aed01b7c4f59c316297))
* **packaging:** make the panel launcher executable ([9515529](https://github.com/Berkayr/ai-usage-widget/commit/9515529b9c83b469c1396aa56d771a06f2e99efa))
* **packaging:** make the rpm installable on Fedora ([217cb63](https://github.com/Berkayr/ai-usage-widget/commit/217cb6362117e4689e09ab1042e9935ca3c3c483))
* **packaging:** point the panel launcher at installed sources ([6684859](https://github.com/Berkayr/ai-usage-widget/commit/6684859b88d6aa0bde8408408efd3b6bea270458))
* **panel:** keep rate-limited providers visible when all their pools are hidden ([c38c0c8](https://github.com/Berkayr/ai-usage-widget/commit/c38c0c836fd1d6eb27ffd1fa0094cb7eede4769d))
* **panels:** respect hidden pools in taskbar and panels ([27c6101](https://github.com/Berkayr/ai-usage-widget/commit/27c6101ea825ed102cfc2d605bc7f2a7c09a08fe))
* **plasmoid:** keep refresh failures until a refresh succeeds ([5838f4b](https://github.com/Berkayr/ai-usage-widget/commit/5838f4b31177c84f1419cbcb44d752cd3c7f5349))
* **portrait:** keep every card and the footer reachable on short screens ([32940ae](https://github.com/Berkayr/ai-usage-widget/commit/32940ae7cdb9d5a3dcf982a748da4cccd5cde606))
* **portrait:** restore side padding on compact cards ([62fca0d](https://github.com/Berkayr/ai-usage-widget/commit/62fca0dc29e4722991a621880507ac74c9fdbc80))
* **portrait:** size cards to content so the gaps go away ([28f025f](https://github.com/Berkayr/ai-usage-widget/commit/28f025fca2926cc940147e2df4c2d68ec1fb3fea))
* **quotacore:** strip tilde separators from quote author and work ([c471a20](https://github.com/Berkayr/ai-usage-widget/commit/c471a20427a36b223f40b2739a22ada409cf9bc6))
* **quote:** shrink long quotes to fit and show a real ellipsis ([d7f96fe](https://github.com/Berkayr/ai-usage-widget/commit/d7f96feacd1a6c32bc178af0ba079b2f8400e057))
* **settings:** accept fractional widget scale ([eba3c5a](https://github.com/Berkayr/ai-usage-widget/commit/eba3c5af9787725b1b70fdd37310aed59b549452))
* **settings:** disable featured controls where they have no effect ([0c4067a](https://github.com/Berkayr/ai-usage-widget/commit/0c4067a8b06e82dc8fd691afe3ecef25e1b8060f))
* **settings:** keep history permission in sync when a later save step fails ([320a3a0](https://github.com/Berkayr/ai-usage-widget/commit/320a3a071e4fcd4bdd96d3de7f1f4bc0cc5480a8))
* **settings:** keep known fields when the settings file is partial ([6a77d85](https://github.com/Berkayr/ai-usage-widget/commit/6a77d858b00bf02bda8ceee5090c0f073804af70))
* **settings:** keep old settings and re-place after resize ([14e0c65](https://github.com/Berkayr/ai-usage-widget/commit/14e0c653c47b35cb9f79162f80e9d90b300e651a))
* **settings:** move provider colors to providers, fix clipped and low-contrast controls ([5902479](https://github.com/Berkayr/ai-usage-widget/commit/59024799399012fccb5efeb22c95ac5cf573c899))
* **theme:** fill the last grid cell in two-column themes ([15d1f69](https://github.com/Berkayr/ai-usage-widget/commit/15d1f695463116718c3b1464ce4a3ccee5ce674d))
* **theme:** keep all text readable on its real surface ([49a1d84](https://github.com/Berkayr/ai-usage-widget/commit/49a1d84f03204588d80854069d4b2ae678dae2a5))
* **theme:** keep digit proportions fixed at every size ([0b00aa5](https://github.com/Berkayr/ai-usage-widget/commit/0b00aa5e790be2c1f39e8d264b92426c117da05b))
* **theme:** keep hidden status badge text hidden at readable sizes ([2707a8b](https://github.com/Berkayr/ai-usage-widget/commit/2707a8bfefdfdf9f0d45de3f1b9babbd612114fe))
* **theme:** make the widget background opaque by default ([6c5bf07](https://github.com/Berkayr/ai-usage-widget/commit/6c5bf078f57d52394fe5e2a996d394b85bf36636))
* **themes:** keep quota labels on one line ([bf10aaa](https://github.com/Berkayr/ai-usage-widget/commit/bf10aaa7a2001f04cc7d49118d741ad9ca6a9cdb))
* **themes:** keep reworked cards inside tight screen-fit sizes ([d2f96cf](https://github.com/Berkayr/ai-usage-widget/commit/d2f96cfab214ef4936a9e2e581ac322d07073ad9))
* **themes:** rework aurora, crisp, layer, brutalist, reactor, rings and strip cards ([35b0c66](https://github.com/Berkayr/ai-usage-widget/commit/35b0c6665fdc8d668bfef4261074d8abea72f8bb))
* **widget:** close the context menu on selection and show refresh status ([d93c4fa](https://github.com/Berkayr/ai-usage-widget/commit/d93c4fa0825fc087d7b081c47b00a47ba3c321cd))
* **widget:** hide the plan badge instead of truncating it ([940c3f6](https://github.com/Berkayr/ai-usage-widget/commit/940c3f6a8a528518f5beec59a01cb8525b1461bd))
* **widget:** keep unsaved settings previews out of shortcut saves ([1bb27fd](https://github.com/Berkayr/ai-usage-widget/commit/1bb27fd9c097922713de2efd85466cf51ca6f295))
* **widget:** never show sample quota after a live startup failure ([ffaa94d](https://github.com/Berkayr/ai-usage-widget/commit/ffaa94d0b7210ade9cec116605fce5b6719834d3))
* **widget:** point empty states to settings instead of the core name ([33c7fea](https://github.com/Berkayr/ai-usage-widget/commit/33c7fea1bac7f2464c503eb8861e09cac8630759))
* **widget:** say checked instead of updated when no provider was remeasured ([b607578](https://github.com/Berkayr/ai-usage-widget/commit/b6075785c80f7dc34bad668e5dcc894ce332b3dc))
* **widget:** stack cramped usage rows and compact the landscape quote ([0f29eca](https://github.com/Berkayr/ai-usage-widget/commit/0f29eca161ff402676d8df70d3b5c3d358f757a9))
* **widget:** stop text overlapping across themes and add an overlap check ([a06d92e](https://github.com/Berkayr/ai-usage-widget/commit/a06d92e2eca198088facbcb11fd27bbd71a2f1bc))
* **window:** remember requested size so an X11 resize is not undone ([bbad53e](https://github.com/Berkayr/ai-usage-widget/commit/bbad53e0234fef2e685a4e64785b6ad9fa7b5f88))
* **windows:** align the circle and pill region with the client area ([5d68871](https://github.com/Berkayr/ai-usage-widget/commit/5d68871846ef60a0eaf2e913bcd6131f7a736fa8))
* **windows:** drop the bundled Python when switching NSIS editions ([73e335a](https://github.com/Berkayr/ai-usage-widget/commit/73e335a781451a31f99a59ba2d6a240c6ed2f47a))
* **windows:** open settings off the main thread to avoid a WebView2 deadlock ([eda821b](https://github.com/Berkayr/ai-usage-widget/commit/eda821be7b00b4fc1966000805841425beaf793e))
* **windows:** place the widget from the requested size, not the stale one ([bfd1211](https://github.com/Berkayr/ai-usage-widget/commit/bfd12111e8d3aa9faaa4c68d0b4c75ddec33dfd8))
* **windows:** restore widgets minimized when a monitor is unplugged ([eaed4a3](https://github.com/Berkayr/ai-usage-widget/commit/eaed4a3a819f1dfeaa4a46ce2132dbb5c85a5093))


### Performance Improvements

* **app:** trim webview features, timers and release binary size ([b7e8201](https://github.com/Berkayr/ai-usage-widget/commit/b7e820172b23022b7575d0498a554811e9e12924))
* **core:** skip unchanged snapshot writes and load only enabled providers ([5ae4454](https://github.com/Berkayr/ai-usage-widget/commit/5ae44549e65da5cd603bc2451485470375b3e888))


### Documentation

* add circle and pill to the shapes gallery ([b42016a](https://github.com/Berkayr/ai-usage-widget/commit/b42016a01a8e74ad4c32d4b1334a6ffac8d2bbcd))
* **design:** add logo candidates ([9948881](https://github.com/Berkayr/ai-usage-widget/commit/9948881786b41b306f92e7685d68f81c68423efd))
* **install:** drop the python requirement from windows setup ([5809ad8](https://github.com/Berkayr/ai-usage-widget/commit/5809ad898334ef101125984b999e872fba00cb67))
* **perf:** add footprint script and performance notes ([0b1b72d](https://github.com/Berkayr/ai-usage-widget/commit/0b1b72d0ad0ab06973ef7e3d9b4b9ac4811f0122))
* point installation to the releases page ([4dda091](https://github.com/Berkayr/ai-usage-widget/commit/4dda091165b6675e4b03389a1988a3b3bd74bf5d))
* **readme:** lead with the system theme ([fc24ca6](https://github.com/Berkayr/ai-usage-widget/commit/fc24ca6b6b1c171968cf4c12c88b8c70db91efba))
* **readme:** note the Smart App Control limit on unsigned installers ([173d889](https://github.com/Berkayr/ai-usage-widget/commit/173d889b45d39b358af0f1eb6b45d5781359e82b))
* **readme:** rewrite readme with screenshots and docs pages ([5b08b40](https://github.com/Berkayr/ai-usage-widget/commit/5b08b40bcba2ac7d753a66389b88822441bd4870))
* **readme:** show all themes in screenshots ([7ef3541](https://github.com/Berkayr/ai-usage-widget/commit/7ef3541e5c40641515c8d5ce4e98b05f12f6bd60))
* **readme:** show more themes and palettes across the page ([006d102](https://github.com/Berkayr/ai-usage-widget/commit/006d102bd55aa83f672ccf306c81430862db6328))
* record current Linux footprint measurements ([ed254cd](https://github.com/Berkayr/ai-usage-widget/commit/ed254cddafbd6a738d546c451ed2aacba87dae9d))
* record tested Linux platforms ([1388b36](https://github.com/Berkayr/ai-usage-widget/commit/1388b3676cb2c085a77173c37c50d84aa1c78261))
* refresh circle screenshots ([aaa5800](https://github.com/Berkayr/ai-usage-widget/commit/aaa5800da9518172e58b02b600bd585684560502))
* refresh readme with new themes, history and settings screenshots ([c2c7b4f](https://github.com/Berkayr/ai-usage-widget/commit/c2c7b4f5dc672694060f792c0d74b5a3d27b8b29))
* refresh release notes for a public repository ([efab4e9](https://github.com/Berkayr/ai-usage-widget/commit/efab4e954355b5c2aa2442a21bd8690ebcbf8511))
* refresh screenshots at real window sizes ([13c1316](https://github.com/Berkayr/ai-usage-widget/commit/13c131672a96cbcadea2937bcb333b86f4c2f838))
* refresh screenshots for quotes, layout and reactor ([3925344](https://github.com/Berkayr/ai-usage-widget/commit/392534477cc1f5cf0ec8470136104927b06bb999))
* refresh screenshots for the size presets ([c77113f](https://github.com/Berkayr/ai-usage-widget/commit/c77113f35f2b4dd8d19033200e7ff28301ed324f))
* refresh screenshots, galleries and README ([cbec8c9](https://github.com/Berkayr/ai-usage-widget/commit/cbec8c9ca43c40002111871467b7372568e77e96))
* say what uninstalling keeps on Linux ([7e982bb](https://github.com/Berkayr/ai-usage-widget/commit/7e982bb7e4996a7ca6b2ce0a88624e00f56bf32b))
* **security:** add security model for users and reviewers ([1ba2513](https://github.com/Berkayr/ai-usage-widget/commit/1ba2513b07baae164a458d87a59c223a6d058c28))
* show widget shapes in the README ([1f09d22](https://github.com/Berkayr/ai-usage-widget/commit/1f09d22809f77698c96058ad10922911ca2a97e9))
* state the MIT license consistently ([c76100e](https://github.com/Berkayr/ai-usage-widget/commit/c76100e565ec727ebcf88522364534ce02191634))
* suggest the msi for smart app control ([ada9eb3](https://github.com/Berkayr/ai-usage-widget/commit/ada9eb3cbd43914f326c4acf65c67b4e63ba6ac3))
* update for 10 themes, new sizes and settings layout ([c5dacad](https://github.com/Berkayr/ai-usage-widget/commit/c5dacad8fb32a576c43dfb9b196be5b2563490d6))
* update settings categories and Pastel Pink theme ([dd67832](https://github.com/Berkayr/ai-usage-widget/commit/dd6783283786262c3c435342f0f1b5a398ab4803))

## [0.2.1](https://github.com/Berkayr/ai-usage-widget/compare/v0.2.0...v0.2.1) (2026-11-28)


### Bug Fixes

* **footprint:** report unreadable PIDs and keep partial samples out of PSS ([ae9b118](https://github.com/Berkayr/ai-usage-widget/commit/ae9b118273c04cf8384613b7ed508f839711b8cf))

## [0.2.0](https://github.com/Berkayr/ai-usage-widget/compare/v0.1.0...v0.2.0) (2026-11-27)


### Features

* **history:** add opt-in Antigravity CLI usage history ([90357e0](https://github.com/Berkayr/ai-usage-widget/commit/90357e09aa36cf152e1acc15e98b3cca8c69877f))


### Bug Fixes

* **circular-rings:** wrap long pool names ([67b288e](https://github.com/Berkayr/ai-usage-widget/commit/67b288e3803e99e7e4384ff10fb0c146ebef4f27))
* **icons:** show the Kimi logo on light themes ([38b7877](https://github.com/Berkayr/ai-usage-widget/commit/38b7877bb2feb0cb28bd0a59f05fab8362dd352e))
* **linux:** destroy Settings webview on close ([c09e4ef](https://github.com/Berkayr/ai-usage-widget/commit/c09e4eff7d7b840a4bff7dbf827b4212eccb6f9b))
* **packaging:** make the panel launcher executable ([c2535be](https://github.com/Berkayr/ai-usage-widget/commit/c2535bec80123b18917cbcf55af265477ca9ae2c))
* **packaging:** point the panel launcher at installed sources ([9724012](https://github.com/Berkayr/ai-usage-widget/commit/9724012411c2d579eaeef487a469a0eda8ea0ef0))
* **panel:** keep rate-limited providers visible when all their pools are hidden ([8b3f7f0](https://github.com/Berkayr/ai-usage-widget/commit/8b3f7f057f90f570c70ab7f8f6e6fd0a9b67871f))
* **panels:** respect hidden pools in taskbar and panels ([7925f7a](https://github.com/Berkayr/ai-usage-widget/commit/7925f7a67d8fd08ee50bf68e3108af468dd6b93c))
* **plasmoid:** keep refresh failures until a refresh succeeds ([a182187](https://github.com/Berkayr/ai-usage-widget/commit/a182187bfb769d7b4c45f2e7454d49f5176137f0))
* **portrait:** restore side padding on compact cards ([f0bf053](https://github.com/Berkayr/ai-usage-widget/commit/f0bf053cdb4a14158548d973eabc66a04000dd5f))
* **widget:** close the context menu on selection and show refresh status ([7e561af](https://github.com/Berkayr/ai-usage-widget/commit/7e561af203202661fe9e1885962a4ce0a28ea4fb))
* **widget:** say checked instead of updated when no provider was remeasured ([1b00516](https://github.com/Berkayr/ai-usage-widget/commit/1b00516c3e0a7e2806f4844041186365edf7955b))
* **windows:** restore widgets minimized when a monitor is unplugged ([10ab9f4](https://github.com/Berkayr/ai-usage-widget/commit/10ab9f464acaa3b07b88d16ddd9293b0cdd7f481))

## [0.1.0](https://github.com/Berkayr/ai-usage-widget/releases/tag/v0.1.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* the app identifier and settings folder changed; the autostart entry and Windows Run value are migrated automatically.

### Features

* **app:** add an optional daily quote card ([dcbb480](https://github.com/Berkayr/ai-usage-widget/commit/dcbb48077042249333112443bb2b234d8e4e1636))
* **brand:** use the countdown ring logo ([60c98d6](https://github.com/Berkayr/ai-usage-widget/commit/60c98d692d144b37296a587afedf2e629d9ba0c2))
* **claude:** add opt-in local usage history from Claude Code logs ([91b5d37](https://github.com/Berkayr/ai-usage-widget/commit/91b5d37584a9430736401821cd0c4242916267c2))
* **codex:** read daily account token history from app-server ([fbe4ab0](https://github.com/Berkayr/ai-usage-widget/commit/fbe4ab0dc78f6bf2f708211e367002355c6ba324))
* **core:** expose every quota pool and model limit ([3f43bae](https://github.com/Berkayr/ai-usage-widget/commit/3f43baeb9c1aa5ed54aa434475ff757047b954a5))
* **history:** add today view and all-tools totals, keep history on screen ([49b7d88](https://github.com/Berkayr/ai-usage-widget/commit/49b7d8872c109cc97b1b1234aaf694bc5d796ce7))
* **history:** show usage history under cards, on click or in a side panel ([aa758a4](https://github.com/Berkayr/ai-usage-widget/commit/aa758a4b0a6e1783f156291a6ebea4ecadf36f67))
* **history:** stack providers in the side panel and move the toggle into the header ([0c2e114](https://github.com/Berkayr/ai-usage-widget/commit/0c2e11444d786728afb74a539390b6e6f4678411))
* **install:** add one-line Linux installer and install smoke job ([0704e85](https://github.com/Berkayr/ai-usage-widget/commit/0704e85c2a948bc9c82c1ed975e72f4997479f34))
* **kde:** use fixed warning colors by default ([348ae9f](https://github.com/Berkayr/ai-usage-widget/commit/348ae9f76c59b9257356b6cdc1aeb4a7a3db04f0))
* **layout:** add First in list as the default featured provider ([c8c4127](https://github.com/Berkayr/ai-usage-widget/commit/c8c41275290cb3051e26ac115a9969aa3ab0f1ee))
* **layout:** add fit-to-screen size mode using the usable work area ([41673b4](https://github.com/Berkayr/ai-usage-widget/commit/41673b418adda3df1b25b4007917db2cac5981b2))
* **layout:** choose provider order and the featured provider ([33e4fc9](https://github.com/Berkayr/ai-usage-widget/commit/33e4fc91b53f5a7a91894b34ae13d25196d8879d))
* **linux:** add layer-shell widget, panel integrations and packages ([fcc9739](https://github.com/Berkayr/ai-usage-widget/commit/fcc9739bccc37e08b7e5470648ec3ec993cad576))
* **linux:** blur behind glass themes on KDE ([4395426](https://github.com/Berkayr/ai-usage-widget/commit/43954267b43e9f065f44a01e878f24d92c5462a0))
* **linux:** redesign panel widgets and add login/layer settings ([de73a57](https://github.com/Berkayr/ai-usage-widget/commit/de73a576cd0cfda58fe39395d467a6b3b71ac9e9))
* **providers:** add Z.ai, Kimi, SiliconFlow and API spend readers ([c301858](https://github.com/Berkayr/ai-usage-widget/commit/c30185846d9343008951e04086c9056828a12b26))
* **providers:** show logos and explain providers without data ([dda4e51](https://github.com/Berkayr/ai-usage-widget/commit/dda4e51ff68c314163f6d7f8734ab65b68605c6e))
* **quotacore:** add an opt-in daily quote command ([5a55339](https://github.com/Berkayr/ai-usage-widget/commit/5a55339c0a37c1d2131615116d162ccc86d1185c))
* **quotacore:** give anniversaries, works and author notes for daily quotes ([5d406a2](https://github.com/Berkayr/ai-usage-widget/commit/5d406a229fe0459326c00b78cd8dc35855a24169))
* **quote:** readable quote card, top or bottom placement, gentler size steps ([be0b3d0](https://github.com/Berkayr/ai-usage-widget/commit/be0b3d0ee1bf24ed795066a18c816fe490fab319))
* rename the app to AI Usage ([2cd4d8f](https://github.com/Berkayr/ai-usage-widget/commit/2cd4d8f49531a317a4e892ea9588415cb83239f9))
* **runtime:** bundle python on windows and prefer an existing install ([62748ae](https://github.com/Berkayr/ai-usage-widget/commit/62748aed107131e2c88ddaa3b7fe906e893ccfc4))
* **settings:** add per-widget settings model ([891581a](https://github.com/Berkayr/ai-usage-widget/commit/891581a96a439d3c1c265da2b641fe1143fe02f2))
* **settings:** choose which quota pools and limits to show ([5edc226](https://github.com/Berkayr/ai-usage-widget/commit/5edc22694d79b1d962091c9a298d64b11bc13b21))
* **settings:** give the daily quote its own tab ([284a133](https://github.com/Berkayr/ai-usage-widget/commit/284a133d06b1feee3d911a344d74cfc73b648ac1))
* **settings:** move settings into a sidebar layout ([8b858ab](https://github.com/Berkayr/ai-usage-widget/commit/8b858abc301003aef1181f95db0f559759d5714b))
* **settings:** open settings in a separate window ([3700493](https://github.com/Berkayr/ai-usage-widget/commit/3700493d9e696ca04c5da92e9e375d1800f15a7d))
* **settings:** pick, add and remove widgets per monitor ([4070479](https://github.com/Berkayr/ai-usage-widget/commit/4070479b4ef9415b6faa059c9663e96418e9c04e))
* **settings:** rework pages and make save honest ([5a63864](https://github.com/Berkayr/ai-usage-widget/commit/5a63864edc39b89e8d750b3fc75410962adcb14a))
* **settings:** split appearance into theme, colors, shape and display tabs ([830fcda](https://github.com/Berkayr/ai-usage-widget/commit/830fcdaf4ee869d5207a6b2048ccdf18c7046d05))
* **theme:** add a reactor theme and real color modes on round shapes ([71de23f](https://github.com/Berkayr/ai-usage-widget/commit/71de23f063c17c4db179cf000e446002d37472c4))
* **theme:** add a system theme as the new default ([1573734](https://github.com/Berkayr/ai-usage-widget/commit/15737347e20cbdb8574812579b086a048dbb8fe3))
* **theme:** add calm color mode and accent edge setting ([ac1d0c2](https://github.com/Berkayr/ai-usage-widget/commit/ac1d0c254fbbc8fb466cfb964496a8dab221014a))
* **theme:** add circle and pill widget shapes ([f5be6b1](https://github.com/Berkayr/ai-usage-widget/commit/f5be6b1813cebad8ee6fa5e836a76dd7e43939c1))
* **theme:** add five size presets with one fixed aspect ratio ([84cd7b5](https://github.com/Berkayr/ai-usage-widget/commit/84cd7b56c86d732ce1be2118c19cff6cea0c0c5b))
* **theme:** add landscape and square widget shapes ([e4f33f3](https://github.com/Berkayr/ai-usage-widget/commit/e4f33f31de620f6bfef50331befbf4e3351f4d5b))
* **theme:** add light appearance and light taskbar strip ([f3bd5ed](https://github.com/Berkayr/ai-usage-widget/commit/f3bd5ed1c355a06c32112d9298c9e43aa362e9a5))
* **theme:** add mono color mode and a fixed dot count ([5aec2da](https://github.com/Berkayr/ai-usage-widget/commit/5aec2dad45c22eed301669998a63dcf99650e66b))
* **theme:** add seven themes and a theme picker ([63633b9](https://github.com/Berkayr/ai-usage-widget/commit/63633b9bebb4bdc490abedee7c1a4e3af423efb6))
* **theme:** label circle arcs and let users pick provider colors ([2b8a269](https://github.com/Berkayr/ai-usage-widget/commit/2b8a269e63a5c53846e38089faacba432d604f70))
* **themes:** add 12 palettes per theme and a custom palette editor ([c4726f1](https://github.com/Berkayr/ai-usage-widget/commit/c4726f19da564abb4665d0296410b05e4b640e65))
* **themes:** add clear glass, layer, aurora, crisp, pebble, glyph and pastel ([d097972](https://github.com/Berkayr/ai-usage-widget/commit/d097972626b6cbd7f48b992ae3b08571e3fbda56))
* **themes:** turn Pastel into a pink theme with Rose, Blush and Bubblegum palettes ([f1ce790](https://github.com/Berkayr/ai-usage-widget/commit/f1ce7902631d8bcc9e550f0a28e7ae2aad7604c4))
* **window:** open a window for each extra widget ([5eedc56](https://github.com/Berkayr/ai-usage-widget/commit/5eedc56f4c2375f8f9de18a60ef54535a7c4ddae))


### Bug Fixes

* **app:** add first-run provider picker and escape snapshot text ([eca7c1b](https://github.com/Berkayr/ai-usage-widget/commit/eca7c1bc98540b5605c3987c7bcaaf21bf832cbb))
* **bar:** mark snapshots older than 10 minutes as stale ([1bab369](https://github.com/Berkayr/ai-usage-widget/commit/1bab36963a0445b42f830251928db1c1f922a83f))
* **claude:** keep an explicit 0% from the status line ([b9ac444](https://github.com/Berkayr/ai-usage-widget/commit/b9ac444c50a3466864ff67c9ab81fd937c5ff86a))
* **claude:** keep cached usage windows when falling back to the cache ([826f232](https://github.com/Berkayr/ai-usage-widget/commit/826f2324795580cdc9eed78807736a697952f057))
* **codex:** accept app-server replies in any order ([9211282](https://github.com/Berkayr/ai-usage-widget/commit/9211282b2c119d99421ad6daa62f71b0a4585107))
* **config:** always report the claude history permission as a boolean ([c478411](https://github.com/Berkayr/ai-usage-widget/commit/c478411533fd7883255a7a3865984ccf218c45f2))
* **core:** ask before reading credentials and harden local files ([d15709c](https://github.com/Berkayr/ai-usage-widget/commit/d15709c05bf3730195ee66c4574034792b912b87))
* **core:** retry atomic writes on Windows sharing violations ([90b0515](https://github.com/Berkayr/ai-usage-widget/commit/90b05155f50107080abdf3c51ee732578816901f))
* **daemon:** don't back off on disabled providers ([9145b57](https://github.com/Berkayr/ai-usage-widget/commit/9145b57e4b7338397efa9f30cd1ceac0c7dd758b))
* **history:** count the final output tokens of streamed messages ([46b88c4](https://github.com/Berkayr/ai-usage-widget/commit/46b88c4ca281556010ff5b9d8b53867f8c99563e))
* **history:** keep all-tools totals the same on every square page ([4c208e5](https://github.com/Berkayr/ai-usage-widget/commit/4c208e52938c33768c1bd1974c453ba94052d60d))
* **history:** keep yesterday's hourly usage out of today's chart ([78af9d6](https://github.com/Berkayr/ai-usage-widget/commit/78af9d6f434f4c9d252db6974510d04c04f361db))
* **history:** show missing account days as no data instead of zero ([7432279](https://github.com/Berkayr/ai-usage-widget/commit/74322794e0414e45f83e8def42aeba7fe2b01ef1))
* **history:** skip a log file that is not valid UTF-8 instead of dropping all history ([424b5ae](https://github.com/Berkayr/ai-usage-widget/commit/424b5aecbf0a8db0f973dd38f615c6371395ff5b))
* **hooks:** keep finished chained commands from reporting a timeout ([7f33a85](https://github.com/Berkayr/ai-usage-widget/commit/7f33a8509f6dda447b98ee18d3d113e7d5819f87))
* **kde:** give the expanded panel view a usable size ([050e4c9](https://github.com/Berkayr/ai-usage-widget/commit/050e4c95060c10250f81cdb2eee6f659256b7fde))
* **layer:** use provider logos instead of placeholder squares ([3a48c65](https://github.com/Berkayr/ai-usage-widget/commit/3a48c653e645323bb6d7597dfaaf2f14ab049a92))
* **layout:** fill portrait cards and scroll instead of clipping them ([5b11c2c](https://github.com/Berkayr/ai-usage-widget/commit/5b11c2c20b0ac1e4856919c9f8c8498cb0d054c1))
* **layout:** keep every shape usable at every size ([7ca965b](https://github.com/Berkayr/ai-usage-widget/commit/7ca965b002b64c02387b4c6d5e570a46d2649c6b))
* **layout:** keep extra pools inside pill and circle shapes ([fedda7b](https://github.com/Berkayr/ai-usage-widget/commit/fedda7b37007b47ed8fffd15af60e403cf161ea1))
* **layout:** keep usage cards unscrolled with a featured provider and quote ([1a094c2](https://github.com/Berkayr/ai-usage-widget/commit/1a094c27115f5349f72a18976abc8457347fc5c1))
* **layout:** keep widget size independent of theme, add strip shape ([3ecf8f2](https://github.com/Berkayr/ai-usage-widget/commit/3ecf8f219a4e49f2c31676d15592d7038eee81ab))
* **layout:** wrap quota labels when a portrait card is too narrow ([26dd4cf](https://github.com/Berkayr/ai-usage-widget/commit/26dd4cf0536d3041ed8971ccab35adb5f2f230d2))
* **linux:** draw the widget on layer-shell surfaces ([335ecfd](https://github.com/Berkayr/ai-usage-widget/commit/335ecfdaa8a768f6b3e1a246d99a37d22598e253))
* **linux:** escape desktop entry paths so unusual home folders still launch ([e5476a0](https://github.com/Berkayr/ai-usage-widget/commit/e5476a0b98194e9550baa21e1d4ac60f21bafd3d))
* **linux:** name the AppImage icon after the binary ([895e0d1](https://github.com/Berkayr/ai-usage-widget/commit/895e0d1f4b44a7e2fe00b7b0346277465827c43b))
* **linux:** stop pinning the X11 window at its first clipped height ([f0ea1d1](https://github.com/Berkayr/ai-usage-widget/commit/f0ea1d1d35b50fc287610d5af55f1c03d1b4d79d))
* **linux:** stop the snapshot watcher from re-reading in a loop ([2bedc09](https://github.com/Berkayr/ai-usage-widget/commit/2bedc09ca78dc77156b28aed01b7c4f59c316297))
* **packaging:** make the rpm installable on Fedora ([50cc371](https://github.com/Berkayr/ai-usage-widget/commit/50cc3711e6c5c46cb9e911a525a23eb23126218b))
* **portrait:** keep every card and the footer reachable on short screens ([ae4a138](https://github.com/Berkayr/ai-usage-widget/commit/ae4a1381b0469e7dfa7e287d1ccc0537e3958de9))
* **portrait:** size cards to content so the gaps go away ([a5ffa1d](https://github.com/Berkayr/ai-usage-widget/commit/a5ffa1d6db01056305dfba62ef07f1320923f8d4))
* **quotacore:** strip tilde separators from quote author and work ([c471a20](https://github.com/Berkayr/ai-usage-widget/commit/c471a20427a36b223f40b2739a22ada409cf9bc6))
* **quote:** shrink long quotes to fit and show a real ellipsis ([d7f96fe](https://github.com/Berkayr/ai-usage-widget/commit/d7f96feacd1a6c32bc178af0ba079b2f8400e057))
* **settings:** accept fractional widget scale ([eba3c5a](https://github.com/Berkayr/ai-usage-widget/commit/eba3c5af9787725b1b70fdd37310aed59b549452))
* **settings:** disable featured controls where they have no effect ([e83b151](https://github.com/Berkayr/ai-usage-widget/commit/e83b1518c13e517a632c179b09d8f77257e8ae58))
* **settings:** keep history permission in sync when a later save step fails ([90a1ae7](https://github.com/Berkayr/ai-usage-widget/commit/90a1ae7363f2ca40976ff165ad105f3e95563444))
* **settings:** keep known fields when the settings file is partial ([6a77d85](https://github.com/Berkayr/ai-usage-widget/commit/6a77d858b00bf02bda8ceee5090c0f073804af70))
* **settings:** keep old settings and re-place after resize ([14e0c65](https://github.com/Berkayr/ai-usage-widget/commit/14e0c653c47b35cb9f79162f80e9d90b300e651a))
* **settings:** move provider colors to providers, fix clipped and low-contrast controls ([52c8762](https://github.com/Berkayr/ai-usage-widget/commit/52c8762473cd8cc19714a42234dfcf0475952ec1))
* **theme:** fill the last grid cell in two-column themes ([15d1f69](https://github.com/Berkayr/ai-usage-widget/commit/15d1f695463116718c3b1464ce4a3ccee5ce674d))
* **theme:** keep all text readable on its real surface ([49a1d84](https://github.com/Berkayr/ai-usage-widget/commit/49a1d84f03204588d80854069d4b2ae678dae2a5))
* **theme:** keep digit proportions fixed at every size ([0b00aa5](https://github.com/Berkayr/ai-usage-widget/commit/0b00aa5e790be2c1f39e8d264b92426c117da05b))
* **theme:** keep hidden status badge text hidden at readable sizes ([a7a3862](https://github.com/Berkayr/ai-usage-widget/commit/a7a38621db684fa32d26bb1853420cd4cd8d37c6))
* **theme:** make the widget background opaque by default ([6c5bf07](https://github.com/Berkayr/ai-usage-widget/commit/6c5bf078f57d52394fe5e2a996d394b85bf36636))
* **themes:** keep quota labels on one line ([1bf1315](https://github.com/Berkayr/ai-usage-widget/commit/1bf1315a83ed1aa1f6975b192551d8a5b4519e2d))
* **themes:** keep reworked cards inside tight screen-fit sizes ([a924951](https://github.com/Berkayr/ai-usage-widget/commit/a9249513bd2564a9e5050ca48f93b3d24c647d5b))
* **themes:** rework aurora, crisp, layer, brutalist, reactor, rings and strip cards ([f8ed74b](https://github.com/Berkayr/ai-usage-widget/commit/f8ed74b368160db4cb4c8f8399217c365860c570))
* **widget:** hide the plan badge instead of truncating it ([df0be90](https://github.com/Berkayr/ai-usage-widget/commit/df0be905afaac80ebabe3173ce3bd13f0ea4f176))
* **widget:** keep unsaved settings previews out of shortcut saves ([5c666bb](https://github.com/Berkayr/ai-usage-widget/commit/5c666bb80e062707376ce190a7e77b7d73025a32))
* **widget:** never show sample quota after a live startup failure ([d10bfa1](https://github.com/Berkayr/ai-usage-widget/commit/d10bfa12a13c8168bac3a73e5893f4fbcb4db20f))
* **widget:** point empty states to settings instead of the core name ([0bd3819](https://github.com/Berkayr/ai-usage-widget/commit/0bd38195f2d47f6e7b65d77adf04c8800877422a))
* **widget:** stack cramped usage rows and compact the landscape quote ([7ad84dc](https://github.com/Berkayr/ai-usage-widget/commit/7ad84dc7d463f8102840a7340d5ff1300384f65c))
* **widget:** stop text overlapping across themes and add an overlap check ([9c9526e](https://github.com/Berkayr/ai-usage-widget/commit/9c9526e9fc92fe033250ca02adaf47a37b521ec2))
* **window:** remember requested size so an X11 resize is not undone ([30ccc2e](https://github.com/Berkayr/ai-usage-widget/commit/30ccc2e61d48cb0b8748f47030939124e849e7e7))
* **windows:** align the circle and pill region with the client area ([7a44ce0](https://github.com/Berkayr/ai-usage-widget/commit/7a44ce0f9da3bb92e1c8bd40c6a9235088ba2f68))
* **windows:** drop the bundled Python when switching NSIS editions ([14f2b38](https://github.com/Berkayr/ai-usage-widget/commit/14f2b380739049f535fda4173943d7b79001e4b8))
* **windows:** open settings off the main thread to avoid a WebView2 deadlock ([4df8c64](https://github.com/Berkayr/ai-usage-widget/commit/4df8c64ba746e8a0f273a6e300a2b5e9de8e1764))
* **windows:** place the widget from the requested size, not the stale one ([88dbd68](https://github.com/Berkayr/ai-usage-widget/commit/88dbd6800ef3d18d8bf807db781b0ac7ffb3835a))


### Performance Improvements

* **app:** trim webview features, timers and release binary size ([b7e8201](https://github.com/Berkayr/ai-usage-widget/commit/b7e820172b23022b7575d0498a554811e9e12924))
* **core:** skip unchanged snapshot writes and load only enabled providers ([5ae4454](https://github.com/Berkayr/ai-usage-widget/commit/5ae44549e65da5cd603bc2451485470375b3e888))


### Documentation

* add circle and pill to the shapes gallery ([b42016a](https://github.com/Berkayr/ai-usage-widget/commit/b42016a01a8e74ad4c32d4b1334a6ffac8d2bbcd))
* **design:** add logo candidates ([9948881](https://github.com/Berkayr/ai-usage-widget/commit/9948881786b41b306f92e7685d68f81c68423efd))
* **install:** drop the python requirement from windows setup ([5809ad8](https://github.com/Berkayr/ai-usage-widget/commit/5809ad898334ef101125984b999e872fba00cb67))
* **perf:** add footprint script and performance notes ([0b1b72d](https://github.com/Berkayr/ai-usage-widget/commit/0b1b72d0ad0ab06973ef7e3d9b4b9ac4811f0122))
* point installation to the releases page ([809adef](https://github.com/Berkayr/ai-usage-widget/commit/809adef802b8726290fd51417456857df4d32e7e))
* **readme:** lead with the system theme ([fc24ca6](https://github.com/Berkayr/ai-usage-widget/commit/fc24ca6b6b1c171968cf4c12c88b8c70db91efba))
* **readme:** note the Smart App Control limit on unsigned installers ([24c147e](https://github.com/Berkayr/ai-usage-widget/commit/24c147e3a4ca7da1b4a711c8b3e29cee0983fa10))
* **readme:** rewrite readme with screenshots and docs pages ([5b08b40](https://github.com/Berkayr/ai-usage-widget/commit/5b08b40bcba2ac7d753a66389b88822441bd4870))
* **readme:** show all themes in screenshots ([7ef3541](https://github.com/Berkayr/ai-usage-widget/commit/7ef3541e5c40641515c8d5ce4e98b05f12f6bd60))
* **readme:** show more themes and palettes across the page ([006d102](https://github.com/Berkayr/ai-usage-widget/commit/006d102bd55aa83f672ccf306c81430862db6328))
* record current Linux footprint measurements ([cbb5496](https://github.com/Berkayr/ai-usage-widget/commit/cbb5496607bf79de4daedd27296fc505031b2efc))
* record tested Linux platforms ([9c50fe9](https://github.com/Berkayr/ai-usage-widget/commit/9c50fe9e7157b0be010cdf961a2f4e57a8f3f908))
* refresh circle screenshots ([aaa5800](https://github.com/Berkayr/ai-usage-widget/commit/aaa5800da9518172e58b02b600bd585684560502))
* refresh readme with new themes, history and settings screenshots ([232e1a7](https://github.com/Berkayr/ai-usage-widget/commit/232e1a72af34055bf7c1086174d78e1e09ca0074))
* refresh release notes for a public repository ([6dccf73](https://github.com/Berkayr/ai-usage-widget/commit/6dccf73176207738d2e53eaabe12b8f59387d6f6))
* refresh screenshots at real window sizes ([de87544](https://github.com/Berkayr/ai-usage-widget/commit/de87544a3639befd015f6465d846e237684bb9fb))
* refresh screenshots for quotes, layout and reactor ([3925344](https://github.com/Berkayr/ai-usage-widget/commit/392534477cc1f5cf0ec8470136104927b06bb999))
* refresh screenshots for the size presets ([c77113f](https://github.com/Berkayr/ai-usage-widget/commit/c77113f35f2b4dd8d19033200e7ff28301ed324f))
* refresh screenshots, galleries and README ([58ec79a](https://github.com/Berkayr/ai-usage-widget/commit/58ec79a61b22adc38763cb97db00fa35199c7479))
* say what uninstalling keeps on Linux ([6584de7](https://github.com/Berkayr/ai-usage-widget/commit/6584de70504e43da590c7e0d7fef02cb309c6c69))
* **security:** add security model for users and reviewers ([1ba2513](https://github.com/Berkayr/ai-usage-widget/commit/1ba2513b07baae164a458d87a59c223a6d058c28))
* show widget shapes in the README ([1f09d22](https://github.com/Berkayr/ai-usage-widget/commit/1f09d22809f77698c96058ad10922911ca2a97e9))
* state the MIT license consistently ([c76100e](https://github.com/Berkayr/ai-usage-widget/commit/c76100e565ec727ebcf88522364534ce02191634))
* suggest the msi for smart app control ([68d3e6d](https://github.com/Berkayr/ai-usage-widget/commit/68d3e6dcfd8028bb585fe3ae21537b5f82497fe6))
* update for 10 themes, new sizes and settings layout ([c5dacad](https://github.com/Berkayr/ai-usage-widget/commit/c5dacad8fb32a576c43dfb9b196be5b2563490d6))
* update settings categories and Pastel Pink theme ([5bdb11a](https://github.com/Berkayr/ai-usage-widget/commit/5bdb11a60bf44425c262d64006b255dcf95a094d))

## [Unreleased]

### Added

- Settings widget picker with monitor selection, naming, category resets, inline removal, shared-field notes, and Save/Revert across all widgets.
- Optional per-widget settings records with validated monitor placement, inherited display overrides and widget-aware load/save commands.
- Additional widget windows synchronized at startup and on settings saves; each hides when its monitor disconnects and returns to its saved position on reconnection, recreating closed Wayland layer surfaces.

- Usage history below cards, on card activation or in an attached side panel, with optional API price estimates, model shares, activity heatmap and computer splitting.
- History settings with explicit, saved permission to read local Claude Code logs (off by default).

- Clear Glass, Layer, Aurora, Crisp, Pebble, Glyph and Pastel themes with light/dark palettes and picker previews.
- Theme-selected KDE Plasma background blur on Wayland and X11, with a tint fallback on unsupported desktops.
- Theme-selected Windows desktop Acrylic on Windows 11 and Blur on Windows 10, cleared when switching to an opaque theme.

- Windows and Linux desktop widget with seventeen themes, five shapes and shared local quota snapshots.
- Provider opt-in, palette editing/import/export, layout and placement settings.
- Panel integration sources for Plasma, GNOME Shell, Waybar, Polybar and i3blocks.

### Fixed

- Additional widgets keep their own corner, position lock and screen reservations on Linux and Windows.
- Match KDE blur corners to the theme radius for Portrait, Landscape and Square without changing the input mask.

- Prefer the ext background-effect protocol on newer KWin sessions and restrict Wayland/X11 blur to the shared window shape mask.

### Changed

- Route widget commands, native shape/blur/placement state, window geometry files and frontend preferences by widget identity while retaining legacy main files and Main taskbar behavior.

- Older versions discard the optional `widgets` records when saving a newer settings file.

- Group settings into six sidebar categories with remembered selection, keyboard navigation and horizontal tabs below 560 px.
- Preview settings live, with S1 row cards, accessible switches, a counted changes footer and verified persistence on Save; Revert and Discard restore saved settings.

- Inline provider logos, setup guidance for enabled providers without data, and equal Portrait card heights across themes.
- OpenRouter reports missing balance values explicitly without inventing a zero balance.

- Bolder Dot Matrix quota labels, round marks and full-width tracks.
- Refresh the README with all seventeen themes, glass, provider status, sidebar settings and three usage-history layouts, using fictional fixtures. Document optional local-log access and account-wide Codex history.
- Documentation galleries generated from fictional fixtures, with local-link and empty-space checks.

Installers, distribution packages and signing remain part of the v0.1 release plan; see the [roadmap](README.md#roadmap) and [release process](docs/releases.md).
