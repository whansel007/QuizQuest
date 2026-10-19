/* AsyncButton.spec.js
 Component tests for AsyncButton.vue, the button used for actions that
 call the server (Approve & publish, Withdraw, Buy...).
 The component receives the action via the "run" prop and:
   1. Runs it when clicked
   2. Is disabled while the action runs, so it can't be sent twice
   3. Shows a failed action's message as a toast
*/
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import AsyncButton from '../AsyncButton.vue';
import { toastState } from '../../ui.js';

describe('AsyncButton', () => {
  // Verify that the button shows its label (the slot).
  it('shows its label', () => {
    const wrapper = mount(AsyncButton, {
      props: { run: async () => {} },
      slots: { default: 'Approve & publish' },
    });

    expect(wrapper.text()).toBe('Approve & publish');
  });

  // Verify that clicking runs the action once.
  it('runs the action when clicked', async () => {
    let runs = 0;
    const wrapper = mount(AsyncButton, { props: { run: async () => runs++ } });

    await wrapper.find('button').trigger('click');

    expect(runs).toBe(1);
  });

  // Verify that the button is disabled while the action is still running.
  it('is disabled while the action runs, then enabled again', async () => {
    let finish;
    const wrapper = mount(AsyncButton, { props: { run: () => new Promise((resolve) => (finish = resolve)) } });

    await wrapper.find('button').trigger('click');
    expect(wrapper.find('button').element.disabled).toBe(true);

    finish();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button').element.disabled).toBe(false);
  });

  // Verify that the disabled prop disables the button.
  it('can be disabled by its parent', () => {
    const wrapper = mount(AsyncButton, { props: { run: async () => {}, disabled: true } });

    expect(wrapper.find('button').element.disabled).toBe(true);
  });

  // Verify that a failed action shows its error message to the user.
  it('shows the error message when the action fails', async () => {
    const wrapper = mount(AsyncButton, {
      props: {
        run: async () => {
          throw new Error('Not enough coins.');
        },
      },
    });

    await wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    expect(toastState.msg).toBe('Not enough coins.');
    expect(toastState.bad).toBeTruthy();
  });
});
