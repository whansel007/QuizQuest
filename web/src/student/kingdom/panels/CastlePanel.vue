<script setup>
import { computed, toRefs } from 'vue';
import AvatarPreview from '../../AvatarPreview.vue';
import CosmeticIcon from '../../CosmeticIcon.vue';


const props = defineProps({ context: { type: Object, required: true } });
const { wardrobeResources, R, fmtBundle, wardrobeLoading, wardrobeError, wardrobeCategory, wardrobeHats, wardrobeOwnedIds, wardrobeHat, wardrobeClaiming, wardrobeCanAfford, wardrobePrice, wardrobeShortfall, claimWardrobeCosmetic, wardrobeAccessory, wardrobeAccessories, wardrobeColors, wardrobeColor, colorSaving, wardrobeDirty, wardrobeCanSave, saveWardrobeLook, castleInfoOpen, castleLevel, BUILDING_LEVEL_CAP } = toRefs(props.context);
const wardrobeColorChipStyle = computed(() => {
  const hex = wardrobeColor.value || '#000000';
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
  return { backgroundColor: hex, color: luminance > 150 ? '#23382f' : '#fff8e4' };
});
const castleMeaning = computed(() => castleLevel.value === 0
  ? 'Your castle grows as every building reaches the same level.'
  : `Every building has reached level ${castleLevel.value}. The castle level is the lowest level among your four buildings.`);
</script>

