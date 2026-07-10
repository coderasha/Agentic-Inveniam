export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number = 400,
    readonly details?: Record<string, unknown>[],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} '${id}' was not found` : `${resource} was not found`,
      'NOT_FOUND',
      404,
    );
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class OptimisticLockError extends DomainError {
  constructor(resource: string) {
    super(
      `${resource} was modified by another request. Refresh and retry.`,
      'OPTIMISTIC_LOCK',
      409,
    );
    this.name = 'OptimisticLockError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>[]) {
    super(message, 'VALIDATION_ERROR', 422, details);
    this.name = 'ValidationError';
  }
}
