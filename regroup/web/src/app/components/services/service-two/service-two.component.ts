import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-service-two',
  templateUrl: './service-two.component.html',
  styleUrls: ['./service-two.component.css']
})
export class ServiceTwoComponent extends BaseComponent implements OnInit {

  constructor() {
    super();
  }

  ngOnInit(): void {
  }

}
