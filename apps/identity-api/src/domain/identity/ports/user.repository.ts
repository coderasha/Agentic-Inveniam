import type {
  CreateUserInput,
  PaginationQuery,
  UpdateUserInput,
  UserResponse,
  UserStatus,
} from '@gain/shared';

export interface UserListFilters extends PaginationQuery {
  status?: UserStatus;
  organizationId?: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<UserResponse>;
  findById(id: string, includeDeleted?: boolean): Promise<UserResponse | null>;
  findByEmail(email: string): Promise<UserResponse | null>;
  findByKeycloakSubjectId(subjectId: string): Promise<UserResponse | null>;
  list(filters: UserListFilters): Promise<{ items: UserResponse[]; total: number }>;
  update(id: string, input: UpdateUserInput): Promise<UserResponse>;
  softDelete(id: string, version: number): Promise<void>;
  markLogin(id: string): Promise<void>;
}
