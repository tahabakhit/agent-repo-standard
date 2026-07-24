/**
 * Stable controller failures and process exit codes.
 * Mirrors amanar_workflow/errors.py exactly.
 */

export class WorkflowError extends Error {
  readonly exitCode: number = 10;
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export class ContractError extends WorkflowError {
  readonly exitCode: number = 2;
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

export class AuthorityError extends WorkflowError {
  readonly exitCode: number = 3;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorityError';
  }
}

export class CheckError extends WorkflowError {
  readonly exitCode: number = 4;
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}

export class EvidenceError extends WorkflowError {
  readonly exitCode: number = 5;
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export class IncompleteError extends WorkflowError {
  readonly exitCode: number = 6;
  constructor(message: string) {
    super(message);
    this.name = 'IncompleteError';
  }
}
