import { BrowserModule } from "@angular/platform-browser";
import { NgModule, NO_ERRORS_SCHEMA } from "@angular/core";
import { AngularFireModule } from "@angular/fire";
import { AngularFirestoreModule } from "@angular/fire/firestore";
import { AngularFireStorageModule } from "@angular/fire/storage";
import { AngularFireAuthModule } from "@angular/fire/auth";
import { AngularFireFunctionsModule } from "@angular/fire/functions";
import { AngularFireAnalyticsModule } from "@angular/fire/analytics";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { NgxStripeModule } from "ngx-stripe";
import { WelcomeOneComponent } from "./components/welcome/welcome-one/welcome-one.component";
import { CounterComponent } from "./components/counter/counter.component";
import { FeatureOneComponent } from "./components/features/feature-one/feature-one.component";
import { ServiceOneComponent } from "./components/services/service-one/service-one.component";
import { DiscoverOneComponent } from "./components/discover/discover-one/discover-one.component";
import { WorkComponent } from "./components/work/work.component";
import { ScreenshotOneComponent } from "./components/screenshots/screenshot-one/screenshot-one.component";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { PricingOneComponent } from "./components/pricing/pricing-one/pricing-one.component";
import { FaqOneComponent } from "./components/faq/faq-one/faq-one.component";
import { TeamComponent } from "./components/team/team.component";
import { DownloadComponent } from "./components/download/download.component";
import { SubscribeComponent } from "./components/subscribe/subscribe.component";
import { ContactComponent } from "./components/contact/contact.component";
import { FooterOneComponent } from "./components/footer/footer-one/footer-one.component";
import { FooterTwoComponent } from "./components/footer/footer-two/footer-two.component";
import { ScrollupComponent } from "./components/scrollup/scrollup.component";
import { ThemeOneComponent } from "./themes/theme-one/theme-one.component";
import { ThemeTwoComponent } from "./themes/theme-two/theme-two.component";
import { WelcomeTwoComponent } from "./components/welcome/welcome-two/welcome-two.component";
import { FeatureTwoComponent } from "./components/features/feature-two/feature-two.component";
import { DiscoverTwoComponent } from "./components/discover/discover-two/discover-two.component";
import { ServiceTwoComponent } from "./components/services/service-two/service-two.component";
import { ScreenshotTwoComponent } from "./components/screenshots/screenshot-two/screenshot-two.component";
import { ReviewOneComponent } from "./components/reviews/review-one/review-one.component";
import { ReviewTwoComponent } from "./components/reviews/review-two/review-two.component";
import { FaqTwoComponent } from "./components/faq/faq-two/faq-two.component";
import { ThemeThreeComponent } from "./themes/theme-three/theme-three.component";
import { ThemeFourComponent } from "./themes/theme-four/theme-four.component";
import { ThemeFiveComponent } from "./themes/theme-five/theme-five.component";
import { ThemeSixComponent } from "./themes/theme-six/theme-six.component";
import { WelcomeThreeComponent } from "./components/welcome/welcome-three/welcome-three.component";
import { WelcomeFourComponent } from "./components/welcome/welcome-four/welcome-four.component";
import { WelcomeFiveComponent } from "./components/welcome/welcome-five/welcome-five.component";
import { WelcomeSixComponent } from "./components/welcome/welcome-six/welcome-six.component";
import { FeatureThreeComponent } from "./components/features/feature-three/feature-three.component";
import { DiscoverThreeComponent } from "./components/discover/discover-three/discover-three.component";
import { ServiceThreeComponent } from "./components/services/service-three/service-three.component";
import { ReviewThreeComponent } from "./components/reviews/review-three/review-three.component";
import { PricingTwoComponent } from "./components/pricing/pricing-two/pricing-two.component";
import { ServiceFourComponent } from "./components/services/service-four/service-four.component";
import { DiscoverFourComponent } from "./components/discover/discover-four/discover-four.component";
import { FeatureFourComponent } from "./components/features/feature-four/feature-four.component";
import { FeatureFiveComponent } from "./components/features/feature-five/feature-five.component";
import { ServiceFiveComponent } from "./components/services/service-five/service-five.component";
import { DiscoverFiveComponent } from "./components/discover/discover-five/discover-five.component";
import { PricingThreeComponent } from "./components/pricing/pricing-three/pricing-three.component";
import { ServiceSixComponent } from "./components/services/service-six/service-six.component";
import { DiscoverSixComponent } from "./components/discover/discover-six/discover-six.component";
import { BrandComponent } from "./components/brand/brand.component";
import { FeatureSixComponent } from "./components/features/feature-six/feature-six.component";
import { PricingFourComponent } from "./components/pricing/pricing-four/pricing-four.component";
import { BlogTwoColumnComponent } from "./components/blogs/blog-two-column/blog-two-column.component";
import { BlogThreeColumnComponent } from "./components/blogs/blog-three-column/blog-three-column.component";
import { BlogLeftSidebarComponent } from "./components/blogs/blog-left-sidebar/blog-left-sidebar.component";
import { BlogRightSidebarComponent } from "./components/blogs/blog-right-sidebar/blog-right-sidebar.component";
import { BlogDetailsLeftSidebarComponent } from "./components/blogs/blog-details-left-sidebar/blog-details-left-sidebar.component";
import { BlogDetailsRightSidebarComponent } from "./components/blogs/blog-details-right-sidebar/blog-details-right-sidebar.component";
import { PricingComponent } from "./components/inner-pages/pricing/pricing.component";
import { ThankYouComponent } from "./components/inner-pages/thank-you/thank-you.component";
import { ComingSoonComponent } from "./components/inner-pages/coming-soon/coming-soon.component";
import { ErrorComponent } from "./components/inner-pages/error/error.component";
import { LoginComponent } from "./components/accounts/login/login.component";
import { SignupComponent } from "./components/accounts/signup/signup.component";
import { ResetComponent } from "./components/accounts/reset/reset.component";
import { BreadcrumbPricingComponent } from "./components/breadcrumb/breadcrumb-pricing/breadcrumb-pricing.component";
import { BreadcrumbBlogTwoColumnComponent } from "./components/breadcrumb/breadcrumb-blog-two-column/breadcrumb-blog-two-column.component";
import { BreadcrumbBlogThreeColumnComponent } from "./components/breadcrumb/breadcrumb-blog-three-column/breadcrumb-blog-three-column.component";
import { BreadcrumbBlogLeftSidebarComponent } from "./components/breadcrumb/breadcrumb-blog-left-sidebar/breadcrumb-blog-left-sidebar.component";
import { BreadcrumbBlogRightSidebarComponent } from "./components/breadcrumb/breadcrumb-blog-right-sidebar/breadcrumb-blog-right-sidebar.component";
import { BreadcrumbBlogDetailsLeftSidebarComponent } from "./components/breadcrumb/breadcrumb-blog-details-left-sidebar/breadcrumb-blog-details-left-sidebar.component";
import { BreadcrumbBlogDetailsRightSidebarComponent } from "./components/breadcrumb/breadcrumb-blog-details-right-sidebar/breadcrumb-blog-details-right-sidebar.component";
import { BreadcrumbReviewsComponent } from "./components/breadcrumb/breadcrumb-reviews/breadcrumb-reviews.component";
import { FaqThreeComponent } from "./components/faq/faq-three/faq-three.component";
import { BreadcrumbFaqComponent } from "./components/breadcrumb/breadcrumb-faq/breadcrumb-faq.component";
import { BreadcrumbContactComponent } from "./components/breadcrumb/breadcrumb-contact/breadcrumb-contact.component";
import { ReviewPageComponent } from "./components/inner-pages/review-page/review-page.component";
import { DownloadPageComponent } from "./components/inner-pages/download-page/download-page.component";
import { SubscribePageComponent } from "./components/inner-pages/subscribe-page/subscribe-page.component";
import { FaqPageComponent } from "./components/inner-pages/faq-page/faq-page.component";
import { ContactPageComponent } from "./components/inner-pages/contact-page/contact-page.component";
import { HeaderOneComponent } from "./components/header/header-one/header-one.component";
import { HeaderTwoComponent } from "./components/header/header-two/header-two.component";
import { AuthService } from "src/app/services/auth/auth-service.service";
import { environment } from "../environments/environment";
import { MekFieldComponent } from "./components/ui/mek-field/mek-field.component";
import { BillingInfoComponent } from "./components/billing/billing-info/billing-info.component";
import { LoadingComponent } from "./components/loading/loading/loading.component";
import { ContactService } from "./services/contact/contact.service";
import { SubscriptionService } from "./services/subscriptions/subscription.service";
import { PrivacyPolicyComponent } from "./components/privacypolicy/privacy-policy/privacy-policy.component";
import { TermsComponent } from "./components/terms/privacy-policy/terms.component";
import { MyAccountComponent } from "./components/accounts/my-account/my-account.component";
import { ModalComponent } from "./components/modal/modal.component";
import { AuthGuard } from "./guards/auth.guard";

