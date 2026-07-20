"""Engine-specific errors.

`EngineError` is the root of every chapter-specific error.
`ContractViolation` is thrown when a runtime check on the contracts
fails.
"""
from __future__ import annotations


class EngineError(Exception):
    """A logical error inside the engine — recoverable, must be surfaced."""


class ContractViolation(EngineError, AssertionError):
    """A test-only violation of the shared contracts in `_contracts/`."""


class UnsupportedFeature(EngineError):
    """The operation is recognised but not implemented in this curriculum."""


class TransactionError(EngineError):
    """A transaction was asked to commit while in a state that disallows it."""


__all__ = [
    "EngineError",
    "ContractViolation",
    "UnsupportedFeature",
    "TransactionError",
]
