import { Injectable } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export default class AppService {
  private appName = 'Regroup';

  constructor(private router: Router) { }

  get name() {
    return this.appName;
  }

  route(route: string) {
    return this.router.navigate([route]);
  }
}
