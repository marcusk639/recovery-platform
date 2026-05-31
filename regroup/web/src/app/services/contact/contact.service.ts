import { Injectable } from '@angular/core';
import BaseFirestoreService from '../base-service';
import { Contact } from 'src/app/entities/Contact';
import { AngularFirestore } from '@angular/fire/firestore';
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';

@Injectable({
  providedIn: 'root'
})
export class ContactService extends BaseFirestoreService<Contact> {

  constructor(protected firestore: AngularFirestore, protected formBuilder: FormBuilder) {
    super(firestore, 'contact');
  }

  buildForm() {
    return this.formBuilder.group({
      name: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.email, Validators.required]),
      message: new FormControl('', [Validators.required]),
      subject: new FormControl('', [Validators.required])
    });
  }
}