<template>
  <section v-if="castleInfoOpen" id="castle-upgrade-info" class="castle-info-card" aria-label="How castle levels grow">
    <button class="book-back" type="button" @click="castleInfoOpen = false">Close explanation</button>
    <h3>The castle follows your town</h3>
    <p>{{ castleMeaning }}</p>
    <ol class="castle-levels"><li v-for="level in BUILDING_LEVEL_CAP" :key="level" :class="{ done: castleLevel >= level }">Level {{ level }} · All four buildings reach level {{ level }}.</li></ol>
  </section>
              <div class="wardrobe-feature">
                <section class="wardrobe-catalog" aria-labelledby="wardrobe-title">
                  <div class="wardrobe-title-row"><div><span class="preview-tag">Castle wardrobe</span><h3 id="wardrobe-title">Dress for your next tale</h3></div><span class="wardrobe-stamp" aria-hidden="true">ROYAL<br>SEAL</span></div>
                  <p>Try-ons are free. Add keepsakes with the resources you gather around town, then save the look to equip them.</p>
                  <p class="wardrobe-purse">On hand: {{ fmtBundle(wardrobeResources, R) }}</p>
                  <p v-if="wardrobeLoading" class="wardrobe-status" role="status">Opening the wardrobe…</p>
                  <p v-if="wardrobeError" class="wardrobe-error" role="alert">{{ wardrobeError }}</p>
                  <div class="wardrobe-tabs" role="group" aria-label="Wardrobe category">
                    <button v-for="tab in [{ id: 'hats', label: 'Hats' }, { id: 'accessories', label: 'Pins' }, { id: 'colors', label: 'Colors' }]" :key="tab.id" class="wardrobe-tab" type="button" :aria-pressed="wardrobeCategory === tab.id" @click="wardrobeCategory = tab.id">{{ tab.label }}</button>
                  </div>
                  <section v-if="wardrobeCategory === 'hats'" class="wardrobe-items" aria-labelledby="wardrobe-hats-title">
                    <h4 id="wardrobe-hats-title">Hat shelf</h4>
                    <div class="hat-options" role="group" aria-label="Try on a hat">
                      <article v-for="hat in wardrobeHats" :key="hat.id" class="hat-card">
                        <button class="hat-option" type="button" :aria-label="'Try on ' + hat.name" :aria-pressed="wardrobeHat?.id === hat.id" :disabled="wardrobeLoading" @click="wardrobeHat = hat"><CosmeticIcon :id="hat.id" :size="58" /><small>{{ hat.name }}</small></button>
                        <button v-if="!wardrobeOwnedIds.includes(hat.id) && wardrobeCanAfford(hat)" class="hat-claim" type="button" :disabled="!!wardrobeClaiming" @click="claimWardrobeCosmetic(hat)">{{ wardrobeClaiming === hat.id ? 'Adding…' : `${hat.cost ? 'Buy' : 'Add'} · ${wardrobePrice(hat)}` }}</button>
                        <small v-else-if="!wardrobeOwnedIds.includes(hat.id)" class="wardrobe-shortfall">{{ wardrobeShortfall(hat) }}</small>
                        <small v-else class="hat-owned">{{ wardrobeHat?.id === hat.id ? 'Selected' : 'In wardrobe' }}</small>
                      </article>
                      <article class="hat-card"><button class="hat-option" type="button" :aria-pressed="!wardrobeHat" aria-label="Preview without a hat" @click="wardrobeHat = null"><span aria-hidden="true">◌</span><small>No hat</small></button><small class="hat-owned">Always available</small></article>
                    </div>
                  </section>
                  <section v-else-if="wardrobeCategory === 'accessories'" class="wardrobe-items" aria-labelledby="wardrobe-accessories-title">
                    <h4 id="wardrobe-accessories-title">Pinned keepsakes</h4>
                    <div class="hat-options" role="group" aria-label="Try on an accessory">
                      <article v-for="item in wardrobeAccessories" :key="item.id" class="hat-card">
                        <button class="hat-option" type="button" :aria-label="'Try on ' + item.name" :aria-pressed="wardrobeAccessory?.id === item.id" :disabled="wardrobeLoading" @click="wardrobeAccessory = item"><CosmeticIcon :id="item.id" :size="58" /><small>{{ item.name }}</small></button>
                        <button v-if="!wardrobeOwnedIds.includes(item.id) && wardrobeCanAfford(item)" class="hat-claim" type="button" :disabled="!!wardrobeClaiming" @click="claimWardrobeCosmetic(item)">{{ wardrobeClaiming === item.id ? 'Adding…' : `${item.cost ? 'Buy' : 'Add'} · ${wardrobePrice(item)}` }}</button>
                        <small v-else-if="!wardrobeOwnedIds.includes(item.id)" class="wardrobe-shortfall">{{ wardrobeShortfall(item) }}</small>
                        <small v-else class="hat-owned">{{ wardrobeAccessory?.id === item.id ? 'Selected' : 'In wardrobe' }}</small>
                      </article>
                      <article class="hat-card"><button class="hat-option" type="button" :aria-pressed="!wardrobeAccessory" aria-label="Preview without a pin" @click="wardrobeAccessory = null"><span aria-hidden="true">◌</span><small>No pin</small></button><small class="hat-owned">Always available</small></article>
                    </div>
                  </section>
                  <section v-else class="wardrobe-items" aria-labelledby="wardrobe-colors-title">
                    <h4 id="wardrobe-colors-title">Color swatches</h4>
                    <div class="avatar-swatches wardrobe-swatches" role="group" aria-label="Preview avatar color">
                      <button v-for="color in wardrobeColors" :key="color.id" class="avatar-swatch" type="button" :style="{ '--swatch-color': color.renderValue }" :aria-label="color.name" :title="color.name" :aria-pressed="wardrobeColor === color.renderValue" :disabled="colorSaving || wardrobeLoading" @click="wardrobeColor = color.renderValue" />
                    </div>
                    <p class="wardrobe-current">Selected color: <code :style="wardrobeColorChipStyle">{{ wardrobeColor }}</code></p>
                  </section>
                  <button class="btn primary wardrobe-save" type="button" :disabled="colorSaving || wardrobeLoading || !wardrobeDirty || !wardrobeCanSave" @click="saveWardrobeLook">{{ colorSaving ? 'Saving…' : 'Save this look' }}</button>
                </section>
                <aside class="wardrobe-preview dressing-room" aria-labelledby="castle-mirror-title">
                  <div class="room-wall" aria-hidden="true">
                    <span class="sconce sconce-left"><i /></span><span class="sconce sconce-right"><i /></span>
                    <span class="hat-stand"><i /><i /><i /></span>
                  </div>
                  <div class="room-floor" aria-hidden="true"><span class="rug" /></div>
                  <figure class="castle-mirror">
                    <div class="mirror-frame">
                      <div class="mirror-glass">
                        <div class="wardrobe-avatar"><AvatarPreview :color="wardrobeColor" :hat-id="wardrobeHat?.id" :accessory-id="wardrobeAccessory?.id" /></div>
                        <span class="mirror-sheen" aria-hidden="true" />
                      </div>
                    </div>
                    <span class="mirror-feet" aria-hidden="true" />
                    <figcaption id="castle-mirror-title">Castle mirror<small>{{ wardrobeDirty ? 'Previewing · not saved yet' : 'Your saved look' }}</small></figcaption>
                  </figure>
                </aside>
              </div>
</template>
