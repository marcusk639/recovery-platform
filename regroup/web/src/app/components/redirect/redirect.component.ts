import { Component, OnInit, Inject, PLATFORM_ID } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { ActivatedRoute } from "@angular/router";

@Component({
  selector: "app-redirect",
  template: `
    <div class="redirect-container">
      <div class="redirect-content">
        <h2>Redirecting to Regroup App...</h2>
        <p>If the app doesn't open automatically, please tap the link below:</p>
        <a [href]="customSchemeUrl" class="app-link">Open in Regroup App</a>
        <p class="fallback-text">
          Don't have the app?
          <a [href]="fallbackUrl" target="_blank">Download it here</a>
        </p>
        <div class="debug-info" *ngIf="showDebugInfo">
          <h3>Debug Information:</h3>
          <p><strong>Custom Scheme URL:</strong> {{ customSchemeUrl }}</p>
          <p><strong>Fallback URL:</strong> {{ fallbackUrl }}</p>
          <p><strong>User Agent:</strong> {{ userAgent }}</p>
          <p><strong>Platform:</strong> {{ getPlatform() }}</p>
          <p><strong>Current URL:</strong> {{ getCurrentUrl() }}</p>
          <div class="test-buttons">
            <button (click)="testCustomScheme()" class="test-btn">
              Test Custom Scheme
            </button>
            <button (click)="testUniversalLink()" class="test-btn">
              Test Universal Link
            </button>
            <button (click)="testBundleIdScheme()" class="test-btn">
              Test Bundle ID
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .redirect-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          sans-serif;
      }

      .redirect-content {
        text-align: center;
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        max-width: 400px;
        margin: 1rem;
      }

      h2 {
        color: #333;
        margin-bottom: 1rem;
        font-size: 1.5rem;
      }

      p {
        color: #666;
        margin-bottom: 1.5rem;
        line-height: 1.5;
      }

      .app-link {
        display: inline-block;
        background: #007bff;
        color: white;
        padding: 12px 24px;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
        margin-bottom: 1rem;
        transition: background-color 0.2s;
      }

      .app-link:hover {
        background: #0056b3;
      }

      .fallback-text {
        font-size: 0.9rem;
      }

      .fallback-text a {
        color: #007bff;
        text-decoration: none;
      }

      .fallback-text a:hover {
        text-decoration: underline;
      }

      .debug-info {
        margin-top: 2rem;
        padding: 1rem;
        background: #f8f9fa;
        border-radius: 6px;
        text-align: left;
        font-size: 0.8rem;
      }

      .debug-info h3 {
        margin: 0 0 1rem 0;
        color: #333;
        font-size: 1rem;
      }

      .debug-info p {
        margin: 0.5rem 0;
        word-break: break-all;
      }

      .test-buttons {
        margin-top: 15px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .test-btn {
        background-color: #28a745;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      .test-btn:hover {
        background-color: #218838;
      }
    `,
  ],
})
export class RedirectComponent implements OnInit {
  customSchemeUrl = "";
  fallbackUrl = "";
  showDebugInfo = false;
  userAgent = "";

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.handleRedirect();
    }
  }

  getPlatform(): string {
    if (isPlatformBrowser(this.platformId)) {
      const userAgent = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(userAgent)) return "iOS";
      if (/android/.test(userAgent)) return "Android";
      return "Desktop";
    }
    return "Unknown";
  }

  getCurrentUrl(): string {
    if (isPlatformBrowser(this.platformId)) {
      return window.location.href;
    }
    return "Unknown";
  }

  testCustomScheme() {
    if (this.customSchemeUrl) {
      window.location.href = this.customSchemeUrl;
    }
  }

  testUniversalLink() {
    if (this.customSchemeUrl) {
      const universalLink = this.customSchemeUrl.replace(
        "regroup-app://",
        "https://regroup-app.com/"
      );
      window.location.href = universalLink;
    }
  }

  testBundleIdScheme() {
    if (this.customSchemeUrl) {
      const bundleIdScheme = this.customSchemeUrl.replace(
        "regroup-app://",
        "com.rats.dev://"
      );
      window.location.href = bundleIdScheme;
    }
  }

  private handleRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUrl = urlParams.get("url");
    const debug = urlParams.get("debug");

    // Show debug info if debug parameter is present
    this.showDebugInfo = debug === "true";
    this.userAgent = navigator.userAgent;

    if (redirectUrl) {
      this.customSchemeUrl = decodeURIComponent(redirectUrl);
      this.redirectToCustomScheme(this.customSchemeUrl);
    } else {
      // Fallback to home page if no redirect URL
      window.location.href = "/";
    }
  }

  private redirectToCustomScheme(customSchemeUrl: string) {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);

    if (isIOS) {
      this.fallbackUrl =
        "https://apps.apple.com/us/app/regroup-sober-living-app/id1502040260";

      // For debug mode, try multiple approaches
      this.attemptAppLaunchWithFallbacks(customSchemeUrl, this.fallbackUrl);
    } else if (isAndroid) {
      this.fallbackUrl =
        "https://play.google.com/store/apps/details?id=com.regroup.app";
      this.attemptAppLaunch(customSchemeUrl, this.fallbackUrl);
    } else {
      // Desktop - show download options
      this.fallbackUrl = "/download";
    }
  }

  private attemptAppLaunchWithFallbacks(appUrl: string, fallbackUrl: string) {
    console.log("attemptAppLaunchWithFallbacks - appUrl:", appUrl);

    // Method 1: Try the URL as-is first (should be com.rats.dev:// for debug builds)
    this.attemptAppLaunch(appUrl, fallbackUrl);

    // Method 2: If it's regroup-app://, try converting to bundle ID scheme
    if (appUrl.startsWith("regroup-app://")) {
      setTimeout(() => {
        const bundleIdScheme = appUrl.replace(
          "regroup-app://",
          "com.rats.dev://"
        );
        console.log(
          "attemptAppLaunchWithFallbacks - trying bundle ID scheme:",
          bundleIdScheme
        );
        this.attemptAppLaunch(bundleIdScheme, fallbackUrl);
      }, 500);
    }

    // Method 3: Try universal link as final fallback
    setTimeout(() => {
      let universalLink;
      if (appUrl.startsWith("regroup-app://")) {
        universalLink = appUrl.replace(
          "regroup-app://",
          "https://regroup-app.com/"
        );
      } else if (appUrl.startsWith("com.rats.dev://")) {
        universalLink = appUrl.replace(
          "com.rats.dev://",
          "https://regroup-app.com/"
        );
      } else {
        universalLink = appUrl;
      }
      console.log(
        "attemptAppLaunchWithFallbacks - trying universal link:",
        universalLink
      );
      this.attemptAppLaunch(universalLink, fallbackUrl);
    }, 1000);
  }

  private attemptAppLaunch(appUrl: string, fallbackUrl: string) {
    console.log("attemptAppLaunch - trying to open:", appUrl);
    console.log("attemptAppLaunch - fallback URL:", fallbackUrl);

    // Method 1: Try direct window.location
    try {
      console.log("attemptAppLaunch - trying window.location.href");
      window.location.href = appUrl;
    } catch (error) {
      console.log("Direct location failed:", error);
    }

    // Method 2: Create a hidden iframe
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = appUrl;
    document.body.appendChild(iframe);
    console.log("attemptAppLaunch - created iframe with src:", appUrl);

    // Method 3: Try opening in a new window/tab
    setTimeout(() => {
      try {
        console.log("attemptAppLaunch - trying window.open");
        window.open(appUrl, "_blank");
      } catch (error) {
        console.log("Window open failed:", error);
      }
    }, 500);

    // Clean up and fallback
    setTimeout(() => {
      console.log(
        "attemptAppLaunch - timeout reached, redirecting to fallback"
      );
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
      window.location.href = fallbackUrl;
    }, 3000);
  }
}
