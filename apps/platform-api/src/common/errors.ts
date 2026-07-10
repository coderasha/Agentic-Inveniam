export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
    readonly details?: Record<string, unknown>[],
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} '${id}' was not found` : `${resource} was not found`, 'NOT_FOUND', 404);
  }
}
export class ConflictError extends DomainError {
  constructor(message: string) { super(message, 'CONFLICT', 409); }
}
export class ForbiddenError extends DomainError {
  constructor(message = 'Insufficient permissions') { super(message, 'FORBIDDEN', 403); }
}
export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required') { super(message, 'UNAUTHORIZED', 401); }
}
export class ValidationError extends DomainError {
  constructor(message: string) { super(message, 'VALIDATION_ERROR', 422); }
}
