import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../base.component';
import { SubscriptionService } from 'src/app/services/subscriptions/subscription.service';
import { FormGroup } from '@angular/forms';
import { ThemeSixComponent } from 'src/app/themes/theme-six/theme-six.component';

@Component({
  selector: 'app-subscribe',
  templateUrl: './subscribe.component.html',
  styleUrls: ['./subscribe.component.css']
})
export class SubscribeComponent extends BaseComponent implements OnInit {
  formGroup: FormGroup;
  showMessage: boolean = false;

  constructor(private subscriptionService: SubscriptionService) {
    super();
  }

  get valid() {
    return this.formGroup && this.formGroup.valid;
  }

  ngOnInit(): void {
    this.formGroup = this.subscriptionService.buildForm();
    this.formGroup.valueChanges.subscribe(() => {
      if (this.showMessage) {
        this.showMessage = false;
      }
    });
  }

  async submit() {
    if (this.formGroup) {
      await this.subscriptionService.pushEmail(this.formGroup.get('email').value)
      this.showMessage = true;
    }
  }
}
