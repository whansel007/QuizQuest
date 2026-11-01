<script setup>
import { ref, toRefs } from 'vue';
import HeroIcon from '../../HeroIcon.vue';
import LibraryProp from '../LibraryProp.vue';


const props = defineProps({ context: { type: Object, required: true } });
const { libraryShelves, archiveOpen, archiveHero, selectedArchiveHero, openArchiveBook, closeArchiveBook, bookBackButton, trapBookDialog, heroStars, selectedHeroLore, GAME_CONFIG } = toRefs(props.context);
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
                          <button v-if="item.kind === 'hero'" class="spine hero-spine" :class="{ selected: archiveOpen && archiveHero?.id === item.hero.id, 'long-title': item.hero.name.length > 10 }" :style="{ '--book-color': item.color }" type="button" :aria-pressed="archiveOpen && archiveHero?.id === item.hero.id" :aria-label="`Read ${item.hero.name}'s story`" @pointerenter="showHeroName(item.hero, $event)" @pointerleave="hideHeroName" @focus="showHeroName(item.hero, $event)" @blur="hideHeroName" @click="openHeroBook(item.hero, $event)"><span>{{ item.hero.name }}</span></button>
                          <span v-else-if="item.kind === 'book'" class="spine decorative-spine" :class="{ tilted: item.tilt, extra: item.extra }" :style="{ '--book-color': item.color, '--spine-h': `${item.height}px`, '--spine-w': `${item.width}px` }" aria-hidden="true" />
                          <span v-else-if="item.kind === 'stack'" class="book-stack" aria-hidden="true"><i v-for="(color, i) in item.colors" :key="i" :style="{ '--book-color': color }" /></span>
                          <span v-else class="shelf-curio" :class="`curio-${item.prop}`" aria-hidden="true"><LibraryProp :kind="item.prop" /></span>
                        </template>
                      </div>
                    </div>
                  </div>
                </section>
                <div v-if="archiveOpen && selectedArchiveHero" class="storybook-overlay" @pointerdown.self="closeArchiveBook">
                  <div class="storybook-spread" role="dialog" aria-modal="true" aria-labelledby="story-title" @keydown="trapBookDialog">
                  <article class="storybook-page story-left">
                    <button ref="bookBackButton" class="book-back" type="button" @click="closeArchiveBook">← Back to the shelves</button>
                    <span class="story-kicker">{{ selectedArchiveHero.name }} · {{ heroStars(selectedArchiveHero) }}-star {{ selectedArchiveHero.type }} hero</span>
                    <h3 id="story-title" class="story-title">{{ selectedHeroLore?.title || selectedArchiveHero.name }}</h3>
                    <p class="hero-personality">{{ selectedHeroLore?.personality || 'A valued member of the town’s defenders.' }}</p>
                    <p class="story-copy">{{ selectedHeroLore?.story || `${selectedArchiveHero.name} brings ${selectedArchiveHero.weapon || 'their own talents'} to every adventure. Their signature skill is ${selectedArchiveHero.skill || 'always ready'}, and their ultimate is ${selectedArchiveHero.ultimate || 'a force to reckon with'}.` }}</p>
                    <p v-if="selectedHeroLore?.fieldNote" class="field-note"><b>Field note</b> · {{ selectedHeroLore.fieldNote }}</p>
                  </article>
                  <div class="storybook-page story-right">
                    <figure class="story-portrait"><div class="portrait-frame"><HeroIcon :hero="selectedArchiveHero" :size="96" :label="`${selectedArchiveHero.name} portrait`" :animated="true" /></div><figcaption>{{ selectedArchiveHero.name }}</figcaption></figure>
                    <dl class="hero-book-stats"><div><dt>HP</dt><dd>{{ selectedArchiveHero.hp }}</dd></div><div><dt>Attack</dt><dd>{{ selectedArchiveHero.attack }}</dd></div><div><dt>Defense</dt><dd>{{ selectedArchiveHero.defense }}</dd></div><div><dt>Speed</dt><dd>{{ selectedArchiveHero.speed }}</dd></div></dl>
                    <dl class="hero-abilities"><div><dt>Primary fire</dt><dd>{{ selectedArchiveHero.weapon || 'Heroic strike' }}</dd></div><div><dt>Skill</dt><dd>{{ selectedArchiveHero.skill || 'Signature skill' }}</dd></div><div><dt>Ultimate</dt><dd>{{ selectedArchiveHero.ultimate || 'Ultimate power' }}</dd></div><div v-if="GAME_CONFIG.heroes[selectedArchiveHero.id]?.talent"><dt>Talent · {{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.name }}</dt><dd>{{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.description }}</dd></div></dl>
                  </div>
                  </div>
                </div>
              </div>
              <Teleport to="body">
                <div v-if="hoveredHeroName" class="hero-name-bubble" :style="{ left: `${heroNameBubble.x}px`, top: `${heroNameBubble.y}px` }" aria-hidden="true">{{ hoveredHeroName }}</div>
              </Teleport>
</template>
