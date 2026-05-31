import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-welcome-two',
  templateUrl: './welcome-two.component.html',
  styleUrls: ['./welcome-two.component.css']
})
export class WelcomeTwoComponent extends BaseComponent implements OnInit {

  constructor() {
    super();
  }

  ngOnInit(): void {
  }

}
