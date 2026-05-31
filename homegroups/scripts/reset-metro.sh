# Kill any existing Metro processes
killall -9 node

cd /Users/marcusklein/dev/RecoveryConnect/mobile
rm -rf $TMPDIR/metro-* $TMPDIR/haste-map-*
cd ios && rm -rf build Pods Podfile.lock && pod install && cd ..

# 2. Start Metro with clean cache
cd ../mobile && npx react-native start --reset-cache &

# 3. Rebuild and run iOS app
cd ../mobile && npx react-native run-ios