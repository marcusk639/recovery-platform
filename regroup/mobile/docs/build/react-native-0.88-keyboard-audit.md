# Regroup mobile: keyboard-handling "before" inventory

Scope: `regroup/mobile/src/**` (no `__tests__`, `*.test.*`, `_archive`, `_legacy`), plus `App.tsx` and `index.js`.
All paths below are relative to `regroup/mobile/`. Line numbers are from the working tree on branch `chore/regroup-rn-upgrade` @ `335906e`. Its tracked `src/` matches `origin/main` exactly (`git diff --name-only origin/main -- regroup/mobile/src` lists 0 files; the only differences are untracked test files).

`App.tsx` and `index.js` render no text fields and make no keyboard calls (grep for `keyboard` in both returns nothing).

Installed versions: react-native 0.72.17, react-native-keyboard-aware-scroll-view 0.9.5, react-native-keyboard-manager 6.5.4-alpha.2 (IQKeyboardManagerSwift 6.5.4, `ios/Podfile.lock:840,1261`), react-native-google-places-autocomplete 2.6.4 (package.json says `^2.5.1`).

---

## 1. Input components

### Components that wrap a `TextInput`

| Component | Path | keyboardType | returnKeyType | blurOnSubmit | onSubmitEditing | Other keyboard-relevant behaviour |
|---|---|---|---|---|---|---|
| `RatsTextInput` (default export; re-exported by `rats-text-input/index.tsx:1-4`) | `src/components/rats-text-input/rats-text-input.tsx` | Passed through from the prop (`:176`, `:339`). No default, so RN `default`. | Passed through (`:344`). No default. | **Always `true`** (`:335`). Callers cannot override it. | Passed through (`:343`). | `multiline` is `props.multiline \|\| false`, forced `false` when `secureTextEntry` (`:340-342`). `numberOfLines` is passed through (default 1, `:345`) and sets `minHeight: 20*n` plus `textAlignVertical: 'top'` (`:315-320`). `autoCapitalize` defaults to `'sentences'` if `numberOfLines` is set, else `'words'` (`:220-224`). `selectTextOnFocus={!disabled}` (`:311`). The ref comes from `setRef` (`:310`). The component does **not** spread other TextInputProps, so props such as `maxLength`, `autoCorrect` and `autoFocus` are dropped. With `address` set it renders `RatsGooglePlacesAutocomplete` instead of a TextInput (`:365-421`) and passes `keyboardShouldPersistTaps="always"` (`:369`), which overrides that component's `'handled'` because `restProps` are spread last. |
| `RatsNumericInput` | `src/components/rats-numeric-input/index.tsx` | **Hard-coded `"numeric"`** (`:114`). On iOS RN maps that to `UIKeyboardTypeDecimalPad` (`node_modules/react-native/React/Base/RCTConvert.m:437`). Any `keyboardType` a caller passes is ignored. | none | not set (RN default) | Passed through (`:117`). | Up and down step buttons (`:127-156`). `parseInt` on change (`:108`). No ref and no `testID` forwarding (`HouseSetup.tsx:274` passes a `testID` that is dropped). |
| `RatsSearchBar` | `src/components/rats-search-bar/index.tsx` | not set (default) | **`"search"`** (`:116`) | not set | Passed through (`:117`). | `autoCapitalize="words"` (`:115`). In `address` mode it renders `RatsGooglePlacesAutocomplete` (`:120-182`) and does not pass `keyboardShouldPersistTaps`, so the wrapper's `'handled'` applies. `testID` is not forwarded to the TextInput. |
| `RatsGooglePlacesAutocomplete` (wraps library `GooglePlacesAutocomplete`) | `src/components/google-places-autocomplete/index.tsx` | not set | **`'search'`** in `textInputProps` (`:128-134`) | not set | not set | `clearButtonMode:'always'`, `autoFocus:false`, `keyboardAppearance:'light'`, merged with caller `textInputProps` (`:128-134`). `keyboardShouldPersistTaps="handled"` (`:121`). The library renders its results in a **FlatList** (`node_modules/react-native-google-places-autocomplete/GooglePlacesAutocomplete.js:1026`). The ref is the library's imperative handle (`setAddressText`, `getAddressText`, `blur`, `focus`, `isFocused`, `clear`, ...; `GooglePlacesAutocomplete.js:1132`). |

### Wrappers that are not counted as text fields

- `RatsDatePicker` (`src/components/rats-datepicker/rats-datepicker.tsx:78-100`) renders a `RatsTextInput` inside `<View pointerEvents="none">` under a `TouchableOpacity` that opens `react-native-date-picker`. It never takes focus or raises the keyboard, so it is excluded from all counts.
- `RatsTimePicker` (`rats-datepicker/rats-timepicker.tsx:38`) is a RatsModal with a time picker and no TextInput.
- `DayTimeWidget` (`src/screens/StatUpdates/DayTimeWidget.tsx`) imports `RatsTextInput` (`:17`) but renders only `RatsPicker`, touchables and `RatsTimePicker`. It has no TextInput.
- `RatsPicker`, `RatsCheckBox`, `RatsSwitch` and `RatsRadioButtonGroup` contain no TextInput.

### Keyboard containers in use

