#import "AppDelegate.h"
#import <Firebase.h>
#import <UserNotifications/UserNotifications.h>
#import <RNCPushNotificationIOS.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTBundleURLProvider.h>

// Note: Detox 20+ does not require this import
// #if DEBUG
// #import <Detox/Detox-Swift.h>
// #endif

@interface AppDelegate ()

@property (nonatomic, copy) NSDictionary *appLaunchOptions;

@end

@implementation AppDelegate

- (UIViewController *)rootViewControllerForConnectionOptions:(UISceneConnectionOptions *)connectionOptions
{
  if (self.bridge == nil) {
    // Rebuild the launch options React Native reads for Linking.getInitialURL().
    NSMutableDictionary *options = [self.appLaunchOptions mutableCopy];
    NSURL *url = connectionOptions.URLContexts.anyObject.URL;
    if (url) {
      options[UIApplicationLaunchOptionsURLKey] = url;
    }
    NSUserActivity *activity = connectionOptions.userActivities.anyObject;
    if (activity) {
      options[UIApplicationLaunchOptionsUserActivityDictionaryKey] = @{
        UIApplicationLaunchOptionsUserActivityTypeKey : activity.activityType,
        @"UIApplicationLaunchOptionsUserActivityKey" : activity,
      };
    }
    // RCTAppDelegate creates the bridge, the root view and a scene-less window.
    [super application:UIApplication.sharedApplication didFinishLaunchingWithOptions:options];
  } else {
    // The scene was discarded and reconnected while the process (and bridge) lived.
    // UIKit does not call scene:openURLContexts: / continueUserActivity: for
    // connection options, so forward them to React Native's Linking here.
    for (UIOpenURLContext *context in connectionOptions.URLContexts) {
      [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:@{}];
    }
    for (NSUserActivity *activity in connectionOptions.userActivities) {
      [RCTLinkingManager application:UIApplication.sharedApplication
                continueUserActivity:activity
                  restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable restorableObjects){
                  }];
    }
  }
  UIViewController *rootViewController = self.window.rootViewController;
  self.window.rootViewController = nil;
  return rootViewController;
}

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

  self.moduleName = @"rats";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  // React Native starts when the window scene connects (SceneDelegate): under the
  // UIScene lifecycle, which the iOS 27 SDK requires, a URL or universal link that
  // launched the app arrives in the scene's connection options, not launchOptions.
  self.appLaunchOptions = launchOptions ?: @{};

  // Define UNUserNotificationCenter
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;

  return YES;
}

//Called when a notification is delivered to a foreground app.
-(void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  completionHandler(UNNotificationPresentationOptionSound | UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionBadge);
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  // Note: Detox 20+ doesn't need special bundling configuration
  // Always use Metro in DEBUG mode for both regular app and Detox tests
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Required for the register event.
- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken
{
 [RNCPushNotificationIOS didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}
// Required for the notification event. You must call the completion handler after handling the remote notification.
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  [RNCPushNotificationIOS didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}
// Required for the registrationError event.
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
 [RNCPushNotificationIOS didFailToRegisterForRemoteNotificationsWithError:error];
}
// Required for localNotification event
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
  [RNCPushNotificationIOS didReceiveNotificationResponse:response];
}

@end

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
  UIViewController *rootViewController = [appDelegate rootViewControllerForConnectionOptions:connectionOptions];
  self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  self.window.rootViewController = rootViewController;
  // React Native and its libraries reach the window through the app delegate.
  appDelegate.window = self.window;
  [self.window makeKeyAndVisible];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:@{}];
  }
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  [RCTLinkingManager application:UIApplication.sharedApplication
            continueUserActivity:userActivity
              restorationHandler:^(NSArray<id<UIUserActivityRestoring>> *_Nullable restorableObjects){
              }];
}

@end
