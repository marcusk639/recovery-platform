cd /Users/marcuspersonal/dev/RecoveryConnect/mobile/ios && \
export LANG=en_US.UTF-8 && export LC_ALL=en_US.UTF-8 && \
rm -rf ~/Library/Caches/CocoaPods && \
pod cache clean --all && \
rm -rf Pods Podfile.lock build && \
pod install --repo-update