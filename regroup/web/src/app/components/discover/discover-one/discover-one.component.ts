import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';

@Component({
  selector: 'app-discover-one',
  templateUrl: './discover-one.component.html',
  styleUrls: ['./discover-one.component.css']
})
export class DiscoverOneComponent extends BaseComponent implements OnInit {

  constructor() {
    super();
  }

  ngOnInit(): void {
  }

}
