# AI0506 Calendar for Android

Native Android client for AI0506 Calendar, written with Kotlin and Jetpack Compose.

The UI follows the production web client's Apple-style visual system while
remaining fully native. Phone windows use the web month + Preview/Timeline
stack; tablet windows expose Month/Week/Day navigation, the inspector, category
and tag filters, and centered forms. Event and Deadline details open read-only
first, with a separate Edit action for native update support.

## Run locally

1. Open this `android/` folder in Android Studio.
2. Confirm that Android SDK Platform 35 is installed.
3. Connect a device or start an API 35 emulator.
4. Run the `app` configuration.

The debug build points to `https://calendar.ai0506.com/` by default. For a local Pages/D1 smoke test, leave source code unchanged and build with:

```powershell
.\gradlew.bat :app:assembleDebug -PcalendarApiBaseUrl=http://10.0.2.2:8789/
```

`10.0.2.2` is the Android emulator's route to this computer. Cleartext traffic is enabled only in the debug manifest; release builds keep the production HTTPS URL.

## Verification

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

The responsive regression sizes used by the project are:

- Phone portrait: `1260 x 2880`, density `480`.
- Tablet landscape: `2800 x 1840`, density `480`.

New/Edit sheets keep their action footer above the Android gesture-navigation
area; the form body scrolls independently. Verify both light and dark system
themes when changing shared UI components.

The launcher icon is generated from `public/favicon.png`. Legacy density-specific
icons and an API 26+ adaptive icon are both provided, so launchers may apply a
circle, rounded square, or other device mask without clipping the calendar mark.
The top bar mirrors the web grouping: Previous/Title/Next/Today form the
navigation group, while view mode, notifications, and New form the action group.

Tag metadata follows the web client's loading strategy: Events, Deadlines, and
Categories render first, while Tags and category suggestions load in a separate
optional request. New/Edit forms show six 94 x 32 dp chips in a stable three-column
grid by default, then expose the remaining chips through Show more/Show less.
Selections are limited to five, with category suggestions ordered first.

## Release signing

Do not commit a signing key. Copy `keystore.properties.example` to a private `keystore.properties` file beside this README, then replace all placeholders. When that private file exists, the Gradle release build automatically uses its key; without it, release compilation remains unsigned and is not store-ready. Keep the keystore outside Git and back it up securely. The current project can build and test debug APKs without any signing secret.
