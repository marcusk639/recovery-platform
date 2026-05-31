#import "AppDelegate.h"
#import <Firebase.h>
#import <React/RCTBundleURLProvider.h>
#import <GoogleMaps/GoogleMaps.h>
#import <React/RCTLinkingManager.h>
#import <GoogleSignIn/GoogleSignIn.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"RecoveryConnect";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  [FIRApp configure];
  
  // Configure Google Maps
  [GMSServices provideAPIKey:@"AIzaSyBQ2B4VmJ8ukQAc_WL6KfZF6xa2KR-1NSU"];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
  return true;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Deep linking handler
- (BOOL)application:(UIApplication *)application
   openURL:(NSURL *)url
   options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  NSString *scheme = [url scheme];
  
  // Try Google Sign-In first if URL scheme matches Google OAuth callback
  // The exact scheme is: com.googleusercontent.apps.CLIENT_ID
  if (scheme && [scheme isEqualToString:@"com.googleusercontent.apps.421876308052-keo1nq0auqhvlcutg356nfrqs2p45ho8"]) {
    BOOL handled = [[GIDSignIn sharedInstance] handleURL:url];
    if (handled) {
      return YES;
    }
  }
  
  // Handle other deep links via React Native Linking
  return [RCTLinkingManager application:application openURL:url options:options];
}

// Universal linking handler
- (BOOL)application:(UIApplication *)application continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
 return [RCTLinkingManager application:application
                  continueUserActivity:userActivity
                    restorationHandler:restorationHandler];
}

@end
