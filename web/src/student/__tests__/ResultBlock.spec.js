/* ResultBlock.spec.js
 Component tests for ResultBlock.vue, the feedback block a student sees
 after answering a question (Practice and World).
 The component receives the server's result via the "r" prop and:
   1. Computes a title (Correct! / Not quite. / Time is up. / Partly right ...)
   2. Shows the explanation, sources and coins earned
   3. Shows a "provisional" note only for marks a professor may still review
*/
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ResultBlock from '../ResultBlock.vue';

describe('ResultBlock', () => {
  // Verify that a correct answer shows "Correct!" and the explanation.
  it('shows Correct! and the explanation for a right answer', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: true, explanation: 'Phishing tricks people with fake messages.' },
      },
    });

    expect(wrapper.text()).toContain('Correct!');
    expect(wrapper.text()).toContain('Phishing tricks people with fake messages.');
  });

  // Verify that the "correct" title can be changed by the parent.
  it('uses the correctText prop when given', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: true, explanation: '' },
        correctText: 'Resource gathered!',
      },
    });

    expect(wrapper.text()).toContain('Resource gathered!');
    expect(wrapper.text()).not.toContain('Correct!');
  });

  // Verify that a wrong answer shows "Not quite."
  it('shows Not quite. for a wrong answer', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: false, explanation: 'The answer was B.' },
      },
    });

    expect(wrapper.text()).toContain('Not quite.');
  });

  // Verify that running out of time is reported as such.
  it('shows Time is up. when the timer ran out', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: false, timedOut: true, explanation: '' },
      },
    });

    expect(wrapper.text()).toContain('Time is up.');
  });

  // Verify that a partly right multi-select answer shows the percentage.
  it('shows the partial score for a partly right answer', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: false, reveal: { partial: 0.5 }, explanation: '' },
      },
    });

    expect(wrapper.text()).toContain('Partly right (50%).');
  });

  // Verify that the provisional note appears only when the mark is provisional.
  it('shows the provisional note only for provisional marks', () => {
    const provisional = mount(ResultBlock, {
      props: { r: { correct: true, provisional: true, explanation: '' } },
    });
    const final = mount(ResultBlock, {
      props: { r: { correct: true, explanation: '' } },
    });

    expect(provisional.text()).toContain('your professor may review it');
    expect(final.text()).not.toContain('your professor may review it');
  });

  // Verify that the coins earned are listed.
  it('lists the coins earned', () => {
    const wrapper = mount(ResultBlock, {
      props: {
        r: { correct: true, explanation: '', rewards: [{ granted: 5, reason: 'Correct answer' }] },
      },
    });

    expect(wrapper.text()).toContain('+5 🪙 Correct answer');
  });
});
