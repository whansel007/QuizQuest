/* Pager.spec.js
 Component tests for Pager.vue, the page controls under long lists on the
 professor dashboard ("Showing 11–20 of 34", Prev, page numbers, Next).
 The component receives the list's paging state via the "paged" prop and:
   1. Hides itself when everything fits on one page
   2. Shows which items are on screen
   3. Asks the list to change page (paged.go) when a button is clicked
 In this component test, "paged" is a plain object we build ourselves,
 so Pager is tested on its own (usePaged is covered by the integration test).
*/
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Pager from '../Pager.vue';

// Paging state for page `page` of `pages`; every page change is recorded in `asked`.
function pagedState(page, pages) {
  const asked = [];
  return { page, pages, from: (page - 1) * 10 + 1, to: page * 10, total: pages * 10, go: (p) => asked.push(p), asked };
}

describe('Pager', () => {
  // Verify that nothing is shown when the list fits on one page.
  it('is hidden when there is only one page', () => {
    const wrapper = mount(Pager, { props: { paged: pagedState(1, 1), label: 'Questions pages' } });

    expect(wrapper.find('nav').exists()).toBe(false);
  });

  // Verify the "Showing x–y of z" summary, using the noun prop.
  it('shows which items are on screen', () => {
    const wrapper = mount(Pager, { props: { paged: pagedState(2, 4), label: 'Questions pages', noun: 'questions' } });

    expect(wrapper.text()).toContain('Showing 11–20 of 40 questions');
  });

  // Verify that Previous cannot be used on the first page, and Next on the last.
  it('disables Previous on the first page and Next on the last page', () => {
    const first = mount(Pager, { props: { paged: pagedState(1, 3), label: 'Pages' } });
    const last = mount(Pager, { props: { paged: pagedState(3, 3), label: 'Pages' } });

    expect(first.find('[aria-label="Previous page"]').element.disabled).toBe(true);
    expect(first.find('[aria-label="Next page"]').element.disabled).toBe(false);
    expect(last.find('[aria-label="Next page"]').element.disabled).toBe(true);
  });

  // Verify that clicking Next, Previous and a page number asks for the right page.
  it('asks for the right page when a button is clicked', async () => {
    const paged = pagedState(2, 4);
    const wrapper = mount(Pager, { props: { paged, label: 'Pages' } });

    await wrapper.find('[aria-label="Next page"]').trigger('click');
    await wrapper.find('[aria-label="Previous page"]').trigger('click');
    await wrapper.find('[aria-label="Page 4"]').trigger('click');

    expect(paged.asked).toEqual([3, 1, 4]);
  });

  // Verify that a long run of pages collapses to 1 … 5 6 7 … 12.
  it('collapses a long run of page numbers', () => {
    const wrapper = mount(Pager, { props: { paged: pagedState(6, 12), label: 'Pages' } });
    const numbers = wrapper.findAll('[aria-label^="Page "]').map((b) => b.text());

    expect(numbers).toEqual(['1', '5', '6', '7', '12']);
    expect(wrapper.text()).toContain('…');
  });
});
