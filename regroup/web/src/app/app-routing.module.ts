import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ThemeOneComponent } from './themes/theme-one/theme-one.component';
import { ThemeTwoComponent } from './themes/theme-two/theme-two.component';
import { ThemeThreeComponent } from './themes/theme-three/theme-three.component';
import { ThemeFourComponent } from './themes/theme-four/theme-four.component';
import { ThemeFiveComponent } from './themes/theme-five/theme-five.component';
import { ThemeSixComponent } from './themes/theme-six/theme-six.component';
import { PricingComponent } from './components/inner-pages/pricing/pricing.component';
import { DownloadPageComponent } from './components/inner-pages/download-page/download-page.component';
import { SubscribePageComponent } from './components/inner-pages/subscribe-page/subscribe-page.component';
import { ThankYouComponent } from './components/inner-pages/thank-you/thank-you.component';
import { ComingSoonComponent } from './components/inner-pages/coming-soon/coming-soon.component';
import { ErrorComponent } from './components/inner-pages/error/error.component';
import { BlogTwoColumnComponent } from './components/blogs/blog-two-column/blog-two-column.component';
import { BlogThreeColumnComponent } from './components/blogs/blog-three-column/blog-three-column.component';
import { BlogLeftSidebarComponent } from './components/blogs/blog-left-sidebar/blog-left-sidebar.component';
import { BlogRightSidebarComponent } from './components/blogs/blog-right-sidebar/blog-right-sidebar.component';
import { BlogDetailsLeftSidebarComponent } from './components/blogs/blog-details-left-sidebar/blog-details-left-sidebar.component';
import { BlogDetailsRightSidebarComponent } from './components/blogs/blog-details-right-sidebar/blog-details-right-sidebar.component';
import { LoginComponent } from './components/accounts/login/login.component';
import { SignupComponent } from './components/accounts/signup/signup.component';
import { ResetComponent } from './components/accounts/reset/reset.component';
import { ReviewPageComponent } from './components/inner-pages/review-page/review-page.component';
import { FaqPageComponent } from './components/inner-pages/faq-page/faq-page.component';
import { ContactPageComponent } from './components/inner-pages/contact-page/contact-page.component';
import { PrivacyPolicyComponent } from './components/privacypolicy/privacy-policy/privacy-policy.component';
import { TermsComponent } from './components/terms/privacy-policy/terms.component';
import { MyAccountComponent } from './components/accounts/my-account/my-account.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  { path: '', component: ThemeTwoComponent },
  { path: 'theme-two', component: ThemeTwoComponent },
  { path: 'theme-three', component: ThemeThreeComponent },
  { path: 'theme-four', component: ThemeFourComponent },
  { path: 'theme-five', component: ThemeFiveComponent },
  { path: 'theme-six', component: ThemeSixComponent },
  { path: 'pricing', component: PricingComponent },
  { path: 'download', component: DownloadPageComponent },
  { path: 'subscribe', component: SubscribePageComponent },
  { path: 'thank-you', component: ThankYouComponent },
  { path: 'coming-soon', component: ComingSoonComponent },
  { path: 'error', component: ErrorComponent },
  { path: 'blog-two-column', component: BlogTwoColumnComponent },
  { path: 'blog-three-column', component: BlogThreeColumnComponent },
  { path: 'blog-left-sidebar', component: BlogLeftSidebarComponent },
  { path: 'blog-right-sidebar', component: BlogRightSidebarComponent },
  { path: 'blog-details-left-sidebar', component: BlogDetailsLeftSidebarComponent },
  { path: 'blog-details-right-sidebar', component: BlogDetailsRightSidebarComponent },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'reset', component: ResetComponent },
  { path: 'reviews', component: ReviewPageComponent },
  { path: 'faq', component: FaqPageComponent },
  { path: 'contact', component: ContactPageComponent },
  { path: 'privacy-policy', component: PrivacyPolicyComponent },
  { path: 'terms', component: TermsComponent },
  { path: 'my-account', component: MyAccountComponent, canActivate: [AuthGuard] },
  // The mobile app's "Manage Subscription" button deep-links to /billing (see
  // regroup/mobile/src/screens/Subscription/SubscriptionRequiredScreen.tsx and the
  // 2026-05-19 paywall design spec). That path was specified but never built, so
  // released builds land on a 404. Redirect it to the account page, which hosts the
  // Stripe billing portal. Keep this route as long as any shipped build targets it.
  { path: 'billing', redirectTo: 'my-account', pathMatch: 'full' },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      initialNavigation: 'enabled',
      scrollPositionRestoration: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule { }
