export interface UserRole {
  id: number;
  name: string;
}

export interface User {
  userId: number;
  dni: string;
  name?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  secondSurname?: string | null;
  title: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  dateOfEntry: string;
  status: string;
  color: string;
  roles: UserRole[];
}

export interface UserRequest {
  dni: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  secondSurname?: string | null;
  email: string;
  password?: string | null;
  phone: string;
  dateOfBirth: string;
  dateOfEntry: string;
  status: string;
  title: string;
  roles: string[];
  color: string;
}