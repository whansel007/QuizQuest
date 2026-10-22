/* validate.spec.js
 Unit tests for validateQuestion() in src/quiz/validate.js.
 Every question in the question bank (manual or AI-drafted) passes through
 this function before it is saved. It returns { q, errors, warnings }:
 errors block saving, warnings are only shown to the professor.
*/
import { describe, it, expect } from 'vitest';
import { validateQuestion, similarity } from '../validate.js';

// A complete, valid multiple-choice question. Each test changes one field.
const goodMcq = {
  type: 'mcq',
  stem: 'Which attack tricks people into revealing their passwords?',
  options: ['Phishing', 'Ransomware', 'Denial of service', 'Brute force'],
  answerIndex: 0,
  explanation: 'Phishing uses deceptive messages to trick people into giving away details.',
  difficulty: 'easy',
  sourceIds: ['p-sec-1'],
};

describe('TestSuite: validateQuestion', () => {
  it('Test1: accepts a complete multiple-choice question', () => {
    const result = validateQuestion(goodMcq);
    expect(result.errors).toHaveLength(0);
    expect(result.q.difficulty).toBe('easy');
  });

  it('Test2: rejects question text that is too short', () => {
    const result = validateQuestion({ ...goodMcq, stem: 'Why?' });
    expect(result.errors).toContain('Question text is missing or too short.');
  });

  it('Test3: requires an explanation', () => {
    const result = validateQuestion({ ...goodMcq, explanation: '' });
    expect(result.errors).toContain('An explanation is required.');
  });

  it('Test4: only accepts easy, medium or hard as the difficulty', () => {
    expect(validateQuestion({ ...goodMcq, difficulty: 'extreme' }).errors).toContain('Difficulty must be easy, medium or hard.');
    // capital letters are tidied up rather than rejected
    expect(validateQuestion({ ...goodMcq, difficulty: 'Hard' }).errors).toHaveLength(0);
  });

  it('Test5: needs between 3 and 5 options', () => {
    const twoOptions = { ...goodMcq, options: ['Phishing', 'Ransomware'] };
    expect(validateQuestion(twoOptions).errors).toContain('Needs between 3 and 5 options.');
  });

  it('Test6: the correct answer must point at one of the options', () => {
    const result = validateQuestion({ ...goodMcq, answerIndex: 9 });
    expect(result.errors).toContain('Correct answer must point at one of the options.');
  });

  it('Test7: rejects two options with the same text', () => {
    const result = validateQuestion({ ...goodMcq, options: ['Phishing', 'phishing', 'Ransomware'] });
    expect(result.errors).toContain('Duplicate option: "phishing".');
  });

  it('Test8: must cite a source passage unless the source is optional', () => {
    const noSource = { ...goodMcq, sourceIds: [] };
    expect(validateQuestion(noSource).errors).toContain('Must cite at least one source passage.');
    // manual questions only get a warning
    const manual = validateQuestion(noSource, { requireSource: false });
    expect(manual.errors).toHaveLength(0);
    expect(manual.warnings).toContain('No source passage cited.');
  });

  it('Test9: flags a near-duplicate of a question already in the bank', () => {
    const existingStems = [{ id: 'q-1', stem: 'Which attack tricks people into revealing their passwords?' }];
    const errors = validateQuestion(goodMcq, { existingStems }).errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Looks like a duplicate');
    // ...but not when that existing question is the one being edited
    expect(validateQuestion(goodMcq, { existingStems, ignoreId: 'q-1' }).errors).toHaveLength(0);
  });
});

describe('TestSuite: similarity', () => {
  it('Test1: identical text scores 1, unrelated text scores 0', () => {
    expect(similarity('What is phishing?', 'what is PHISHING')).toBe(1);
    expect(similarity('phishing email', 'binary search')).toBe(0);
  });

  it('Test2: empty text is never similar', () => {
    expect(similarity('', 'phishing')).toBe(0);
  });
});
