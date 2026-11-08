plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fm.donmuse.app"
    compileSdk = 35

    val webHost: String = (project.findProperty("webHost") as String?)
        ?: System.getenv("DONMUSE_WEB_HOST")
        ?: "donmuse.pages.dev"

    defaultConfig {
        applicationId = "fm.donmuse.app"
        minSdk = 26
        targetSdk = 35
        // Bumped for every published build: Android refuses to *update* an
        // installed app whose versionCode is not higher, and mixed signatures
        // for the same version look like a tampered package.
        versionCode = 21
        versionName = "2.1.0"
        vectorDrawables { useSupportLibrary = true }
        // Where the UI is served from (override: -PwebHost=… / DONMUSE_WEB_HOST).
        buildConfigField("String", "WEB_HOST", "\"$webHost\"")

    }

    buildFeatures {
        compose = false
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            // The build must be upgradeable: every published APK has to carry the
            // SAME signing key, otherwise Android refuses the update ("app not
            // installed") and the user has to uninstall first. CI therefore
            // generates one stable keystore (DONMUSE_KEYSTORE_B64) or reuses the
            // debug keys; this block only picks a keystore that exists.
            val store = System.getenv("DONMUSE_KEYSTORE") ?: "donmuse-release.jks"
            val f = file(store)
            if (!f.exists()) {
                val debug = signingConfigs.getByName("debug")
                storeFile = debug.storeFile
                storePassword = debug.storePassword
                keyAlias = debug.keyAlias
                keyPassword = debug.keyPassword
            } else {
                storeFile = f
                storePassword = System.getenv("DONMUSE_STORE_PASSWORD") ?: "donmuse"
                keyAlias = System.getenv("DONMUSE_KEY_ALIAS") ?: "donmuse"
                keyPassword = System.getenv("DONMUSE_KEY_PASSWORD") ?: "donmuse"
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
