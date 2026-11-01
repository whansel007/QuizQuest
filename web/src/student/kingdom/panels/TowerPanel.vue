<script setup>
import { toRefs } from 'vue';


const props = defineProps({ context: { type: Object, required: true } });
const { homeData, S, radioState, radioBusy, tuneRadio, radioStatusText, tradeFilter, tradePage, tradeError, tradeBoard, fmtBundle, R, towerTrades, TRADE_PAGE_SIZE, cancelTrade, tradePending, tradeConfirm, filteredTowerTrades, tradePageCount, tradeConfirmPreview, acceptTrade, tradeLoading, tradeGive, tradeWant, tradePost, setTradeAmount, tradeCreateConfirm, tradeBundleHasItems, reviewTrade, createTrade } = toRefs(props.context);
</script>

<template>
              <div class="tower-feature">
                <section class="tower-board" aria-label="Class exchange request board">
                  <div class="tower-board-heading">
                    <div class="board-sign"><span class="scene-kicker">Class channel · {{ homeData?.classes?.find((c) => c.id === S.classId)?.name || 'Selected class' }}</span><h3>Exchange noticeboard</h3></div>
                    <div class="radio-station" :class="`radio-${radioState}`">
                      <svg class="radio-set" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
                        <path class="radio-antenna" d="M86 30 104 4" stroke="#23382f" stroke-width="3" stroke-linecap="round" /><circle class="radio-antenna" cx="104" cy="4" r="3.5" fill="#d86f6b" stroke="#23382f" stroke-width="1.5" />
                        <g class="radio-waves" fill="none" stroke="#fff3d0" stroke-width="2.5" stroke-linecap="round"><path d="M110 12a10 10 0 0 0-4-10" /><path d="M116 16a17 17 0 0 0-7-17" /></g>
                        <rect x="6" y="28" width="108" height="52" rx="9" fill="#c99c67" stroke="#23382f" stroke-width="3" />
                        <rect x="14" y="36" width="44" height="36" rx="5" fill="#7a5534" stroke="#23382f" stroke-width="2" />
                        <path d="M19 44h34M19 51h34M19 58h34M19 65h34" stroke="#4a3324" stroke-width="2.5" stroke-linecap="round" />
                        <rect x="64" y="36" width="42" height="16" rx="3" fill="#fff3d0" stroke="#23382f" stroke-width="2" />
                        <path d="M68 44h34" stroke="#a8774a" stroke-width="1.5" stroke-dasharray="2 3" />
                        <path class="radio-needle" d="M76 38v12" stroke="#c4574f" stroke-width="2.5" stroke-linecap="round" />
                        <circle cx="74" cy="64" r="7" fill="#e8c57c" stroke="#23382f" stroke-width="2" /><path class="radio-knob" d="M74 64v-6" stroke="#23382f" stroke-width="2" stroke-linecap="round" />
                        <circle cx="96" cy="64" r="7" fill="#e8c57c" stroke="#23382f" stroke-width="2" />
                        <circle class="radio-lamp" cx="96" cy="64" r="3" fill="#7fae58" />
                      </svg>
                      <button class="radio-tune" type="button" :disabled="radioBusy" :aria-busy="radioBusy" @click="tuneRadio">
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M15.5 6.5A6.5 6.5 0 1 0 16.4 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /><path d="M16.8 2.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                        {{ radioBusy ? 'Tuning…' : 'Tune in for new notes' }}
                      </button>
                      <span class="radio-status" role="status">{{ radioStatusText }}</span>
                    </div>
                  </div>
                  <div class="tower-filter-row"><span class="board-hint">Pinned requests from your classmates</span><label>Show <select v-model="tradeFilter" @change="tradePage = 0"><option value="all">All open notes</option><option value="mine">My notes</option></select></label></div>
                  <p v-if="tradeError" class="trade-error" role="alert">The radio caught only static: {{ tradeError }} <button class="text-button" type="button" :disabled="radioBusy" @click="tuneRadio">Try again</button></p>
                  <div v-if="tradeBoard" class="pinned-notes">
                    <article class="info-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>Board rules</h4>
                      <p v-if="!tradeBoard.enabled">Your class teacher has turned trading off for now.</p>
                      <p v-else-if="!tradeBoard.unlocked">Upgrade the Tower to level 1 to unlock class trading.</p>
                      <p v-else>Offers stay in this class. Pinned resources are held safely until a classmate accepts or you unpin the note.</p>
                    </article>
                    <article v-if="tradeBoard.enabled && tradeBoard.unlocked" class="info-note stash-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>Your stash</h4>
                      <p>{{ fmtBundle(tradeBoard.resources, R) }}</p>
                      <small>{{ tradeBoard.mine?.length || 0 }} of {{ tradeBoard.limits.maxOpenPerStudent }} notes pinned</small>
                    </article>
                    <article v-if="tradeBoard.enabled && tradeBoard.unlocked" class="info-note steps-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>How trading works</h4>
                      <ol><li>Write a request at the offer desk.</li><li>Your offer waits safely on this board.</li><li>A classmate accepts, and both stashes update.</li></ol>
                    </article>
                    <template v-if="tradeBoard.enabled && tradeBoard.unlocked">
                    <p v-if="!towerTrades.length" class="empty-board-note">No requests pinned yet. Write the first one at the offer desk, or tune the radio to check again.</p>
                    <article v-for="trade in towerTrades" :key="trade.id" class="trade-entry" :class="{ own: trade.mine }">
                      <span class="note-pin" aria-hidden="true" />
                      <div class="note-author"><b>{{ trade.from }}</b><span v-if="trade.mine" class="trade-state">Your note · resources held</span></div>
                      <div class="note-exchange"><span><small>OFFER</small>{{ fmtBundle(trade.give, R) }}</span><b aria-hidden="true">⇄</b><span><small>LOOKING FOR</small>{{ fmtBundle(trade.want, R) }}</span></div>
                      <template v-if="trade.mine"><button class="btn note-action" type="button" :disabled="tradePending" @click="cancelTrade(trade)">Unpin · return resources</button></template>
                      <button v-else class="btn note-action" type="button" :disabled="tradePending" @click="tradeConfirm = trade">Read &amp; accept</button>
                    </article>
                    <nav v-if="filteredTowerTrades.length > TRADE_PAGE_SIZE" class="trade-pagination" aria-label="Exchange note pages">
                      <button class="text-button" type="button" :disabled="tradePage === 0" @click="tradePage--">← Newer notes</button>
                      <span>Page {{ tradePage + 1 }} of {{ tradePageCount }} · {{ filteredTowerTrades.length }} notes</span>
                      <button class="text-button" type="button" :disabled="tradePage + 1 >= tradePageCount" @click="tradePage++">Older notes →</button>
                    </nav>
                    </template>
                  </div>
                  <p v-else-if="tradeLoading" class="empty-board-note">Tuning the class radio…</p>
                  <div v-if="tradeConfirm" class="trade-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm trade">
                    <p>Accept {{ tradeConfirm.from }}’s offer? You give {{ fmtBundle(tradeConfirm.want, R) }} and receive {{ fmtBundle(tradeConfirm.give, R) }}.</p>
                    <dl v-if="tradeConfirmPreview" class="trade-preview-values"><div><dt>Your resources now</dt><dd>{{ fmtBundle(tradeConfirmPreview.before, R) }}</dd></div><div v-if="tradeConfirmPreview.affordable"><dt>After the exchange</dt><dd>{{ fmtBundle(tradeConfirmPreview.after, R) }}</dd></div></dl>
                    <p v-if="tradeConfirmPreview && !tradeConfirmPreview.affordable" class="trade-error">You do not currently have enough resources for this note.</p>
                    <button class="btn" type="button" :disabled="tradePending" @click="tradeConfirm = null">Close note</button>
                    <button class="btn primary" type="button" :disabled="tradePending || !tradeConfirmPreview?.affordable" @click="acceptTrade(tradeConfirm)">{{ tradePending ? 'Trading…' : 'Yes, accept' }}</button>
                  </div>
                </section>
                <aside class="tower-offer-desk" aria-labelledby="tower-offer-title">
                  <span class="preview-tag">Offer desk</span><h3 id="tower-offer-title">Write a request</h3>
                  <p>Tell your class what you can trade and what you hope to find.</p>
                  <template v-if="tradeBoard?.enabled && tradeBoard?.unlocked">
                    <div class="trade-columns">
                      <fieldset v-for="side in ['give', 'want']" :key="side" class="offer-paper">
                        <legend>{{ side === 'give' ? 'I can offer' : 'I am looking for' }}</legend>
                        <label v-for="(resource, key) in R" :key="key"><span>{{ resource.emoji }} {{ resource.name }}</span><input :value="side === 'give' ? tradeGive[key] : tradeWant[key]" type="number" min="0" max="20" inputmode="numeric" :disabled="tradePending || !!tradePost" @input="setTradeAmount(side, key, $event.target.value)" /></label>
                      </fieldset>
                    </div>
                    <p class="offer-rules">Available: {{ fmtBundle(tradeBoard.resources, R) }}<br>Up to 20 units per side · {{ tradeBoard.limits.maxOpenPerStudent }} open notes</p>
                    <section v-if="tradeCreateConfirm" class="trade-create-confirm" role="alertdialog" aria-label="Review your exchange note">
                      <h4>Review before pinning</h4>
                      <p>You offer {{ fmtBundle(tradeGive, R) }} and ask for {{ fmtBundle(tradeWant, R) }}.</p>
                      <p>Pinning this note holds your offered resources in escrow until a classmate accepts or you unpin it.</p>
                      <button class="btn" type="button" :disabled="tradePending || !!tradePost" @click="tradeCreateConfirm = false">Edit offer</button>
                      <button class="btn primary" type="button" :disabled="tradePending" @click="createTrade">{{ tradePending ? 'Pinning…' : tradePost ? 'Retry pinning note' : 'Confirm and pin' }}</button>
                    </section>
                    <button v-else class="btn primary" type="button" :disabled="tradePending || !tradeBundleHasItems(tradeGive) || !tradeBundleHasItems(tradeWant)" @click="reviewTrade">Review my offer</button>
                  </template>
                  <p v-else-if="tradeBoard && !tradeBoard.enabled" class="offer-rules">Your class teacher has turned trading off.</p>
                  <p v-else-if="tradeError" class="offer-rules">Resolve the board notice to make an offer.</p>
                  <p v-else class="offer-rules">Loading your class exchange rules…</p>
                </aside>
              </div>
</template>
