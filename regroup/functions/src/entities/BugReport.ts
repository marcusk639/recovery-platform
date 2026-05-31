import { BaseEntity } from "./BaseEntity";

export class BugReport extends BaseEntity {
  description: string = "";
  reporter: string = ""; // user id of the bug reporter
}
