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
    // Server-side render (the `universal` Cloud Function in web/functions). A
    // guard cannot emit an HTTP redirect here: app.server.module.ts wires no
    // REQUEST/RESPONSE providers, so returning false only cancels the navigation
    // and the server ships an incomplete shell. Returning true lets the component
    // mount and redirect itself. This defers enforcement rather than performing
    // it — the SSR context has no Firebase session (persistence is browser-local),
    // so a guarded component finds no user and routes to /login on its own.
    return true;
  }
}
