import { Component, OnInit } from '@angular/core';
import { BaseComponent } from '../base.component';
import { ContactService } from 'src/app/services/contact/contact.service';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent extends BaseComponent implements OnInit {
  formGroup: FormGroup;
  showMessage: boolean = false;

  constructor(private contactService: ContactService) {
    super();
  }

  ngOnInit(): void {
    this.formGroup = this.contactService.buildForm();
    this.formGroup.valueChanges.subscribe(() => {
      if (this.showMessage) {
        this.showMessage = false;
      }
    });
  }

  get valid() {
    return this.formGroup.valid;
  }

  async submit() {
    if (this.formGroup.valid) {
      await this.contactService.create(this.formGroup.value);
      this.formGroup.reset({ name: '', email: '', message: '', subject: '' }, { emitEvent: false });
      this.showMessage = true;
    }
  }
}
