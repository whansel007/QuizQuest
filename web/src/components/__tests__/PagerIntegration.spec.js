/* PagerIntegration.spec.js
 Integration tests for paging a long list: usePaged() from paged.js working
 together with the real Pager.vue, the way the professor dashboard uses them:
   const missed = usePaged(() => list, 5)
   v-for="q in missed.items"   <Pager :paged="missed" label="..." />

 The Pager component test used a hand-made "paged" object. Here the real
 usePaged state is passed in, so clicking Pager's buttons must really
 change which items the list shows.
*/
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { usePaged } from '../paged.js';
import Pager from '../Pager.vue';

// A small list page like the dashboard's: 12 questions, 5 per page.
const QuestionList = {
  components: { Pager },
  setup() {
    const questions = Array.from({ length: 12 }, (_, i) => `Question ${i + 1}`);
    return { paged: usePaged(() => questions, 5) };
  },
  template: `
    <ul><li v-for="q in paged.items" :key="q">{{ q }}</li></ul>
    <Pager :paged="paged" label="Question pages" noun="questions" />
  `,
};

const shown = (wrapper) => wrapper.findAll('li').map((li) => li.text());

describe('Pager + usePaged Integration', () => {
  // Verify that the first page shows the first 5 questions.
  it('starts on page 1 with the first 5 questions', () => {
    const wrapper = mount(QuestionList);

    expect(shown(wrapper)).toEqual(['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5']);
    expect(wrapper.text()).toContain('Showing 1–5 of 12 questions');
  });

  // Verify that clicking Next shows the next 5 questions.
  it('shows the next 5 questions when Next is clicked', async () => {
    const wrapper = mount(QuestionList);

    await wrapper.find('[aria-label="Next page"]').trigger('click');

    expect(shown(wrapper)).toHaveLength(5);
    expect(shown(wrapper)[0]).toBe('Question 6');
    expect(wrapper.text()).toContain('Showing 6–10 of 12 questions');
  });

  // Verify that the last page holds the 2 remaining questions and Next is disabled.
  it('shows the remaining 2 questions on the last page', async () => {
    const wrapper = mount(QuestionList);

    await wrapper.find('[aria-label="Page 3"]').trigger('click');

    expect(shown(wrapper)).toEqual(['Question 11', 'Question 12']);
    expect(wrapper.find('[aria-label="Next page"]').element.disabled).toBe(true);
  });
});