| Container | Where | Notes |
|---|---|---|
| `RatsScrollView` | `src/components/rats-scroll-view/index.tsx:24-39` | APSL `KeyboardAwareScrollView` with the defaults `keyboardShouldPersistTaps={props.keyboardShouldPersistTaps \|\| 'always'}` (`:29`), `keyboardDismissMode="on-drag"` (`:30`), `resetScrollToCoords={{x:0,y:0}}` (`:31`), `showsVerticalScrollIndicator={false}` (`:33`) and `contentContainerStyle={[styles.container, props.contentContainerStyle]}` (`:34`). Because `{...props}` is spread **after** these (`:35`), a caller-supplied `contentContainerStyle` *replaces* the default container style (`flexGrow:1, alignItems:'center', backgroundColor: light_grey, width:'100%'`, `:9-17`) instead of merging with it. `enableOnAndroid` is not defaulted, so APSL's own default `false` applies (`node_modules/react-native-keyboard-aware-scroll-view/lib/KeyboardAwareHOC.js:115`): on Android a RatsScrollView does nothing keyboard-related unless the caller passes `enableOnAndroid`. Other APSL defaults: `extraHeight` 75, `extraScrollHeight` 0, `enableAutomaticScroll` true, `enableResetScrollToCoords` true, `keyboardOpeningTime` 250 (`KeyboardAwareHOC.js:16-18,114-126`). The `behavior` prop declared at `:21` is not an APSL prop and has no effect. |
| `RatsModal` | `src/components/rats-modal/index.tsx:48-92` | `react-native-modal`. On **iOS only** it wraps the children in RN `KeyboardAvoidingView` with `behavior={behavior \|\| 'padding'}` and **no `keyboardVerticalOffset`** (`:74-79`); `useKeyboardView` defaults to `true` (`:58`). On Android it renders a plain `View` (`:81`). `avoidKeyboard` is not used anywhere in src. |
| ModalContext form modal | `src/context/ModalContext.tsx:166-203` | A single app-wide `RatsModal`, so it gets the iOS KAV `padding` above. `fullScreen=true` uses `MODAL_STYLE` (screen-height); otherwise it is a bottom sheet (`justifyContent:'flex-end'`, `:167-176`). Content is a frozen snapshot of the element passed to `showFormModal`. Calling `showFormModal` again replaces the content in the same modal (for example ManagerSettings -> AddManager). |
| `RatsModalForm` | `src/components/rats-modal-form/rats-modal-form.tsx:40-60` | Wraps `RatsModal` (iOS KAV padding). Submit button inside. Used only by `Login.tsx:166`. |
| `KeyboardView` | `src/components/keyboard-view/index.tsx` | Dismiss-on-tap touchable. **Unused** (no importers). |
| `useKeyboard` | `src/hooks/use-keyboard.ts` | **Unused** (no importers). |
| `useKeyboardVisible` | `src/hooks/useKeyboardVisible.ts:17-34` | `keyboardDidShow`/`keyboardDidHide` listener. Used to hide the wizard progress bar at `OperatorSetupWizard.tsx:140,201` and `OxfordOnboardingWizard.tsx:52,134`. |
| `react-native-keyboard-spacer` | `package.json` dependency | No import anywhere in src. |
| `listenToKeyboardEvents`, `KeyboardAwareSectionList` | none | Zero usages. |
| Direct APSL `KeyboardAwareScrollView` | `GuestUpdateFormView.tsx:84` (unreachable, see Notes) | `NewAccount.tsx:4` imports it but never renders it. |
| `KeyboardAwareFlatList` | `DirectChat.tsx:407`, `BaseChat.tsx:413` | |
| RN `KeyboardAvoidingView` | `rats-modal/index.tsx:75`, `PaymentDashboard.tsx:607` | `src/forms/FilterForm.tsx:6` imports it but does not use it. |

---

## 2. Where keyboard-manager is configured

**No global configuration.** `App.tsx` and `index.js` make no `KeyboardManager.*` calls, and there is no IQKeyboardManager code in `ios/rats/*` (grep for `IQ|keyboard` in `ios/rats/*.{m,mm,swift,h}` and `Info.plist` finds nothing). The app therefore runs on library defaults. The README says the library "does not need any extra library setup to work" (`node_modules/react-native-keyboard-manager/README.md`, "Use" section). The native default values could not be verified locally because `ios/Pods` is not installed.

All `KeyboardManager.*` calls in scope (both iOS-guarded):

| File:line | Call | Value | Trigger |
|---|---|---|---|
| `src/screens/SetupWizards/HouseSetup.tsx:30` | `import KeyboardManager from "react-native-keyboard-manager"` | | |
| `HouseSetup.tsx:78` | `KeyboardManager.setEnable` | `true` | Inside `setKeyboard` (`:64-84`), the `onFocus` of the address field (`:210`), when `IOS`. |
| `HouseSetup.tsx:79` | `KeyboardManager.setKeyboardDistanceFromTextField` | `normalize(100)` | Same as above. |
| `HouseSetup.tsx:88` | `KeyboardManager.setKeyboardDistanceFromTextField` | `0` | Inside `resetKeyboard` (`:86-92`). **Never called**: its only reference is the commented-out `// onFieldBlur={this.resetKeyboard}` at `:214`. |
| `src/screens/DirectChat/hooks/useChatLogic.ts:21` | import | | |
| `useChatLogic.ts:72` | `KeyboardManager.setEnable` | `false` | `navigation.addListener('focus')`, iOS only (`:70-74`). |
| `useChatLogic.ts:75` | `KeyboardManager.setEnable` | `true` | `navigation.addListener('blur')` (`:74-76`). |

Per-screen enable/disable:
- **Only BaseChat disables IQKeyboardManager.** `useChatLogic` is used only by `BaseChat.tsx:121`, and BaseChat is rendered only by `HouseChat.tsx:209` (the HouseChat bottom tab, `navigators.tsx:274`).
- **`DirectChat.tsx` (route `DirectMessage`) does not use `useChatLogic`**, does not touch KeyboardManager and registers no keyboard listeners, so IQKeyboardManager stays enabled there.
- These are never called anywhere: `setToolbarPreviousNextButtonEnable`, `setEnableAutoToolbar`, `setShouldResignOnTouchOutside`, `setToolbarDoneBarButtonItemText`, `setShouldShowToolbarPlaceholder`, `setOverrideKeyboardAppearance`, `resignFirstResponder` and `PreviousNextView`.

Android:
- `android/app/src/main/AndroidManifest.xml:18` sets `android:windowSoftInputMode="adjustResize"` on `.MainActivity`. `android:configChanges` includes `keyboard|keyboardHidden` (`:16`).
- `android/app/src/debug/AndroidManifest.xml` and `android/app/src/e2eEmulator/AndroidManifest.xml` do not override the activity. `android/app/src/release` has only `java/`.
- There is no `softwareKeyboardLayoutMode`, `AvoidSoftInput`/`react-native-avoid-softinput`, `setSoftInputMode` (MainActivity.java) or `react-native-keyboard-controller`/`KeyboardProvider` usage in src, android or app.json. The only mention of keyboard-controller is a comment in the untracked test `src/components/rats-scroll-view/__tests__/rats-scroll-view.behaviour.test.tsx:5-8`.
- In-JS Android keyboard code: `HouseSetup.tsx:58,64-76,81,90` (see Notes), `FilterForm.tsx:40,42`, `BaseChat.tsx:404-406`, `useChatLogic.ts:80,84` (event names), `HouseSetup.tsx:172`.

---

## 3. Screen table

Abbreviations:
- **KASV** = APSL KeyboardAwareScrollView.
- **RSV** = RatsScrollView (always KASV plus the defaults in §1).
- **FormModal** = ModalContext `RatsModal` (iOS-only KAV `padding`, no offset). "fs" means `fullScreen=true`.
- **"Modal route"** = registered in the `RootStack.Group` with `presentation:'modal'` (`src/navigation/navigators.tsx:327-536`).

Field counts are field instances at default state. Dynamic lists are counted once and marked N.

