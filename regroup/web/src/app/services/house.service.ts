import { Injectable } from '@angular/core';
import BaseFirestoreService from './base-service';
import { House } from '../entities/House';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class HouseService extends BaseFirestoreService<House> {
  constructor(protected firestore: AngularFirestore) {
    super(firestore, 'houses');
  }

  async getHouses(houseIds: string[]) {
    const results = [];
    houseIds.forEach((houseId) => {
      const result = this.get(houseId);
      results.push(result);
    });
    const _houses = await Promise.all(results);
    const houses = {};
    _houses.forEach((house) => {
      houses[house.id] = house;
    });
    return houses as Record<string, House>;
  }
}
