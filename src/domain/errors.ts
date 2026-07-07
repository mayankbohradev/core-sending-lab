export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, details)
    this.name = 'ConflictError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'not_found', message)
    this.name = 'NotFoundError'
  }
}

