import { BaseEntity } from '../entities/BaseEntity';
import { AngularFirestoreCollection, AngularFirestore } from '@angular/fire/firestore/public_api';
import { User } from '../entities/User';
import { firestore } from 'firebase/app';

export default class BaseFirestoreService<T extends BaseEntity> {
  collection: AngularFirestoreCollection<T>;
  _user: User;

  constructor(protected firestore: AngularFirestore, protected collectionName: string) {
    this.collection = firestore.collection(collectionName);
  }

  get user() {
    return this._user;
  }

  set user(user: User) {
    this._user = user;
  }

  createId() {
    return this.firestore.createId();
  }

  async get(id: string) {
    const doc = await this.collection.doc(id).get().toPromise();
    return doc.data() as T;
  }

  async getByAttribute(attribute: string, operator: firestore.WhereFilterOp, value: any) {
    const result = await this.collection.ref.where(attribute, operator, value).get();
    return result.docs.length ? result.docs.map((doc) => doc.data() as T) : [];
  }

  async update(id: string, object: Partial<T>) {
    return this.collection.doc(id).update(object);
  }

  async delete(id: string) {
    return this.collection.doc(id).delete();
  }

  async create(object: T, _id?: string) {
    const id = _id ? _id : this.createId();
    return this.collection.doc(id).set(object);
  }

  async add(object: T) {
    return this.collection.add(object);
  }
}
