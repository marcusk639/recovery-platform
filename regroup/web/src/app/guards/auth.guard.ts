import { Injectable, Inject, PLATFORM_ID } from "@angular/core";
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from "@angular/router";
import { Router } from "@angular/router";
import { AuthService } from "../services/auth/auth-service.service";
import { Observable } from "rxjs";
import { isPlatformBrowser } from "@angular/common";
@Injectable({
  providedIn: "root",
})
export class AuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private myRoute: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}
  canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Observable<boolean> | Promise<boolean> | boolean {
    if (isPlatformBrowser(this.platformId)) {
      if (this.auth.user) {
        return true;
      } else {
        return this.auth
          .doAutoLogin()
          .then(() => true)
          .catch(() => {
            this.myRoute.navigate(["login"]);
            return false;
          });
      }
    }
    // Server-side render: allow the route through and let the browser enforce.
    // Returning false here makes Angular Universal refuse to render the page at
    // all rather than redirect, so an unauthenticated request gets a blank
    // prerender instead of being sent to /login. The guard runs again on the
    // client once it bootstraps, which is where the redirect actually happens.
    return true;
  }
}
