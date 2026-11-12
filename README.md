# DON MUSE

موسيقى · راديو · تلفزيون · قرآن · موسيقاي — **تطبيق محلي أولًا** بواجهة React واحدة ونسخة أندرويد هجينة: الواجهة محلية داخل APK، والصوت والصلاحيات والتنزيلات والمنبّهات والويدجت بتنفيذ Kotlin أصلي.

لا يوجد خادم للتطبيق، ولا قاعدة بيانات، ولا حساب إلزامي. طلبات الشبكة تذهب إلى مصادر الوسائط العامة التي يختارها المستخدم فقط. المساعد الذكي اختياري ويتصل بالمزوّد الذي تحدده أنت.

## ما يعمل فعليًا

| الجزء | التنفيذ |
|---|---|
| الواجهة | Vite 7 + React 19 + React Router + Zustand + Tailwind 4. تعمل في المتصفح وداخل APK من ملفات مضمّنة، لا من موقع مستضاف. |
| الصوت | محرك واحد في الواجهة. في أندرويد يتولى Media3/ExoPlayer التشغيل والطابور والخلفية؛ في المتصفح Web Audio/cached elements، وYouTube IFrame عند الحاجة. |
| الخلفية والإشعار | `MediaSessionService` وإشعار MediaStyle، تركيز الصوت، فصل السماعات، أزرار Bluetooth/شاشة القفل. |
| ويدجت | مشغّل 4×2 ومصغّر 4×1؛ تشغيل/إيقاف/التالي/السابق/إيقاف كامل. زر التشغيل بعد موت العملية يستعيد آخر طابور محفوظ. |
| موسيقاي | فحص MediaStore وقراءة الملفات في مكانها. SAF لاختيار ملفات ومنح صلاحيات مستمرة. في المتصفح File System Access/منتقي الملفات. |
| التنزيلات | OkHttp متدفق + FFmpeg محلي للتحويل/القص، ثم نشر الملف في Music/Movies عبر MediaStore. مقاطع الراديو المحلية تحفظ بايتاتها مباشرة بلا شبكة أو إعادة تحويل. |
| الراديو | تسجيل محلي في الذاكرة، تحديد مقطع، حفظ في Cache Storage. أندرويد يحوّل إلى MP3؛ المتصفح يحفظ الترميز الأصلي MP3/AAC بامتداد صحيح. |
| القرآن | روابط HTTPS مباشرة للسور الكاملة من مكتبات متعددة، مع اختيار الجودة حسب المصدر المتاح. لا يُقصّ القرآن. |
| المنبّه | `AlarmManager.setAlarmClock`، شاشة إيقاظ، صوت النظام، غفوة 5 دقائق، تكرار أسبوعي، وإعادة جدولة بعد إعادة التشغيل/تغيير الوقت. |
| التخزين | أندرويد: ملف JSON خاص ذري داخل `filesDir`. المتصفح: localStorage للبيانات الصغيرة وCache Storage/IndexedDB للملفات حيث يلزم. نسخ احتياطي JSON يدوي. |
| التصميم | خلفيات محلية، ثيمات وكثافات، أغلفة أكبر، عناصر لمس أوضح، RTL، وتقليل الحركة. |

### حدود مهمة وصادقة

- DRM، تسجيل الدخول المدفوع، Spotify/Apple Music/Deezer، وتجاوز CAPTCHA غير مدعومة. روابط المنصات التي يحلها NewPipeExtractor تعتمد على ما تتيحه المنصة علنًا وقد تتغير أو تفرض حدودًا.
- المتصفح مقيد بـ CORS ولا يضمن تنزيل كل رابط أو تشغيله في الخلفية على كل نظام. الإمكانات الكاملة للخلفية والتحويل والحفظ في مكتبة النظام تخص APK.
- توفر محطات الراديو/التلفزيون والتلاوات يعتمد على المصادر الخارجية. الاختبارات تتحقق من المنطق والعقود، ولا تضمن أن كل CDN يعمل في كل بلد أو إلى الأبد.
- تعديل الوسوم يكتب حقول MediaStore عندما يسمح النظام. تضمين الغلاف داخل الملف مدعوم لـ MP3 وM4A؛ بقية الصيغ ترفض العملية برسالة واضحة بدل ادعاء نجاح وهمي.
- المنبّه يحترم إذن المنبهات الدقيقة وسياسات عدم الإزعاج/البطارية. لا يوجد تجاوز لها. جرّبه قبل الاعتماد عليه.
- لا يُستأنف الصوت تلقائيًا عند فتح التطبيق من الصفر. استعادة الطابور من الويدجت تتطلب ضغطة تشغيل صريحة.

