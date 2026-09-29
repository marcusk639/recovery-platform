import { Injectable } from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { CloudFunctionService } from '../functions/cloud-function.service';
import { TierCatalog } from 'src/app/entities/TierCatalog';

/**
 * Wraps the `getTierCatalog` callable. Caches the response in memory for the
 * life of the session (tab) — the catalog only changes on deploy, and this
 * avoids re-hitting the callable on every pricing/signup view. Cache is
 * cleared on error so a transient failure doesn't permanently poison the
 * session.
 */
@Injectable({
  providedIn: 'root',
})
export class TierCatalogService {
  private catalog$: Observable<TierCatalog> | null = null;

  constructor(private functions: CloudFunctionService) {}

  getCatalog(): Observable<TierCatalog> {
    if (!this.catalog$) {
      this.catalog$ = from(this.functions.getTierCatalog()).pipe(
        shareReplay(1),
        catchError((error) => {
          this.catalog$ = null;
          return throwError(error);
        }),
      );
    }
    return this.catalog$;
  }
}
