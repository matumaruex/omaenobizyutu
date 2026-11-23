import type {
  SelectionFailureDiagnostic,
  ValidationIssue,
} from "../usage/types";

// Do not retain the cause, response body, request, headers or SDK message.
export class SelectionFailure extends Error {
  constructor(public diagnostic: SelectionFailureDiagnostic) {
    super("SELECTION_FAILED");
  }
}

// An allowlisted condition only: never retain model text or a Zod error payload.
export class OutputValidationError extends Error {
  constructor(public issue: ValidationIssue) {
    super("INVALID_SELECTION");
  }
}
