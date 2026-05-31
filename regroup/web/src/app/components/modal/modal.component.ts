import { Component, OnInit } from '@angular/core';
import { ModalService } from 'src/app/services/modal.service';

@Component({
  selector: 'modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.css'],
})
export class ModalComponent implements OnInit {
  constructor(private modalService: ModalService) {}

  ngOnInit(): void {}

  get modalTemplate() {
    return this.modalService.template;
  }

  get loading() {
    return this.modalService.loading;
  }

  onConfirm() {
    this.modalService.onConfirm();
  }

  onCancel() {
    this.modalService.onCancel();
  }

  get title() {
    return this.modalService.title;
  }

  get confirmTxt() {
    return this.modalService.confirmTxt || 'Save changes';
  }

  get cancelTxt() {
    return this.modalService.cancelTxt || 'Cancel';
  }

  get disable() {
    return this.modalService.disableConfirm;
  }
}
