#import <UIKit/UIKit.h>

#import <React-RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React-RCTAppDelegate/RCTReactNativeFactory.h>

/// The React Native factory's delegate: the app's bundle URL (Debug: Metro's
/// `index`, otherwise the bundled `main.jsbundle`). AppDelegate sets its
/// dependencyProvider to the codegen'd RCTAppDependencyProvider.
@interface RatsReactNativeDelegate : RCTDefaultReactNativeFactoryDelegate
@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>

/// The window of the app's scene. SceneDelegate assigns it before starting React
/// Native: RNFirebase messaging and react-native-date-picker's modal mode reach
/// the window through the app delegate.
@property (strong, nonatomic) UIWindow *window;

/// Created once in application:didFinishLaunchingWithOptions:.
@property (strong) RCTReactNativeFactory *reactNativeFactory;
/// RCTReactNativeFactory.delegate is weak, so the app delegate holds it strongly.
@property (strong) RatsReactNativeDelegate *reactNativeDelegate;
/// YES once React Native has been started in a window. It is started once per
/// process; a scene that reconnects while the process lives reuses its root view
/// controller (SceneDelegate).
@property BOOL reactNativeStarted;

@end

/// The app's only window scene delegate (Info.plist UIApplicationSceneManifest).
/// Declared here rather than in its own file to keep the Xcode project unchanged.
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>

@property (strong, nonatomic) UIWindow *window;

@end
