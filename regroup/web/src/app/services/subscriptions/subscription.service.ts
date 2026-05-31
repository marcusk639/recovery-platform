import { Injectable } from "@angular/core";
import BaseFirestoreService from "../base-service";
import { AngularFirestore } from "@angular/fire/firestore";
import { FormBuilder, FormControl, Validators } from "@angular/forms";
import { firestore } from "firebase/app";

@Injectable({
  providedIn: "root",
})
export class SubscriptionService extends BaseFirestoreService<any> {
  housePrice: number = 10;
  residentPrice: number = 1;

  constructor(
    protected firestore: AngularFirestore,
    protected formBuilder: FormBuilder
  ) {
    super(firestore, "subscriptions");
  }

  buildForm() {
    return this.formBuilder.group({
      email: new FormControl("", [Validators.required, Validators.email]),
    });
  }

  pushEmail(email: string) {
    return this.collection
      .doc("emails")
      .update({ emails: firestore.FieldValue.arrayUnion(email) });
  }
}
