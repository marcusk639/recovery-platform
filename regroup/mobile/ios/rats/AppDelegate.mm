#import "AppDelegate.h"
#import <Firebase.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation RatsReactNativeDelegate

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  // Debug builds load the JS from Metro.
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  // Release and the E2E configurations load the bundled JS (the "Bundle React
  // Native code and images" build phase writes main.jsbundle).
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [FIRApp configure];

  // E2E detection: Maestro launches the app with an IS_E2E_TEST argument. Surface
  // it into NSUserDefaults so JS can read it via the React Native Settings module
  // (used to relax automation-hostile UI, e.g. secureTextEntry on the login form).
  // Checks argv (with/without leading dash) and the environment to be robust to
  // however the launcher passes it. Always written explicitly so a normal launch
  // resets the flag to NO.
  NSArray<NSString *> *launchArgs = [[NSProcessInfo processInfo] arguments];
  NSDictionary<NSString *, NSString *> *launchEnv = [[NSProcessInfo processInfo] environment];
  BOOL isE2ETest = [launchArgs containsObject:@"IS_E2E_TEST"] ||
                   [launchArgs containsObject:@"-IS_E2E_TEST"] ||
                   [launchEnv[@"IS_E2E_TEST"] isEqualToString:@"1"];
  [[NSUserDefaults standardUserDefaults] setBool:isE2ETest forKey:@"IS_E2E_TEST"];

  // React Native starts when the window scene connects (SceneDelegate): under the
  // UIScene lifecycle, which the iOS 27 SDK requires, a URL or universal link that
  // launched the app arrives in the scene's connection options, not launchOptions.
  self.reactNativeDelegate = [RatsReactNativeDelegate new];
  self.reactNativeDelegate.dependencyProvider = [RCTAppDependencyProvider new];
  self.reactNativeFactory = [[RCTReactNativeFactory alloc] initWithDelegate:self.reactNativeDelegate];

  // Remote-notification registration and delivery are RNFirebase messaging's
  // (AppDelegate swizzling and its UNUserNotificationCenter delegate, which shows
  // foreground `notification` pushes per firebase.json); notify-kit presents what
  // it displays. The app is not the notification center's delegate.
  return YES;
}

@end

/// Forwards opened URLs to React Native's Linking, except the ones Firebase Auth
/// handles itself (the phone-auth reCAPTCHA redirect).
static void RatsForwardURLContexts(UIScene *scene, NSSet<UIOpenURLContext *> *URLContexts)
{
  NSMutableSet<UIOpenURLContext *> *forLinking = [NSMutableSet setWithCapacity:URLContexts.count];
  for (UIOpenURLContext *context in URLContexts) {
    if (![[FIRAuth auth] canHandleURL:context.URL]) {
      [forLinking addObject:context];
    }
  }
  if (forLinking.count > 0) {
    [RCTLinkingManager scene:scene openURLContexts:forLinking];
  }
}

// Under the UIScene lifecycle UIKit delivers URLs and universal links to the scene
// delegate; the UIApplicationDelegate openURL/continueUserActivity methods are not called.
@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;

  if (!appDelegate.reactNativeStarted) {
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
    // React Native and its libraries reach the window through the app delegate.
    appDelegate.window = self.window;
    // Creates the root view controller in the window and makes it key and visible;
    // the first URL or user activity in the connection options becomes
    // Linking.getInitialURL().
    [appDelegate.reactNativeFactory startReactNativeWithModuleName:@"rats"
                                                          inWindow:self.window
                                                 connectionOptions:connectionOptions];
    appDelegate.reactNativeStarted = YES;
    return;
  }

  // The scene was discarded and reconnected while the process (and React Native)
  // lived: move the existing root view controller to the new window, detaching it
  // from the old one first.
  UIWindow *oldWindow = appDelegate.window;
  UIViewController *rootViewController = oldWindow.rootViewController;
  NSAssert(rootViewController != nil, @"React Native has no root view controller to reattach");
  if (rootViewController == nil) {
    NSLog(@"[SceneDelegate] React Native has no root view controller; the scene will show a blank window");
  }
  oldWindow.rootViewController = nil;

  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  appDelegate.window = self.window;
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];

  // UIKit does not call scene:openURLContexts: / continueUserActivity: for
  // connection options, so forward them to React Native's Linking here.
  if (connectionOptions.URLContexts.count > 0) {
    RatsForwardURLContexts(scene, connectionOptions.URLContexts);
  }
  for (NSUserActivity *activity in connectionOptions.userActivities) {
    [RCTLinkingManager scene:scene continueUserActivity:activity];
  }
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  RatsForwardURLContexts(scene, URLContexts);
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager scene:scene continueUserActivity:userActivity];
}

@end
