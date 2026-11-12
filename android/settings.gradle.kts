pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // NewPipe's official Android app consumes this exact JitPack artifact.
        maven(url = "https://jitpack.io") { content { includeGroup("com.github.TeamNewPipe"); includeGroup("com.github.teamnewpipe") } }
    }
}
rootProject.name = "DON MUSE"
include(":app")
