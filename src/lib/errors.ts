/**
 * Application error hierarchy.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} ${id} not found` : `${resource} not found`,
      "NOT_FOUND",
      404,
    );
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ShopifyApiError extends AppError {
  constructor(message: string, public readonly shopifyErrors?: unknown) {
    super(message, "SHOPIFY_API_ERROR", 502);
    this.name = "ShopifyApiError";
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string) {
    super(`${provider}: ${message}`, "PROVIDER_ERROR", 502);
    this.name = "ProviderError";
  }
}
