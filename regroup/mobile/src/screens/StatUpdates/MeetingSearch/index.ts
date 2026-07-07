/**
 * MeetingSearch barrel export
 * Phase 4.1: Component refactoring
 */
export { default } from "../MeetingSearch";
export { useMeetingSearch } from "./useMeetingSearch";
// MEETING_DESCRIPTION_TEXT is a runtime const (a TextStyle object), not a
// type — bundling it into `export type {...}` silently erased it at
// runtime (Babel/TS strip `export type` entirely), a landmine for the next
// consumer even though nothing currently imports it via this barrel.
export type { WeekDay } from "./types";
export { MEETING_DESCRIPTION_TEXT } from "./types";
