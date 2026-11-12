# Third-party notices

DON MUSE's combined Android distribution links GPL/copyleft components. The project license is GPL-3.0; see `LICENSE`. This file is a starting inventory, not a substitute for reviewing each binary's license/source obligations before publication.

| Component | Version used | Upstream / license information |
|---|---|---|
| NewPipeExtractor | v0.27.1 | https://github.com/TeamNewPipe/NewPipeExtractor — GPL-3.0; corresponding source is the pinned tag. |
| FFmpegKit maintained full | 8.1.9 | https://github.com/ffmpegkit-maintained/ffmpeg — FFmpegKit LGPL-3.0; the *full* binary bundle includes FFmpeg and external codec libraries with their own GPL/LGPL terms. Review the exact build configuration and provide corresponding source/offers required for your distribution. |
| AndroidX Media3 | 1.4.1 | https://github.com/androidx/media — Apache-2.0. |
| AndroidX Core/Activity/WebKit/DocumentFile | versions in `android/app/build.gradle.kts` | https://github.com/androidx/androidx — Apache-2.0. |
| OkHttp | 4.12.0 | https://github.com/square/okhttp — Apache-2.0. |
| Kotlin coroutines | 1.8.1 | https://github.com/Kotlin/kotlinx.coroutines — Apache-2.0. |
| Gradle wrapper | 8.7 | https://github.com/gradle/gradle — Apache-2.0; wrapper JAR/distribution SHA-256 pinned and checked. |
| React / React DOM | 19.2.6 | https://github.com/facebook/react — MIT. |
| Vite, React Router, Zustand, Tailwind, Framer Motion, hls.js, lucide, simple-icons, sonner, clsx, tailwind-merge | lockfile versions | Respective upstream licenses in `node_modules` and package metadata; retain notices when redistributing. |

The repository contains the application source and reproducible dependency pins. When distributing APKs outside a source repository, include this notice, the GPL text, and a written offer/links satisfying corresponding-source requirements for the exact FFmpeg/extractor binaries you ship. Do not remove upstream copyright notices.
