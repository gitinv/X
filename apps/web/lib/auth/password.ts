import bcrypt from "bcryptjs";

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 8);
}
