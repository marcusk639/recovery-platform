import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-welcome-one',
  templateUrl: './welcome-one.component.html',
  styleUrls: ['./welcome-one.component.css']
})
export class WelcomeOneComponent extends BaseComponent implements OnInit {

  constructor() {
    super();
  }

  ngOnInit(): void {
  }
}
