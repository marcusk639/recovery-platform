#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UNUserNotificationCenter.h>

@interface AppDelegate : RCTAppDelegate <UNUserNotificationCenterDelegate>

/// Starts React Native (once) for the app's window scene and returns its root
/// view controller (nil only if React Native failed to create one). Called by
/// SceneDelegate when the scene connects.
- (UIViewController *)startReactNativeIfNeededWithConnectionOptions:(UISceneConnectionOptions *)connectionOptions;

@end

/// The app's only window scene delegate (Info.plist UIApplicationSceneManifest).
/// Declared here rather than in its own file to keep the Xcode project unchanged.
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>

@property (strong, nonatomic) UIWindow *window;

@end
