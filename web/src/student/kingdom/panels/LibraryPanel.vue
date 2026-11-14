<script setup>
import { ref, toRefs } from 'vue';
import HeroIcon from '../../HeroIcon.vue';
import LibraryProp from '../LibraryProp.vue';
import HeroBook from '../HeroBook.vue';


const props = defineProps({ context: { type: Object, required: true } });
const { libraryShelves, archiveOpen, archiveHero, selectedArchiveHero, openArchiveBook, closeArchiveBook, heroStars, selectedHeroLore } = toRefs(props.context);
const hoveredHeroName = ref('');
const heroNameBubble = ref({ x: 0, y: 0 });

function showHeroName(hero, event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const center = bounds.left + bounds.width / 2;
  const sidePadding = 140;
  heroNameBubble.value = {
    x: window.innerWidth < sidePadding * 2 ? window.innerWidth / 2 : Math.max(sidePadding, Math.min(window.innerWidth - sidePadding, center)),
    y: bounds.top,
  };
  hoveredHeroName.value = hero.name;
}

function hideHeroName() {
  hoveredHeroName.value = '';
}

function openHeroBook(hero, event) {
  hideHeroName();
  openArchiveBook.value(hero, event);
}
</script>

<template>
              <div class="library-feature">
                <section class="library-shelves" aria-labelledby="library-archive-title">
                  <div class="shelf-heading">
                    <div class="archive-plaque"><span class="scene-kicker">The magical archive</span><h3 id="library-archive-title">Choose a volume</h3></div>
                    <p class="library-magic-note">Every hero has a gold-titled book on these shelves. The library strengthens magic heroes.</p>
                  </div>
                  <div class="bookcase">
                    <div v-for="(bays, shelfIndex) in libraryShelves" :key="shelfIndex" class="shelf-row" role="group" :aria-label="`Shelf ${shelfIndex + 1}`">
                      <div v-for="bay in bays" :key="bay.id" class="shelf-bay">
                        <template v-for="item in bay.items" :key="item.key">
                          <button v-if="item.kind === 'hero'" class="hero-volume" :class="{ selected: archiveOpen && archiveHero?.id === item.hero.id, 'long-title': item.hero.name.length > 10 }" :style="{ '--book-color': item.color }" type="button" :aria-pressed="archiveOpen && archiveHero?.id === item.hero.id" :aria-label="`Read ${item.hero.name}'s story`" @pointerenter="showHeroName(item.hero, $event)" @pointerleave="hideHeroName" @focus="showHeroName(item.hero, $event)" @blur="hideHeroName" @click="openHeroBook(item.hero, $event)"><span class="hero-volume-portrait"><HeroIcon :hero="item.hero" :size="42" /></span><span class="spine hero-spine"><span>{{ item.hero.name }}</span></span></button>
                          <span v-else-if="item.kind === 'book'" class="spine decorative-spine" :class="{ tilted: item.tilt, extra: item.extra }" :style="{ '--book-color': item.color, '--spine-h': `${item.height}px`, '--spine-w': `${item.width}px` }" aria-hidden="true" />
                          <span v-else-if="item.kind === 'stack'" class="book-stack" aria-hidden="true"><i v-for="(color, i) in item.colors" :key="i" :style="{ '--book-color': color }" /></span>
                          <span v-else class="shelf-curio" :class="`curio-${item.prop}`" aria-hidden="true"><LibraryProp :kind="item.prop" /></span>
                        </template>
                      </div>
                    </div>
                  </div>
                </section>
                <HeroBook v-if="archiveOpen && selectedArchiveHero" :hero="selectedArchiveHero" :lore="selectedHeroLore" :stars="heroStars(selectedArchiveHero)" @close="closeArchiveBook" />
              </div>
              <Teleport to="body">
                <div v-if="hoveredHeroName" class="hero-name-bubble" :style="{ left: `${heroNameBubble.x}px`, top: `${heroNameBubble.y}px` }" aria-hidden="true">{{ hoveredHeroName }}</div>
              </Teleport>
</template>