@NgModule({
  declarations: [
    AppComponent,
    WelcomeOneComponent,
    CounterComponent,
    FeatureOneComponent,
    ServiceOneComponent,
    DiscoverOneComponent,
    WorkComponent,
    ScreenshotOneComponent,
    PricingOneComponent,
    FaqOneComponent,
    TeamComponent,
    DownloadComponent,
    SubscribeComponent,
    ContactComponent,
    FooterOneComponent,
    FooterTwoComponent,
    ScrollupComponent,
    ThemeOneComponent,
    ThemeTwoComponent,
    WelcomeTwoComponent,
    FeatureTwoComponent,
    DiscoverTwoComponent,
    ServiceTwoComponent,
    ScreenshotTwoComponent,
    ReviewOneComponent,
    ReviewTwoComponent,
    FaqTwoComponent,
    ThemeThreeComponent,
    ThemeFourComponent,
    ThemeFiveComponent,
    ThemeSixComponent,
    WelcomeThreeComponent,
    WelcomeFourComponent,
    WelcomeFiveComponent,
    WelcomeSixComponent,
    FeatureThreeComponent,
    DiscoverThreeComponent,
    ServiceThreeComponent,
    ReviewThreeComponent,
    PricingTwoComponent,
    ServiceFourComponent,
    DiscoverFourComponent,
    FeatureFourComponent,
    FeatureFiveComponent,
    ServiceFiveComponent,
    DiscoverFiveComponent,
    PricingThreeComponent,
    ServiceSixComponent,
    DiscoverSixComponent,
    BrandComponent,
    FeatureSixComponent,
    PricingFourComponent,
    BlogTwoColumnComponent,
    BlogThreeColumnComponent,
    BlogLeftSidebarComponent,
    BlogRightSidebarComponent,
    BlogDetailsLeftSidebarComponent,
    BlogDetailsRightSidebarComponent,
    PricingComponent,
    ThankYouComponent,
    ComingSoonComponent,
    ErrorComponent,
    LoginComponent,
    MyAccountComponent,
    SignupComponent,
    ResetComponent,
    BreadcrumbPricingComponent,
    BreadcrumbBlogTwoColumnComponent,
    BreadcrumbBlogThreeColumnComponent,
    BreadcrumbBlogLeftSidebarComponent,
    BreadcrumbBlogRightSidebarComponent,
    BreadcrumbBlogDetailsLeftSidebarComponent,
    BreadcrumbBlogDetailsRightSidebarComponent,
    BreadcrumbReviewsComponent,
    FaqThreeComponent,
    BreadcrumbFaqComponent,
    BreadcrumbContactComponent,
    ReviewPageComponent,
    DownloadPageComponent,
    SubscribePageComponent,
    FaqPageComponent,
    ContactPageComponent,
    HeaderOneComponent,
    HeaderTwoComponent,
    MekFieldComponent,
    BillingInfoComponent,
    LoadingComponent,
    PrivacyPolicyComponent,
    TermsComponent,
    ModalComponent,
  ],
  schemas: [NO_ERRORS_SCHEMA],
  imports: [
    BrowserModule.withServerTransition({ appId: "serverApp" }),
    AppRoutingModule,
    AngularFireModule.initializeApp(environment.firebaseConfig),
    AngularFirestoreModule, // firestore
    AngularFireAuthModule, // auth
    AngularFireStorageModule, // storage
    AngularFireAnalyticsModule,
    AngularFireFunctionsModule,
    FormsModule,
    ReactiveFormsModule,
    NgxStripeModule.forRoot(environment.stripePublishableKey),
  ],
  providers: [AuthService, ContactService, SubscriptionService, AuthGuard],
  bootstrap: [AppComponent],
})
export class AppModule {}
