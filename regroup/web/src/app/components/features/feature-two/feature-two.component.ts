import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-feature-two',
  templateUrl: './feature-two.component.html',
  styleUrls: ['./feature-two.component.css']
})
export class FeatureTwoComponent extends BaseComponent implements OnInit {

  constructor() {
    super();
  }

  ngOnInit(): void {
  }

}
