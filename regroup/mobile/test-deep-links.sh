#!/bin/bash

# Deep Link Testing Script for React Native App
# This script helps test deep links on iOS Simulator

echo "🔗 Deep Link Testing Script"
echo "=========================="

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script only works on macOS"
    exit 1
fi

# Check if xcrun is available
if ! command -v xcrun &> /dev/null; then
    echo "❌ xcrun not found. Please install Xcode command line tools"
    exit 1
fi

# Function to test a deep link
test_deep_link() {
    local url=$1
    local description=$2
    
    echo ""
    echo "🧪 Testing: $description"
    echo "URL: $url"
    
    # Try to open the URL
    if xcrun simctl openurl booted "$url" 2>/dev/null; then
        echo "✅ Successfully sent to simulator"
    else
        echo "❌ Failed to send to simulator"
    fi
    
    sleep 2
}

# Test URLs
echo ""
echo "📱 Starting deep link tests..."
echo "Make sure your app is running in the iOS Simulator"
echo ""

# Test custom scheme
test_deep_link "regroup-app://?type=invitation&house=test123&email=test@example.com&invitationType=guest" "Custom Scheme Invitation"

# # Test bundle ID scheme
# test_deep_link "com.rats.dev://?type=invitation&house=test123&email=test@example.com&invitationType=guest" "Bundle ID Scheme Invitation"

# # Test universal link
# test_deep_link "https://regroup-app.com/?type=invitation&house=test123&email=test@example.com&invitationType=guest" "Universal Link Invitation"

# # Test email confirmation
# test_deep_link "regroup-app://?type=emailConfirmation&userId=test123&email=test@example.com" "Custom Scheme Email Confirmation"

# # Test bundle ID email confirmation
# test_deep_link "com.rats.dev://?type=emailConfirmation&userId=test123&email=test@example.com" "Bundle ID Email Confirmation"

echo ""
echo "🎯 Testing completed!"
echo ""
echo "📋 What to check:"
echo "1. Did the app open when you clicked the links?"
echo "2. Did the app handle the deep link data correctly?"
echo "3. Are there any error messages in the console?"
echo ""
echo "🔧 If links don't work:"
echo "1. Make sure the app is installed and running"
echo "2. Check that the app is registered to handle these schemes"
echo "3. Try the DeepLinkTester component in the app"
echo "4. Check the console logs for errors"
