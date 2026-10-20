import type { SelectionFailureDiagnostic } from "../usage/types";

// Do not retain the cause, response body, request, headers or SDK message.
export class SelectionFailure extends Error {
  constructor(public diagnostic: SelectionFailureDiagnostic) {
    super("SELECTION_FAILED");
  }
}
