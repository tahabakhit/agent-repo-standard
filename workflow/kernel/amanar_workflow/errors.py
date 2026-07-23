"""Stable controller failures and process exit codes."""


class WorkflowError(Exception):
    exit_code = 10


class ContractError(WorkflowError):
    exit_code = 2


class AuthorityError(WorkflowError):
    exit_code = 3


class CheckError(WorkflowError):
    exit_code = 4


class EvidenceError(WorkflowError):
    exit_code = 5


class IncompleteError(WorkflowError):
    exit_code = 6
