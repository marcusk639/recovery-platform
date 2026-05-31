import AppService from '../services/app-service/app.service';
import { Subscription } from 'rxjs';
import { OnInit, OnDestroy } from '@angular/core';

export class BaseComponent implements OnInit, OnDestroy {
  appName: string = 'Regroup';
  subscriptions: Subscription[] = [];

  ngOnDestroy() {
    if (this.subscriptions && this.subscriptions.length) {
      this.subscriptions.forEach((sub) => {
        sub.unsubscribe();
      });
    }
  }

  ngOnInit() {
    this.subscriptions = [];
  }
}
