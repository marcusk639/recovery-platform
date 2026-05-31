import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  constructor() {}

  setItem(key: string, value: any) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(error);
    }
  }

  get<T>(key: string) {
    try {
      const item = localStorage.getItem(key);
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(error);
    }
  }
}
