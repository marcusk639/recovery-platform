import { Injectable, TemplateRef } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ModalService {
  public template: TemplateRef<any>;
  public onConfirm: () => any = () => null;
  public onCancel: () => any = () => null;
  public title: string = 'Modal Title';
  public confirmTxt: string = 'Save changes';
  public cancelTxt: string = 'Cancel';
  public loading: boolean = false;
  public disableConfirm: boolean = false;

  constructor() {}
}