## التشغيل محليًا

المتطلبات: Node.js 22 وnpm.

```bash
npm ci --ignore-scripts
npm run dev                 # http://localhost:3000
```

الفحوص وبناء المتصفح:

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run check:android
npm run build               # dist/
npm run preview
```

`/api/...` داخل `src/lib/local/client.ts` **اسم محول توافق داخلي فقط**، وليس خادمًا أو endpoint منشورًا.

## بناء APK

المتطلبات: JDK 17، Android SDK platform 35 وbuild-tools التي يطلبها AGP 8.5.2. Gradle wrapper 8.7 مضمّن مع checksum موثّق؛ لا حاجة لتثبيت Gradle عالميًا.

```bash
npm ci --ignore-scripts
npm run bundle              # يبني الواجهة بمسارات نسبية إلى android/app/src/main/assets/www ثم يفحصها
cd android
./build-apk.sh              # debug + Android lint
# أو:
./gradlew :app:assembleDebug :app:assembleRelease :app:lintDebug --no-daemon
```

الناتج:

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/apk/release/app-release.apk`

الإصدار الحالي: `versionCode 30` / `versionName 3.0.0`، `minSdk 26`، `target/compileSdk 35`، ومعماريّتا `arm64-v8a` و`x86_64` لأن حزمة FFmpeg المستخدمة تنشرهما.

### التوقيع

بدون أسرار توقيع، يكون release **موقّعًا بمفتاح debug للتجربة فقط** وتسميه CI بوضوح `DEV-SIGNED`. للإصدار الحقيقي أضف أسرار GitHub:

- `DONMUSE_KEYSTORE_B64`
- `DONMUSE_STORE_PASSWORD`
- `DONMUSE_KEY_ALIAS`
- `DONMUSE_KEY_PASSWORD`

محليًا يمكن ضبط `DONMUSE_KEYSTORE` كمسار ملف keystore مع متغيرات كلمات المرور/alias نفسها. لا تضع keystore أو كلمات مرور في Git.

### GitHub Actions

- `ci.yml`: تثبيت نظيف، typecheck، lint بلا تحذيرات، اختبارات، فحص عقد أندرويد، بناء المتصفح وحزمة APK، وnpm audit.
- `android-apk.yml`: يجمّع Kotlin فعليًا، يبني debug/release، يشغّل Android lint، ويرفع APKs كـ artifacts. على `main` يحدّث release المتدحرج `apk-latest`.
- `pages.yml`: يبني Vite لمسار المستودع على GitHub Pages ويضيف `404.html` كـ SPA fallback. فعّل **Settings → Pages → GitHub Actions**.

## بنية سريعة

```text
src/                      واجهة React ومحرك الصوت والمخازن المحلية
src/lib/platform/native.ts  عقد الجسر الوحيد بين الواجهة وKotlin
src/lib/data/             بيانات القرآن/الراديو/التلفزيون وروابطها المباشرة
public/                   خلفيات وPWA shell محلي
android/app/src/main/java/fm/donmuse/app/
  playback/               ExoPlayer + MediaSession + EQ حقيقي
  download/               تنزيل متدفق + تحويل + MediaStore
  alarms/                 جدولة وخدمة وشاشة المنبّه
  widget/                 RemoteViews ومزوّدا الويدجت
  bridge/                 جسر محمي برمز عشوائي + تخزين ذري
  data/                   HTTP/SSRF guard، NewPipeExtractor، SAF، FFmpeg
scripts/check-android.mjs فحص fail-closed للمكونات والموارد والجسر والحزمة
tests/                   اختبارات Node للمنطق والعقود
```

تفاصيل أندرويد وقائمة الاختبار اليدوي في [`docs/ANDROID.md`](docs/ANDROID.md). القرارات والتخزين في [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## الترخيص

المشروع موزّع تحت **GPL-3.0** (انظر `LICENSE`) لتوافق توزيع APK المرتبط بـ NewPipeExtractor وFFmpeg. راجع [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) والتزامات المصدر/الإشعارات قبل نشر ثنائيات.

Developer: **Joseph M.R**
