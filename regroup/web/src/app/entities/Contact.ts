import { BaseEntity } from "./BaseEntity";

export class Contact extends BaseEntity {
  message: string;
  subject: string;
  name: string;
  email: string;
}