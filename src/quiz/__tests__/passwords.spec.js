/* passwords.spec.js
 Unit tests for the password helpers in src/quiz/passwords.js, used by
 sign-up and login. Only a salted scrypt hash is ever stored.
*/
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, normEmail } from '../passwords.js';

describe('TestSuite: normEmail', () => {
  it('Test1: trims spaces and lowercases the email', () => {
    expect(normEmail('  Student01@QuizQuest.Demo ')).toBe('student01@quizquest.demo');
  });

  it('Test2: anything that is not text becomes an empty string', () => {
    expect(normEmail(undefined)).toBe('');
    expect(normEmail(42)).toBe('');
  });
});

describe('TestSuite: hashPassword and verifyPassword', () => {
  const hash = hashPassword('correct horse');

  it('Test1: the stored hash is not the password itself', () => {
    expect(hash).toContain('scrypt$');
    expect(hash).not.toContain('correct horse');
  });

  it('Test2: the right password is accepted', () => {
    expect(verifyPassword('correct horse', hash)).toBeTruthy();
  });

  it('Test3: a wrong password is rejected', () => {
    expect(verifyPassword('wrong horse', hash)).toBeFalsy();
  });

  it('Test4: the same password hashed twice gives different hashes (salted)', () => {
    expect(hashPassword('correct horse')).not.toBe(hash);
  });

  it('Test5: a malformed stored hash is rejected', () => {
    expect(verifyPassword('correct horse', 'not-a-hash')).toBeFalsy();
  });
});
