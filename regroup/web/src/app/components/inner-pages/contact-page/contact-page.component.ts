import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../../base.component';
import { ContactComponent } from '../../contact/contact.component';
import { ContactService } from 'src/app/services/contact/contact.service';

@Component({
  selector: 'app-contact-page',
  templateUrl: './contact-page.component.html',
  styleUrls: ['./contact-page.component.css']
})
export class ContactPageComponent extends ContactComponent implements OnInit {

  constructor(contactService: ContactService) {
    super(contactService);
  }

  ngOnInit(): void {
    super.ngOnInit();
  }

}
