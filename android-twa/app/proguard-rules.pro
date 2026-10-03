# ProGuard rules for Bkonekte TWA

# Keep the TWA activity
-keep class com.google.androidbrowserhelper.trusted.** { *; }

# Keep your app class
-keep class com.bkonekte.app.** { *; }

# Keep BuildConfig
-keep class com.bkonekte.app.BuildConfig { *; }