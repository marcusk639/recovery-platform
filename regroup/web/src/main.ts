import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { disableAnalyticsOnAppLinkPages } from './app/analytics-providers';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Before bootstrap: AngularFireAnalyticsModule loads Analytics as AppModule starts.
disableAnalyticsOnAppLinkPages(
  window,
  (environment.firebaseConfig as { measurementId?: string }).measurementId,
);

document.addEventListener('DOMContentLoaded', () => {
  platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
});
