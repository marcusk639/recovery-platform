import { Component, OnInit } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-pricing-one',
  templateUrl: './pricing-one.component.html',
  styleUrls: ['./pricing-one.component.css']
})
export class PricingOneComponent extends BaseComponent implements OnInit {
  logoFilePath: string;

  logoFileName: string;

  constructor() {
    super();
  }

  ngOnInit(): void {
    this.logoFilePath = `assets/img/${this.logoFileName || 'logo'}.png`;
  }
}