| # | File | Wrapper | Wrapper props passed | Fields (count; numeric/phone pads with label:line) | Inside modal? | FlatList/SectionList? nested? | Pinned footer? | Android-specific | Multiline |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `src/screens/Activity/BaseActivityScreen.tsx` | Search bar: none (plain `View` in host screens `ActivityScreen.tsx:129`, `Disputes.tsx:137`). Reason field: RatsModal (iOS KAV padding) > RSV `:113`. | RSV: `keyboardShouldPersistTaps="handled"`, `style={{flexGrow:1}}`; contentContainerStyle no. | 2: `RatsSearchBar` `:57`; reason `renderField('message',…,8)` `:144`. Numeric: none. | Yes: `RatsModal` fullScreen `:99-112` (dispute/confirm). Hosts: Activities tab and the `HouseDisputes` modal route. | `RatsFlatList` (`:342`) is a sibling below the search bar, not nested. | No. The CONFIRM/DISPUTE button is inside the scroll with `marginTop:'auto'` (`:164-177`). | none | No. The reason has `numberOfLines=8` but multiline is false (see §1). |
| 2 | `src/screens/Application/ApplyScreen.tsx` | RN `ScrollView` `:79` | `style`, contentContainerStyle yes. No keyboardShouldPersistTaps. | 6 (step-dependent): name `:88`, email `:96` (email-address), **Phone `:106` (phone-pad `:111`)**, sobriety date `:119`, situation `:145`, references `:154`. | Modal route `Apply` (`navigators.tsx:477`). | No | No. Back/Next row inside the scroll (`:186`). | none | Yes: `:145`, `:154` |
| 3 | `src/screens/Applications/ApplicationDetailScreen.tsx` | RN `ScrollView` `:117` | style, contentContainerStyle yes | 1: note `:147`. Numeric: none. | Modal route `ApplicationDetail` | No | No (buttons inside the scroll, `:156`) | none | Yes: `:147` |
| 4 | `src/screens/Beds/Beds.tsx` | Screen: none (search bar in the root `View` `:555`). Add-Bed form: FormModal(fs) > `View flex:1` > RSV `:240`. | Add-Bed RSV: `contentContainerStyle={{}}` (yes; this wipes the RSV default style). | 2: `RatsSearchBar` `:501`; bed name `renderField('id')` `:284`. Numeric: none. | Screen: modal route `Beds`. Add-Bed form: FormModal fs (`:351`). | `RatsFlatList` `:474` is a sibling of the search bar, not nested. | Yes: screen "Add Room" `SafeAreaView` `:571-588` below the list. Add-Bed: `ConfirmationButtons` `:294` outside the RSV (`marginTop:'auto'`). | none | No |
| 5 | `src/screens/Beds/RoomForm.tsx` | FormModal(fs) > `SafeAreaView flex:1` > RSV `:214` | `contentContainerStyle={{}}` (yes) | 1: room name `renderField('id')` `:216`. Bed rows are plain views. | FormModal fs (`Beds.tsx:331`) | No | Yes: `ConfirmationButtons` `:239` outside the RSV | none | No |
| 6 | `src/screens/Complaints/Complaints.tsx` | Screen: none (`SafeAreaView` > `View` `:416-417`). Reply form: FormModal(fs) > RSV `:157`. | Reply RSV: `keyboardShouldPersistTaps="handled"`, contentContainerStyle yes (`{flexGrow:1,width:'100%'}`). | 2: `RatsSearchBar` `:247`; reply `renderField('reply',…,8)` `:187`. Numeric: none. | Screen: modal route `Complaints`. Reply: FormModal fs (`:222`). Filter: FormModal sheet (`:228`; pickers only). | `RatsFlatList` `:353`, sibling | No. `ConfirmationButtons` `:202` inside the RSV (`marginTop:'auto'`). | none | No (`numberOfLines=8` with multiline false) |
| 7 | `src/screens/Contacts/ContactScreen.tsx` | none for the search bar (root `View` `:443`). An RSV `:462` follows it as a sibling. | RSV `contentContainerStyle={{}}` (yes) | 1: `RatsSearchBar` `:420`. | Contacts tab, and modal route `ContactsScreen`. Filter: FormModal sheet (`:407`; pickers only). | No | No | none | No |
| 8 | `src/screens/DirectChat/DirectChat.tsx` | `SafeAreaView(bottom)` > `View flex:1` > `KeyboardAwareFlatList` `:407`, with the composer as an absolute sibling | `style={{marginBottom: normalize(50)}}`, contentContainerStyle yes, `keyboardShouldPersistTaps="handled"`, `inverted`, `extraScrollHeight={normalize(30)}`, `keyboardOpeningTime={0}`, `enableOnAndroid` | 1: composer `:441`. | Modal route `DirectMessage` (`navigators.tsx:396`) | The list *is* `KeyboardAwareFlatList` (inverted) | **Yes**: composer `View` `position:'absolute', bottom:0` `:429-439`. Nothing moves it for the keyboard (no listeners, no transform). | none (only `enableOnAndroid` on the list). **IQKeyboardManager stays enabled.** | Yes: `:444` |
| 9 | `src/screens/DirectChat/BaseChat.tsx` (+ `hooks/useChatLogic.ts`) | `SafeAreaView(bottom)` `:521` > `View flex:1` > `KeyboardAwareFlatList` `:413`, with an absolute composer | `style.marginBottom` = 0 when the keyboard is up, else `normalize(50)` (`:414-417`). contentContainerStyle yes, with `paddingTop = keyboardHeight - normalize(55)` while the keyboard is up (`:418-425`). `keyboardShouldPersistTaps="handled"`, `inverted`, `extraScrollHeight` = `keyboardHeight` or `normalize(30)` (`:437-439`), `keyboardOpeningTime={0}`, `enableOnAndroid`. | 1: composer `:458`. | No. Rendered by the HouseChat **tab** (`HouseChat.tsx:209`). | The list is `KeyboardAwareFlatList` (inverted) | **Yes**: composer `position:'absolute', bottom:0` with `transform: translateY(-keyboardHeight + calculateInputOffset())` (`:443-456`) | Yes. `calculateInputOffset` `:391-409` adds iOS `getBottomSpace()+normalize(55)` (direct) or `normalize(tabBarHeight())+normalize(5)` (group), and Android `normalize(55)` (direct) or `normalize(75)` (group). Listeners use `keyboardWillShow/WillHide` on iOS and `keyboardDidShow/DidHide` on Android (`useChatLogic.ts:79-86`). **KeyboardManager disabled on focus** (`useChatLogic.ts:70-77`). | Yes: `:461` |
| 10 | `src/screens/DrugTesting/DrugTestForm.tsx` | RN `ScrollView` `:114` | style, contentContainerStyle yes. No keyboardShouldPersistTaps. | 2: substances `:205` (only when result = positive), notes `:231`. Numeric: none. | Modal route `DrugTestForm` | No FlatList. A nested vertical RN `ScrollView` (guest list, `nestedScrollEnabled`, maxHeight 180) at `:119`. | No (submit inside the scroll, `:242`) | none | Yes: `:237` |
| 11 | `src/screens/GuestMedicationOverview/GuestMedicationSummary/GuestMedicationSummary.tsx` | FormModal(fs) > plain `View` (`MedicationForm` `:69`). **No scroll.** | n/a | 2: medication name `:70`, dosage `:77`. Numeric: none. | FormModal fs (`:161`, `:169`). Host is modal route `MedicationSummary`. | No | No (SUBMIT directly under the fields, `:84`) | none | No |
| 12 | `src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx` | FormModal(fs) > plain `View`. **No scroll.** | n/a | 2: **Step `RatsNumericInput` `:73` (numeric)**; sponsor name `:114`. | FormModal fs (`:184`, `:210`). Host is modal route `SupporterSummary`. | No | No | none | No |
| 13 | `src/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx` | FormModal(fs) > plain `View`. **No scroll.** | n/a | 6: **Hours `RatsNumericInput` `:87` (numeric)**; AddJobForm employer `:135`, street `:142`, city `:149`, state `:156`, zip `:163` (default keyboard). | FormModal fs (`:257`, `:337`). Host is modal route `WorkSummary`. | No | No | none | No |
| 14 | `src/screens/GuestUpdate/GuestUpdateFormView.tsx` (**unreachable**, see Notes) | Direct KASV `:84` | contentContainerStyle yes, `resetScrollToCoords={{x:0,y:0}}`, `scrollEnabled`, `innerRef` yes. No `enableOnAndroid`. | Up to 9 `RatsTextInput` (`getField` `:92-101`). The component is chosen at runtime: a name containing "date" gets a date picker, a boolean value gets a checkbox (`:36-44`). No `keyboardType` is passed, so `phoneNumber`, `rentOwed` and `choreFees` use the default keyboard. Numeric: none. | Not registered in any navigator | No | No (submit inside the scroll, `:103`) | none | No |
| 15 | `src/screens/HouseConfig/HouseConfigFormView.tsx` (**unreachable**) | Host `HouseConfig.tsx:30` RSV | `keyboardShouldPersistTaps="always"`, `resetScrollToCoords={{x:0,y:0}}`, `scrollEnabled`, contentContainerStyle yes | 5 static: name `:250`, street `:251`, **rent `:257`, capacity `:264`, phone `:271` (all phone-pad via `inputType 'number'`, `:56`)**. Dynamic per added phase (`:111-163`): name, **order `:117`, meetings `:125`, nightsOut `:144`, work `:157`** (RatsNumericInput, numeric), plus 2 curfew text fields. Per chore: 2 (`:191,197`). Per admin: 2 (`:224,230`). | `HouseConfig` is imported nowhere | No | No | none | No |
| 16 | `src/screens/HouseSearch/HouseSearchScreen.tsx` | none (search bar in a `View` `:254` under the root `View` `:489`) | n/a | 1: `RatsSearchBar` `:261`. | No. AuthStack card screen (`navigators.tsx:168`). | `RatsFlatList` `:195`, sibling | No | none | No |
| 17 | `src/screens/HouseSearch/HouseSearchFilterForm.tsx` (+ `src/forms/FilterForm.tsx`) | FormModal **bottom sheet** > RSV (`FilterForm.tsx:39`) | `enableAutomaticScroll={IOS?false:true}`, `behavior="padding"` (no-op), `extraScrollHeight={IOS?0:normalize(150)}`, `keyboardShouldPersistTaps="handled"`, contentContainerStyle yes, `scrollEnabled`, `enableOnAndroid` (`FilterForm.tsx:40-50`) | 1: Location (GooglePlaces via `RatsTextInput address`) `:51`. Numeric: none. | FormModal, not fullScreen (`HouseSearchScreen.tsx:227`) | **Yes, nested**: the GooglePlaces results FlatList sits inside the RSV | No (`ConfirmationButtons` inside the RSV, `FilterForm.tsx:75`) | Yes. Platform ternaries for `enableAutomaticScroll` and `extraScrollHeight` (`FilterForm.tsx:40,42`). | No |
| 18 | `src/screens/HouseSettings/AddManager.tsx` | FormModal(fs) > `View flex:1` > RSV `:178` | contentContainerStyle yes, `keyboardShouldPersistTaps="handled"`, `behavior="padding"` (no-op) | 1: manager email `:112` (no keyboardType). | FormModal fs (`ManagerSettings.tsx:229`; replaces ManagerSettings in the same modal). Underneath is modal route `HouseSettings`. | No | **Yes**: Cancel/Apply `View` `:207-232` outside the RSV | none | No |
| 19 | `src/screens/HouseSettings/AdminManagement.tsx` | FormModal(fs) > `View` > RSV `:194` | `contentContainerStyle={{flexGrow:1}}` | 1: invite email `:296` (email-address). | FormModal fs (`HouseSettings.tsx:210`), over modal route `HouseSettings` | No | No (send button inside the RSV, `:312`) | none | No |
| 20 | `src/screens/HouseSettings/PaymentDashboard.tsx` | ManualPaymentModal: RN `Modal` `:595` (`presentationStyle="pageSheet"`) > **RN `KeyboardAvoidingView` `:607`** (`behavior={Platform.OS==='ios'?'padding':undefined}`, **no keyboardVerticalOffset**, `style={{flex:1}}`) > RN `ScrollView` `:611` | ScrollView: contentContainerStyle yes, `keyboardShouldPersistTaps="handled"`. Nested horizontal ScrollView `:625` with `keyboardShouldPersistTaps="handled"`. | 2: **Amount `:657` (decimal-pad `:659`)**; notes `:685`. The main screen has no fields. | RN `Modal` pageSheet, on top of modal route `PaymentDashboard` | No FlatList. Nested horizontal `ScrollView` (`:625`). | Main screen has a FAB `position:'absolute'` (`:508`, style `:809-817`), but it sits behind the modal. Modal: Record/Cancel inside the scroll (`:691-707`). | Yes: KAV behavior is `undefined` on Android (`:609`) | No |
| 21 | `src/screens/Issues/Issues.tsx` | Screen: none (root `View` `:635`). Resolve form: FormModal(fs) > RSV `:221`. | Resolve RSV: `keyboardShouldPersistTaps="handled"`, `contentContainerStyle={{flexGrow:1}}` | 2: `RatsSearchBar` `:421`; resolution `renderField(…,8)` `:296`. Numeric: none. | Screen: modal route `Issues`. Resolve: FormModal fs (`:327`). Filter: FormModal sheet (`:402`; pickers only). | `RatsFlatList` `:555`, sibling | No (`ConfirmationButtons` `:311` inside the RSV) | none | No (`numberOfLines=8` with multiline false) |
| 22 | `src/screens/Login/Login.tsx` | `SafeAreaView` > RSV `:117`. The forgot-password field is in `RatsModalForm` `:166` (RatsModal, iOS KAV padding). | RSV: `keyboardShouldPersistTaps="handled"`, `resetScrollToCoords={{x:0,y:0}}`, `scrollEnabled`, `extraScrollHeight={normalize(75)}`, contentContainerStyle yes, `enableOnAndroid` | 1: reset email `:99`. Numeric: none. | Reset email is in RatsModalForm (`modalStyle height: windowHeight/3`, `:169-172`). The screen is an AuthStack card. | No | No | none in this file (`enableOnAndroid` set) | No |
| 23 | `src/screens/Login/LoginFormView.tsx` | Parent `Login.tsx:117` RSV | (see #22) | 2: email `:29` (`returnKeyType="next"`, `onSubmitEditing` focuses password `:36-37`), password `:39` (secure). | No (AuthStack) | No | No | none | No |
| 24 | `src/screens/NewAccount/NewAccountFormView.tsx` | Parent `NewAccount.tsx:82` RSV inside `SafeAreaView(bottom)` | `contentContainerStyle={SCROLL_CONTAINER}` | 4: first `:93`, last `:94`, middle initial `:95`, **Phone `:96` (phone-pad via `:52-56`)**. Date of birth `:97` is a date picker. | AuthStack card, **and** modal route `NewAccount` (`navigators.tsx:350`) | No | No (Next inside the scroll) | none | No |
| 25 | `src/screens/Oxford/BusinessMeetingDetail.tsx` (**unreachable**) | RN `ScrollView` `:107` | style only. contentContainerStyle no. | 1: minutes `:212`. | The route name `'BusinessMeetingDetail'` is navigated to (`BusinessMeetings.tsx:109`) but **not registered** | No | No | none | Yes: `:218` |
| 26 | `src/screens/Oxford/OxfordOnboardingWizard.tsx` | `SafeAreaView(top)` > `RatsWizardSlide` > 5 RN `ScrollView`s (`:144,156,191,250,281`), all mounted at once | contentContainerStyle yes on each. No keyboardShouldPersistTaps. | 5: officer names ×3 from the `map` at `:177`, time `:240` (default keyboard, "HH:MM"), **Monthly EES `:265` (numeric `:268`)**. | Modal route `OxfordOnboardingWizard` | No | **Yes**: `SetupButtons` `:300` outside the slide | Progress bar hidden while the keyboard is visible (`:134`, iOS and Android) | No |
| 27 | `src/screens/Oxford/Voting.tsx` | RSV `:429` | `refreshControl` only (contentContainerStyle no) | 2: topic `:466`, description `:489` (only when `showCreateForm`). Numeric: none. | Modal route `OxfordVoting` | **Yes, nested**: `FlatList` `:556` (`scrollEnabled={false}`) inside the RSV | No | none | Yes: `:494` |
| 28 | `src/screens/Payments/ResidentPayment.tsx` | RSV `:327` | none | 1: **Amount `:403` (decimal-pad `:409`, `returnKeyType="done"` `:415`)**. | Modal route `ResidentPayment` | No | No (Pay Now inside the scroll, `:506`) | none | No |
| 29 | `src/screens/Personal/DeleteAccount.tsx` | RSV `:83` | none | 1: password `:91` (secure). | Modal route `DeleteAccount` | No | No | none | No |
| 30 | `src/screens/Personal/TwoFactorSetup.tsx` | RSV `:43` | none | 2 (step-dependent): **Phone `:51` (phone-pad `:55`)**, **6-digit code `:71` (number-pad `:75`)**. | Modal route `TwoFactorSetup` | No | No | none | No |
| 31 | `src/screens/Personal/MiscellaneousHouseForm.tsx` (+ `MiscellaneousForm.tsx`) | FormModal(fs) > RSV (`MiscellaneousForm.tsx:26`) | `behavior={IOS?'padding':null}` (no-op), `keyboardShouldPersistTaps="handled"`, `contentContainerStyle={{flexGrow:1}}` | 1: complaint/issue/description `renderField(…,8)` `:39` (plus a picker for issues `:27`). Numeric: none. | FormModal fs from `Personal.tsx:139,186,221,256` (Personal tab / `PersonalScreen` route) | No | No. Buttons are inside the RSV in a `View` with `marginTop:'auto'` (`MiscellaneousForm.tsx:33-46`). | none | No (`numberOfLines=8` with multiline false) |
| 32 | `src/screens/Profile/DischargeGuestModal.tsx` | RN `Modal` `:46` (`transparent`, fade) > centered `View` overlay `:51`. **No scroll, no KAV.** | n/a | 1: notes `:66`. | RN `Modal`. Host is `GuestHome` (Guest tab / `GuestOverview` route). | No | No | none | Yes: `:71` |
| 33 | `src/screens/Profile/EditUserInfoFormView.tsx` | `View` > `SafeAreaView(bottom)` > RSV `:76` | contentContainerStyle yes | 1: **Phone `:100` (phone-pad via `:60-64`)**. Date of birth and sobriety date `:98-99` are date pickers. | Modal route `EditUserInfo` | No | **Yes**: `ConfirmationButtons` `:119` outside the RSV | none | No |
| 34 | `src/screens/ResidentIntake/IntakeFormScreen.tsx` | `SafeAreaView` > RN `ScrollView` `:329` | contentContainerStyle yes. No keyboardShouldPersistTaps. | 17, across 4 steps (only the current step is mounted). Step 1: `:166,173,180,`**`189` Phone (phone-pad `:195`)**`,197,204`. Step 2: `:216,`**`223` Emergency Contact Phone (phone-pad `:229`)**`,231`. Step 3: `:243,249,255,261`. Step 4: `:272,278,`**`284` Probation Officer Phone (phone-pad `:289`)**`,291`. | Modal route `ResidentIntake` | No | No (buttons inside the scroll, `:331`) | none | Yes: notes `:291` |
| 35 | `src/screens/SetupWizards/ChoreSetup.tsx` | Fields are only in `RatsModal` `:140` (iOS KAV padding, `MODAL_STYLE`) > plain `View flex:1` `:149`. **No scroll.** The screen body is an RSV `:233` (`contentContainerStyle={SCROLL_CONTAINER}`) with no fields. | n/a | 2: chore name `:156`, description `renderField(…,7)` `:165`. Numeric: none. | Yes, RatsModal. When opened from HouseSettings it is **stacked on the FormModal** (`HouseSettings.tsx:173`). Also wizard step 3 (`OperatorSetupWizard.tsx:182`). | No | **Yes**: in the modal, `SetupButtons` `:180` under the fields. On screen: `renderButtons()` `:251` outside the RSV (forSettings). | none | No (`numberOfLines=7` with multiline false) |
| 36 | `src/screens/SetupWizards/GuestSetup.tsx` | RSV `:242` | `contentContainerStyle={SCROLL_CONTAINER}` | N: email per entry `:115` (email-address `:124`, `sideButtonPress`). Initial `guestEmails: []` (`:274`). | FormModal fs (`HouseSettings.tsx:229`). Wizard step 4. Modal route `SendInvites` via `GuestInvites.tsx:66`. | No | **Yes**: `SetupButtons` `:252` outside the RSV (forSettings only). In the wizard, `SharedSetupButtons` (`OperatorSetupWizard.tsx:221`) is outside the slide. | none | No |
| 37 | `src/screens/SetupWizards/HouseSetup.tsx` | `View flex:1` > RSV `:168` | `innerRef`, `enableOnAndroid`, `enableResetScrollToCoords={false}`, **`enableAutomaticScroll={ANDROID}`** (so APSL auto-scroll is off on iOS), `scrollEnabled`, `keyboardShouldPersistTaps="handled"`, contentContainerStyle yes. `extraScrollHeight`/`extraHeight` are commented out (`:174-175`). | 7: name `:191`, address (GooglePlaces) `:209`, **Contact Number `:223` (phone-pad `:230`)**, **Monthly Rent `:247`**, **Weekly Rent `:254`**, **Fees / Deposits `:261`**, **beds/maximumCapacity `:268`** (the last four are RatsNumericInput, numeric). | FormModal fs (`HouseSettings.tsx:181`) and wizard step 0 (`OperatorSetupWizard.tsx:162`; AuthStack/SetupStack card) | **Yes, nested**: the GooglePlaces FlatList inside the RSV | **Yes**: `SetupButtons` `:323-333` outside the RSV (forSettings). In the wizard, `SharedSetupButtons` is outside the slide. | Yes. `useState(ANDROID ? normalize(95) : 0)` `:58`, `setHeight(normalize(115))` `:81` and `setHeight(normalize(95))` `:90`, but `height` is **never read in render**. The Android measure/`scrollTo` branch `:65-76` needs `refsRef.current.address.refs.textInput`, but that ref is the GooglePlaces imperative handle, which has no `refs` (`GooglePlacesAutocomplete.js:1132`), so the branch cannot run. The iOS KeyboardManager calls are in §2. | No |
| 38 | `src/screens/SetupWizards/ManagerSetup.tsx` | RSV `:187` | `contentContainerStyle={SCROLL_CONTAINER}` | N: email per `managerEmails` key `renderField(…)` `:124`, only when type is external-managers or senior-peer (`:53-57`). Initial `{}`. Numeric: none. | Wizard step 1 only (`OperatorSetupWizard.tsx:168`) | No | Yes: `SetupButtons` `:235` (forSettings only). Wizard footer is pinned. | none | No |
| 39 | `src/screens/SetupWizards/PhaseSetup/PhaseConfigForm.tsx` | Host `RatsModal` with **`useKeyboardView={false}`** (no KAV on either platform; `PhaseConfigSetup.tsx:106-115`, `PhaseCustomization.tsx:106-115`) > RSV `:162` > `SafeAreaView` | `contentContainerStyle={[SCROLL_CONTAINER]}` | 5: name `:183` (hidden if `customize`), **Phase Number `:193` (numeric; hidden if `customize`)**, **nightsOutAllowed `:244`**, **meetings `:277`**, **work `:301`** (the last three appear only when their switch is on; all RatsNumericInput). | RatsModal fullScreen. Hosts: PhaseConfigSetup (modal route `PhaseSetup`; FormModal `HouseSettings.tsx:177`, so it is **stacked on the FormModal**; wizard step 2 via `PhaseConfig.tsx`) and PhaseCustomization (modal route `PhaseCustomization`, `customize:true`). | No | No (CANCEL/APPLY inside the RSV, `:344`) | No `enableOnAndroid`, so APSL does nothing on Android | No |
| 40 | `src/screens/SignUp/SignUpFormView.tsx` | Parent `SignUp.tsx:235` RSV | `keyboardShouldPersistTaps="handled"`, `contentContainerStyle={{flexGrow:1}}` | 5: email `:170`, password `:177`, confirm `:186`, first `:195`, last `:201`. Numeric: none. | AuthStack card | No | No | none | No |
| 41 | `src/screens/StaffNotes/StaffNotesFeed.tsx` | none: composer `View` at the **top** `:220`, below the header | n/a | 1: note `:229` (`maxLength`). | Modal route `StaffNotes` | `FlatList` `:296` is a sibling below the composer, not nested | No | none | Yes: `:240` |
| 42 | `src/screens/StatUpdates/MeetingSearchBar.tsx` | none (host `MeetingSearch.tsx:93` plain `View`) | n/a | 1: `RatsSearchBar address` (GooglePlaces) `:26`. | Modal route `MeetingSearch` | `RatsFlatList` (`MeetingResultsList.tsx:405`) is a sibling. The GooglePlaces FlatList is inside the search bar, which is not in a scroll. | No | none | No |
| 43 | `src/screens/StatUpdates/NewMeeting.tsx` | RSV `:297` | `contentContainerStyle={[SCROLL_CONTAINER]}` | 2: name `:299`, address (GooglePlaces, because `renderField` sets `address={fieldName==='address'}`) `:313`. `DayTimeWidget` `:321` has no text fields. | Modal route `NewMeeting` | **Yes, nested**: the GooglePlaces FlatList inside the RSV | No (`ConfirmationButtons` in a `View` with `marginTop:'auto'` inside the RSV, `:327-348`) | none | No |
| 44 | `src/screens/Treasury/FinancialRecordForm.tsx` | `View` > RN `ScrollView` `:256` | contentContainerStyle yes. No keyboardShouldPersistTaps. | 13 initially (income, expense and bill lines start at 1 each and grow): **Checking `:279` (decimal-pad `:284`)**, **Savings `:294` (decimal-pad `:299`)**, income category `:342`, **income amount `:349` (decimal-pad `:356`)**, income description `:359`, expense category `:396`, **expense amount `:405` (decimal-pad `:412`)**, payee `:415`, **check # `:422` (number-pad `:430`)**, expense description `:432`, bill description `:469`, **bill amount `:476` (decimal-pad `:483`)**, due date `:486`. | Modal route `FinancialRecordForm` | No | No (Save Draft/Submit inside the scroll, `:569`) | none | No |
| 45 | `src/screens/Treasury/FinancialRecordDetail.tsx` | FormModal(fs) > plain `View` (`RejectRecordForm` `:84`). No scroll. | n/a | 1: reject reason `:90`. | FormModal fs (`:159`). Host is modal route `FinancialRecordDetail`. | No | No | none | No |

**Totals:**
- 45 files contain fields. 42 are reachable; #14, #15 and #25 are unreachable.
- The reachable files hold about 114 field instances, with dynamic lists counted once.
- `RatsSearchBar` appears at 7 sites: #1 (rendered by 2 screens), #4, #6, #7, #16, #21, #42.
- `GooglePlacesAutocomplete` appears at 4 sites: #17, #37, #42, #43.
- True multiline fields: 11 sites in 10 files (#2 ×2, #3, #8, #9, #10, #25, #27, #32, #34, #41). Excluding the unreachable #25 leaves 10 sites in 9 files. 5 more are `RatsTextInput` with `numberOfLines` but `multiline=false` (#1, #6, #21, #31, #35).

---

## 4. Numeric/phone pad total

**28 reachable fields** (source sites) have a numeric, number-pad, decimal-pad or phone-pad keyboard. The unreachable `HouseConfigFormView.tsx` adds 7 more (35 in all source). **The previous estimate of 19 is low by 9.** The repo does not show how 19 was derived; one plausible gap is the 11 `RatsNumericInput` fields, which get their `numeric` keyboard from the component default rather than a visible `keyboardType`.

| # | File:line | Field | Keyboard | Source |
|---|---|---|---|---|
| 1 | `src/screens/SetupWizards/HouseSetup.tsx:223` | Contact Number | phone-pad | prop `:230` |
| 2 | `HouseSetup.tsx:247` | Monthly Rent | numeric | RatsNumericInput default |
| 3 | `HouseSetup.tsx:254` | Weekly Rent | numeric | RatsNumericInput |
| 4 | `HouseSetup.tsx:261` | Fees / Deposits | numeric | RatsNumericInput |
| 5 | `HouseSetup.tsx:268` | Beds (maximumCapacity) | numeric | RatsNumericInput |
| 6 | `src/screens/SetupWizards/PhaseSetup/PhaseConfigForm.tsx:193` | Phase Number | numeric | RatsNumericInput |
| 7 | `PhaseConfigForm.tsx:244` | Nights out allowed (conditional) | numeric | RatsNumericInput |
| 8 | `PhaseConfigForm.tsx:277` | Meetings required (conditional) | numeric | RatsNumericInput |
| 9 | `PhaseConfigForm.tsx:301` | Work hours (conditional) | numeric | RatsNumericInput |
| 10 | `src/screens/GuestSupporterOverview/GuestSupporterSummary/GuestSupporterSummary.tsx:73` | Step | numeric | RatsNumericInput |
| 11 | `src/screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx:87` | Hours | numeric | RatsNumericInput |
| 12 | `src/screens/Oxford/OxfordOnboardingWizard.tsx:265` | Monthly EES Amount ($) | numeric | prop `:268` |
| 13 | `src/screens/NewAccount/NewAccountFormView.tsx:96` | Phone number | phone-pad | local renderField `:52-56` |
| 14 | `src/screens/Profile/EditUserInfoFormView.tsx:100` | Phone number | phone-pad | local renderField `:60-64` |
| 15 | `src/screens/Application/ApplyScreen.tsx:106` | Phone | phone-pad | prop `:111` |
| 16 | `src/screens/Personal/TwoFactorSetup.tsx:51` | Phone | phone-pad | prop `:55` |
| 17 | `TwoFactorSetup.tsx:71` | Verification code | number-pad | prop `:75` |
| 18 | `src/screens/ResidentIntake/IntakeFormScreen.tsx:189` | Phone Number | phone-pad | prop `:195` |
| 19 | `IntakeFormScreen.tsx:223` | Emergency Contact Phone | phone-pad | prop `:229` |
| 20 | `IntakeFormScreen.tsx:284` | Probation Officer Phone | phone-pad | prop `:289` |
| 21 | `src/screens/Payments/ResidentPayment.tsx:403` | Payment amount | decimal-pad | prop `:409` (also `returnKeyType="done"`) |
| 22 | `src/screens/HouseSettings/PaymentDashboard.tsx:657` | Manual payment amount | decimal-pad | prop `:659` |
| 23 | `src/screens/Treasury/FinancialRecordForm.tsx:279` | Beginning balance, checking | decimal-pad | prop `:284` |
| 24 | `FinancialRecordForm.tsx:294` | Savings | decimal-pad | prop `:299` |
| 25 | `FinancialRecordForm.tsx:349` | Income line amount (per line) | decimal-pad | prop `:356` |
| 26 | `FinancialRecordForm.tsx:405` | Expense line amount (per line) | decimal-pad | prop `:412` |
| 27 | `FinancialRecordForm.tsx:422` | Check # (per line) | number-pad | prop `:430` |
| 28 | `FinancialRecordForm.tsx:476` | Bill amount (per line) | decimal-pad | prop `:483` |

By type: numeric 11, phone-pad 8, decimal-pad 7, number-pad 2.

Unreachable (`src/screens/HouseConfig/HouseConfigFormView.tsx`): rent `:257`, capacity `:264` and phone `:271` (phone-pad, `inputType 'number'` -> `:56`), plus phase order `:117`, meetings `:125`, nightsOut `:144` and work `:157` (RatsNumericInput, rendered only after "Add Phase").

These were checked and are not numeric:
- The shared `renderField` in `src/util/form.tsx:45` maps `inputType 'number'` to phone-pad, but **no caller passes `'number'`**: every call site passes `'string'` or nothing.
- `GuestUpdateFormView` (unreachable) passes no `keyboardType`, so its money and phone fields use the default keyboard.
- AddJobForm zip (`GuestWorkSummary.tsx:163`) and the Oxford time field (`OxfordOnboardingWizard.tsx:240`) use the default keyboard.

---

## 5. Notes: behaviour that depends on IQKeyboardManager

1. **Prev/Next is probably not shown today.** No code calls `KeyboardManager.setToolbarPreviousNextButtonEnable(true)`. According to the library README ("Enable Next/Previous buttons") and its native code (`ReactNativeKeyboardManager.m:105-116`, which adds `RCTRootView` to `toolbarPreviousNextAllowedClasses` only when `true` is passed), Prev/Next must be turned on explicitly. The repo therefore supports a Done-only IQ toolbar; this needs checking on a device. `setEnableAutoToolbar` is never called either, so the toolbar relies on the library default.

2. **Number pads lose their only "Done" button when IQ is removed.** With IQ's auto-toolbar on, the library swizzles away RN's own default input accessory view (`node_modules/react-native-keyboard-manager/ios/ReactNativeKeyboardManager/RCTBaseTextInputView+Hack.m:29-35`). Without IQ, RN 0.72 adds a Done bar only for number, phone or decimal pads that also set `returnKeyType == done` (`node_modules/react-native/Libraries/Text/TextInput/RCTBaseTextInputView.m:627-632`). Only `ResidentPayment.tsx:403/415` does that. On iOS (`numeric` maps to DecimalPad), the other **27 of 28** numeric/phone fields would have no dismiss key unless a `KeyboardToolbar` or `returnKeyType` is added.

3. **The only screen that disables IQ is HouseChat** (BaseChat via `useChatLogic.ts:70-77`), which does its own lift with `translateY` (`BaseChat.tsx:452-455`). **DirectChat does not disable IQ** and has an absolutely positioned composer (`DirectChat.tsx:429-439`) with no keyboard listeners and no transform. On iOS the composer is lifted only by IQKeyboardManager's view shifting. On Android it depends on `adjustResize` shrinking the root view. Separately, it is unclear without running the app whether `useChatLogic`'s `focus` listener, registered in an effect, catches the tab's first focus event.

4. **HouseChat uses the "direct" offsets.** HouseChat passes `recipient: {}` (`HouseChat.tsx:192`) and no `chatType`, so BaseChat resolves `chatType = recipient ? 'direct' : 'group'` to `'direct'` (`BaseChat.tsx:533`). `calculateInputOffset` (`:396-406`) therefore applies the direct-chat offsets on a tab screen, and the header shows the back arrow and a name built from `undefined` fields (`:159-161,175`). Keep this in mind when replacing the offset maths.

5. **HouseSetup changes IQ globally and never restores it.** Focusing the address field calls `KeyboardManager.setEnable(true)` and `setKeyboardDistanceFromTextField(normalize(100))` (`HouseSetup.tsx:78-79`). The reset to 0 (`:88`) is never invoked (`:214` is commented out), so after the first address focus on iOS every other screen inherits the larger keyboard distance until the app restarts. HouseSetup also turns APSL auto-scroll off on iOS (`enableAutomaticScroll={ANDROID}`, `:172`), so on iOS this screen relies on IQ alone. Its Android branches are dead (`:65-76` cannot run; the `height` state is unused).

6. **Fields where nothing except IQ (iOS) or `adjustResize` (Android) keeps them visible:**
   - **RN `ScrollView` with no KAV:** ApplyScreen #2, ApplicationDetail #3, DrugTestForm #10, OxfordOnboardingWizard #26, IntakeFormScreen #34, FinancialRecordForm #44 (13+ fields, long form), and BusinessMeetingDetail #25 (unreachable).
   - **Plain `View` with no scroll:**
     - DischargeGuestModal #32: an RN `Modal` with a centered dialog and no KAV.
     - The FormModal-hosted `View` forms #11, #12, #13 (AddJobForm has 5 fields) and #45. These get iOS KAV padding from RatsModal; on Android they get nothing beyond `adjustResize`.
     - ChoreSetup's modal fields #35: iOS KAV padding only, no scroll.
   - **RSV without `enableOnAndroid`,** where APSL is inactive on Android: #1, #4, #5, #6, #7, #18, #19, #21, #24, #27, #28, #29, #30, #31, #33, #36, #38, #39, #40, #43.
   - **iOS APSL auto-scroll turned off on purpose,** leaving IQ and KAV: FilterForm #17 (`FilterForm.tsx:40`) and HouseSetup #37 (`:172`).
   - **No KAV anywhere** (`useKeyboardView={false}`), only the RSV on iOS: PhaseConfigForm #39.

7. **Stacked modals.** These open a `react-native-modal` on top of the ModalContext `react-native-modal`, which is itself above the native-stack modal route `HouseSettings`:
   - ChoreSetup's `RatsModal` (`ChoreSetup.tsx:140`): two nested iOS KAVs.
   - PhaseConfigSetup's `RatsModal` (`PhaseConfigSetup.tsx:106`): outer KAV padding, inner none.

   When these move to keyboard-controller, check which layer owns keyboard avoidance.

8. **All wizard steps stay mounted.** `RatsWizardSlide` renders every step side by side ("all render, but only the active one is on-screen", `src/components/rats-wizard-slide/index.tsx:10`). Fields on off-screen steps of OperatorSetupWizard (HouseSetup 7, ManagerSetup N, GuestSetup N) and OxfordOnboardingWizard (5) remain in the view tree. That matters for any field-to-field navigation, whether IQ subview traversal or a keyboard-controller `KeyboardToolbar`.

9. **Nested virtualized lists inside a KASV.** GooglePlacesAutocomplete renders a FlatList inside an RSV in HouseSetup #37, NewMeeting #43 and HouseSearchFilterForm #17. Voting #27 has a FlatList inside an RSV. `RatsTextInput` forces `keyboardShouldPersistTaps="always"` on its Places list (`rats-text-input.tsx:369`).

10. **RatsScrollView quirks to preserve or fix deliberately:**
    - A caller's `contentContainerStyle` replaces the default container style (#4, #5 and #7 pass `{}`).
    - The default `keyboardShouldPersistTaps` is `'always'`, while most callers pass `'handled'`.
    - `keyboardDismissMode="on-drag"` is always applied and no caller overrides it.
    - `resetScrollToCoords` is always set; only HouseSetup disables `enableResetScrollToCoords`.
    - The `behavior` prop (#17, #18, #31) is a no-op.

11. **RatsTextInput** hard-codes `blurOnSubmit={true}` and does not forward arbitrary TextInputProps. `RatsNumericInput` exposes no ref. Both matter if the migration needs refs or `returnKeyType="next"` chaining. Only LoginFormView chains fields today (`:36-37`).

12. **Unreachable code** (not in any navigator; included above but excluded from the reachable totals):
    - `GuestUpdate/` and `CreateGuest/`: GuestUpdateFormView, with the only direct APSL `KeyboardAwareScrollView`.
    - `HouseConfig/`.
    - `Oxford/BusinessMeetingDetail.tsx`: navigated to by name at `BusinessMeetings.tsx:109`, so that navigation would fail.

    `src/hooks/use-keyboard.ts`, `src/components/keyboard-view` and the `react-native-keyboard-spacer` dependency are unused.

13. **Android baseline.** `adjustResize` is the only Android mechanism for every screen without `enableOnAndroid`. The only Android-specific JS keyboard logic that actually runs is in BaseChat (`calculateInputOffset`, `keyboardDid*` listeners) and the Platform ternaries in FilterForm.
