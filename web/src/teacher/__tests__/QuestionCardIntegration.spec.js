/* QuestionCardIntegration.spec.js
 Integration tests for the question bank card: QuestionCard.vue together
 with its real children QuestionDetails.vue, RichText.vue and AsyncButton.vue.

 Unlike the component tests, the child components are not stubbed: the
 real ones are mounted and exercised as a group. The one exception is
 QuestionEditor (a large form with its own server calls), which is replaced
 by a small stub because these tests are about the card, not the editor.

 The tests verify:
   1. QuestionCard passes the question to QuestionDetails, which shows the
      question text, the options and marks the correct one.
   2. The actions offered match the question's status
      (draft -> Approve & publish / Reject, published -> Withdraw,
       withdrawn -> Publish again).
   3. Open student reports are shown; resolved ones are not.
   4. Clicking Edit opens the editor.
*/
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import QuestionCard from '../QuestionCard.vue';

const course = { id: 'c-1', topics: [{ id: 't-sec', name: 'Cybersecurity', week: 3 }], authoringEnabled: false };

// A multiple-choice question as the server sends it to the question bank page.
function question(status, changes = {}) {
  return {
    id: 'q-1',
    status,
    topicId: 't-sec',
    typeLabel: 'MCQ',
    generationId: null,
    publishedVersion: status === 'draft' ? null : 1,
    latest: {
      v: 1,
      type: 'mcq',
      stem: 'Which attack tricks people into revealing their passwords?',
      options: ['Phishing', 'Ransomware', 'Denial of service'],
      answerIndex: 0,
      explanation: 'Phishing uses deceptive messages.',
      difficulty: 'easy',
      sourceIds: [],
      warnings: [],
    },
    versions: [{ v: 1, attempts: 0 }],
    sources: [],
    reports: [],
    sample: null,
    ...changes,
  };
}

// Mount the card with the real children; only the editor is a stub.
function mountCard(q) {
  return mount(QuestionCard, {
    props: { q, course, passages: [] },
    global: {
      stubs: {
        QuestionEditor: { template: '<div>Editing this question</div>' },
      },
    },
  });
}

// The labels of the buttons on the card
const buttons = (wrapper) => wrapper.findAll('button').map((b) => b.text());

describe('QuestionCard Integration', () => {
  // Verify that the question, its options and the correct answer are displayed.
  it('shows the question, its options and which one is correct', () => {
    const wrapper = mountCard(question('draft'));

    expect(wrapper.text()).toContain('Which attack tricks people into revealing their passwords?');
    expect(wrapper.text()).toContain('Ransomware');
    expect(wrapper.text()).toContain('Week 3 · Cybersecurity');
    // exactly one option is marked correct, and it is Phishing
    const marked = wrapper.findAll('li').filter((li) => li.text().includes('✓ Correct'));
    expect(marked).toHaveLength(1);
    expect(marked[0].text()).toContain('Phishing');
  });

  // Verify that a draft can be approved or rejected, but not withdrawn.
  it('offers Approve & publish and Reject for a draft', () => {
    const wrapper = mountCard(question('draft'));

    expect(buttons(wrapper)).toContain('Approve & publish');
    expect(buttons(wrapper)).toContain('Reject');
    expect(buttons(wrapper)).not.toContain('Withdraw');
  });

  // Verify that a published question can only be withdrawn.
  it('offers Withdraw for a published question', () => {
    const wrapper = mountCard(question('published'));

    expect(buttons(wrapper)).toContain('Withdraw');
    expect(buttons(wrapper)).not.toContain('Approve & publish');
    expect(buttons(wrapper)).not.toContain('Reject');
  });

  // Verify that a withdrawn question can be published again.
  it('offers Publish again for a withdrawn question', () => {
    const wrapper = mountCard(question('withdrawn'));

    expect(buttons(wrapper)).toContain('Publish again');
    expect(buttons(wrapper)).not.toContain('Withdraw');
  });

  // Verify that an edited published question shows which version is live.
  it('shows the live version when the latest edit is not published yet', () => {
    const q = question('published', { publishedVersion: 1 });
    q.latest = { ...q.latest, v: 2 };
    const wrapper = mountCard(q);

    expect(wrapper.text()).toContain('v2 (live: v1)');
  });

  // Verify that open student reports are shown and resolved ones are hidden.
  it('shows open student reports only', () => {
    const wrapper = mountCard(question('published', {
      reports: [
        { id: 'r-1', reason: 'Option C is also correct', resolved: false },
        { id: 'r-2', reason: 'Typo in the question', resolved: true },
      ],
    }));

    expect(wrapper.text()).toContain('Option C is also correct');
    expect(wrapper.text()).not.toContain('Typo in the question');
    expect(buttons(wrapper)).toContain('Mark resolved');
  });

  // Verify that clicking Edit opens the editor under the card.
  it('opens the editor when Edit is clicked', async () => {
    const wrapper = mountCard(question('draft'));
    expect(wrapper.text()).not.toContain('Editing this question');

    const edit = wrapper.findAll('button').filter((b) => b.text() === 'Edit')[0];
    await edit.trigger('click');

    expect(wrapper.text()).toContain('Editing this question');
  });
});
