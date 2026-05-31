export function hasLowerCase(str: string): boolean {
  return /[a-z]/.test(str);
}

export function hasUpperCase(str: string): boolean {
  return /[A-Z]/.test(str);
}

function hasNumber(myString: string): boolean {
  return /\d/.test(myString);
}

export function checkPasswordReqs(password: string, errors: any): void {
  if (!password) {
    errors.passLength = true;
  }
  if (password.length < 8) {
    errors.characters = true;
  }
  if (!hasUpperCase(password)) {
    errors.uppercase = true;
  }
  if (!hasLowerCase(password)) {
    errors.lowercase = true;
  }
  if (!hasNumber(password)) {
    errors.number = true;
  }
}
