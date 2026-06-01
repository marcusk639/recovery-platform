# Phase 01: Foundation + Working Login Flow

This phase bootstraps the entire Maestro E2E suite from scratch. It creates the `.maestro/` folder structure inside `mobile/`, writes the shared helper subflows (launch, login), and delivers the first working test — the login flow — validated by actually running it via the Maestro MCP against an iOS simulator. By the end of this phase `maestro test mobile/.maestro/auth/login.yaml` will run and exercise the login screen. All later phases build on this foundation.

## Tasks

- [ ] Fetch the Maestro cheat sheet so the correct YAML syntax is known before writing any flows:
  - Call `mcp__maestro__cheat_sheet` with no arguments
  - Skim the output for: `launchApp`, `tapOn`, `inputText`, `assertVisible`, `waitForAnimationToEnd`, `runFlow`, and `env` variable injection syntax
  - Note the correct `appId` field position (top-level vs inside launchApp) and any iOS-specific flags

- [ ] Create the `.maestro/` directory structure under `mobile/`:

  ```
  mobile/.maestro/
  ├── _helpers/
  ├── auth/
  ├── operator/
  ├── guest/
  ├── resident/
  ├── disputes/
  ├── activities/
  ├── rbac/
  └── utility/
  ```

  Create a `.gitkeep` placeholder in each subdirectory so they are committed. Write a brief `mobile/.maestro/README.md` with:
  - One-liner: "Maestro E2E flows for the RATS React Native app"
  - App ID: `com.rats.dev`
  - How to run a single flow: `maestro test <path-to-flow>.yaml`
  - How to run a folder: `maestro test mobile/.maestro/auth/`
  - Test accounts table (email / password / role) from `mobile/e2e/setup/testAccounts.json`

- [ ] Write the shared helper subflows in `mobile/.maestro/_helpers/`:
  - `launch.yaml` — launches the app fresh (clears state), grants notification + location permissions, waits for the landing/splash screen to settle. Use `appId: com.rats.dev`. Include `clearState: true` on launchApp.
  - `login-as-manager.yaml` — calls `runFlow: _helpers/launch.yaml`, navigates to the login screen (taps through any landing/welcome screen), enters `test-manager@rats-e2e.com` / `TestPassword123!`, taps the login button, and waits for `house-tab` to be visible (indicating successful auth).
  - `login-as-guest.yaml` — same pattern but uses `test-guest-a@rats-e2e.com` / `TestPassword123!`.
  - `logout.yaml` — navigates to profile/settings and taps a logout button (use text matching "Log Out" or "Sign Out" as a fallback). If the app uses a drawer, open it first.

- [ ] Before writing `auth/login.yaml`, inspect the live app screen:
  - Call `mcp__maestro__list_devices` and pick the booted iOS simulator device_id
  - If no device is booted, run `xcrun simctl boot "iPhone 16"` (or the available simulator name from `xcrun simctl list devices | grep Booted`) then retry
  - Call `mcp__maestro__inspect_screen` with the device_id to capture the current view hierarchy
  - Take a screenshot via `mcp__maestro__take_screenshot` to see what's actually on screen
  - Note the actual element IDs / text labels for: the landing/welcome screen CTA, the "Log In" link, the email field, the password field, and the login submit button

- [ ] Write `mobile/.maestro/auth/login.yaml` as a complete, self-contained flow:
  - Top-level: `appId: com.rats.dev`
  - Use `runFlow` to call `../_helpers/launch.yaml` as the setup step
  - Navigate from the landing screen to the login screen using the actual IDs/text discovered in the inspection step
  - Enter `${EMAIL}` / `${PASSWORD}` using `env` variables with defaults `test-guest-a@rats-e2e.com` / `TestPassword123!`
  - Assert the `house-tab` element is visible after login (indicating main app loaded)
  - Add a second scenario block for the "invalid credentials" case: enter `wrong@test.com` / `WrongPass123!`, assert an error message is visible, assert still on the login screen
  - Add a third scenario for "empty fields": tap submit with no input, assert validation error text is visible

- [ ] Run the login flow via Maestro MCP and fix any failures:
  - Call `mcp__maestro__run` with `device_id` and `yaml` containing the contents of `auth/login.yaml`
  - If elements aren't found: call `inspect_screen` again after each app state change to discover correct IDs, update the flow YAML accordingly
  - Iterate until the happy-path scenario (valid credentials → house-tab visible) passes
  - Save the final validated YAML to `mobile/.maestro/auth/login.yaml`

- [ ] Add `maestro:` scripts to `mobile/package.json`:
  - `"test:maestro:auth"`: `"maestro test mobile/.maestro/auth/"`
  - `"test:maestro:all"`: `"maestro test mobile/.maestro/"` (excluding `_helpers/`)
  - `"test:maestro:login"`: `"maestro test mobile/.maestro/auth/login.yaml"`
