plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fm.donmuse.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fm.donmuse.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 30
        versionName = "3.0.0"
        vectorDrawables { useSupportLibrary = true }
        // FFmpegKit 8.1.9 publishes these two ABIs. Do not silently install a
        // broken universal APK on an unsupported 32-bit device.
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        buildConfigField("String", "UI_ORIGIN", "\"https://appassets.androidplatform.net\"")
    }

    buildFeatures { compose = false; buildConfig = true }

    signingConfigs {
        create("release") {
            val external = System.getenv("DONMUSE_KEYSTORE")?.let(::file)
            if (external != null && external.isFile) {
                storeFile = external
                storePassword = System.getenv("DONMUSE_STORE_PASSWORD")
                keyAlias = System.getenv("DONMUSE_KEY_ALIAS")
                keyPassword = System.getenv("DONMUSE_KEY_PASSWORD")
            } else {
                // Installable development APK only. CI names it explicitly;
                // never describe a debug signature as a production signature.
                val debug = signingConfigs.getByName("debug")
                storeFile = debug.storeFile
                storePassword = debug.storePassword
                keyAlias = debug.keyAlias
                keyPassword = debug.keyPassword
            }
        }
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/DEPENDENCIES", "META-INF/INDEX.LIST")
    }
}

// Fail before compilation if someone removes the locally bundled frontend.
val requireBundledUi by tasks.registering {
    doLast {
        val index = file("src/main/assets/www/index.html")
        check(index.isFile && index.length() > 100) { "Missing bundled UI. Run npm run bundle at the repository root first." }
        check(file("src/main/assets/www/native-bootstrap.js").isFile) { "Missing native bootstrap in bundled UI." }
    }
}
tasks.named("preBuild") { dependsOn(requireBundledUi) }

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.27.1")
    implementation("dev.ffmpegkit-maintained:ffmpeg-kit-full:8.1.9")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")
}
