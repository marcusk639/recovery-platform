import { Injectable } from '@angular/core';
import BaseFirestoreService from './base-service';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class BetaService extends BaseFirestoreService<any> {
  emails: string[];

  constructor(protected firestore: AngularFirestore) {
    super(firestore, 'beta-users');
  }

  async getEmails(): Promise<string[]> {
    const doc = await this.get('users');
    this.emails = doc.emails;
    return this.emails;
  }

  emailIsValid = (email: string) => {
    return this.emails.includes(email);
  }
}
