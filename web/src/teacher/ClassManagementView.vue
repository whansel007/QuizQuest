<script setup>
// ============================================================
// Professor Class Management View (Task 1B)
// Create/edit classes, soft-archive, manage rosters,
// and generate/revoke student join codes.
// ============================================================
import { ref, onMounted, computed } from 'vue';
import { api } from '../api.js';
import { toast, when, fmtBundle, action } from '../ui.js';
import { loadCourses, RES } from './courses.js';
import Heading from '../components/Heading.vue';
import Field from '../components/Field.vue';

const loading = ref(false);
const error = ref('');
const courses = ref([]);
const classes = ref([]);
const selectedClass = ref(null);
const activeTab = ref('roster'); // 'roster' | 'codes' | 'settings'

// Roster state
const roster = ref([]);
const rosterLoading = ref(false);

// Join codes state
const joinCodes = ref([]);
const codesLoading = ref(false);
// The code itself is shown once, when it is generated: the server keeps
// only a hash of it, so it cannot be shown again later. Its id is kept
// here too, so the banner can be matched to its row when it is revoked.
const newlyGeneratedCode = ref(null);
const newlyGeneratedCodeId = ref(null);

// Create Class Modal
const showCreateModal = ref(false);
const newClassName = ref('');
const newClassCourseId = ref('');
const newClassDescription = ref('');

// Generate Code Modal
const showGenerateCodeModal = ref(false);
const codeUsageLimit = ref(20);
const codeExpiresDays = ref(14);

// Filter
const showArchived = ref(false);
const displayedClasses = computed(() => {
  if (showArchived.value) return classes.value;
  return classes.value.filter((c) => !c.archivedAt);
});

// Search. The grid can hold every class the professor owns, across every
// course, so the settings of one class can be a long way down the list: the
// search box narrows the cards to the class the professor is looking for.
const classSearch = ref('');
const matchesSearch = (c) => `${c.name} ${c.courseTitle || ''}`.toLowerCase().includes(classSearch.value.trim().toLowerCase());
const filteredClasses = computed(() => {
  if (!classSearch.value.trim()) return displayedClasses.value;
  return displayedClasses.value.filter(matchesSearch);
});
// An archived class is hidden until it is asked for, so a search that only
// matches archived classes would come back empty and say nothing. The count
// lets the page say where the class went.
const archivedMatches = computed(() => {
  if (!classSearch.value.trim() || showArchived.value) return 0;
  return classes.value.filter((c) => c.archivedAt && matchesSearch(c)).length;
});

async function loadData() {
  loading.value = true;
  error.value = '';
  try {
    courses.value = await loadCourses();
    classes.value = await api('GET', '/api/classes');
    if (courses.value.length && !newClassCourseId.value) {
      newClassCourseId.value = courses.value[0].id;
    }
    if (selectedClass.value) {
      const refreshed = classes.value.find((c) => c.id === selectedClass.value.id);
      if (refreshed) {
        selectedClass.value = refreshed;
        await loadClassDetails(refreshed);
      }
    }
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

async function selectClassToManage(cls) {
  selectedClass.value = cls;
  newlyGeneratedCode.value = null;
  await loadClassDetails(cls);
}

async function loadClassDetails(cls) {
  rosterLoading.value = true;
  codesLoading.value = true;
  try {
    const [rosterData, codesData] = await Promise.all([
      api('GET', `/api/classes/${cls.id}/members`),
      api('GET', `/api/classes/${cls.id}/join-codes`),
    ]);
    roster.value = rosterData;
    joinCodes.value = codesData;
  } catch (err) {
    toast(err.message, true);
  } finally {
    rosterLoading.value = false;
    codesLoading.value = false;
  }
}

// ---- Class settings: trading, analytics time zone, trade log ----
// These used to live on the Settings page, one panel per class. They belong
// with the class they are about, so they sit here now: a third sub-tab of
// the class the professor is looking at.

const classTrades = ref([]);
const tradesLoading = ref(false);
const showTradeLog = ref(false);

// Time zone for the Analytics dashboard's days and weeks (default Singapore)
const DEFAULT_TZ = 'Asia/Singapore';
const ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TZ, 'UTC'];
const zoneOf = (cl) => cl?.settings?.timezone || DEFAULT_TZ;
const zonesFor = (cl) => [...new Set([zoneOf(cl), DEFAULT_TZ, ...ZONES])].sort();

// The server sends the whole settings object back, so one write updates the
// card on the grid and the panel above at the same time. Nothing is refetched
// and rerender() is not called: a rerender remounts this view and would throw
// the professor back to the class list, losing where they were.
function applySettings(classId, settings) {
  const c = classes.value.find((x) => x.id === classId);
  if (c) c.settings = settings;
  if (selectedClass.value && selectedClass.value.id === classId) selectedClass.value.settings = settings;
}

const toggleTrading = (cl) => action(async (e) => {
  const box = e.target;
  try {
    const settings = await api('PUT', `/api/teacher/classes/${cl.id}/settings`, { tradingEnabled: box.checked });
    applySettings(cl.id, settings);
  } catch (err) {
    box.checked = !box.checked; // failed: show the setting as it really is
    throw err;
  }
  toast('Saved');
});

const setZone = (cl) => action(async (e) => {
  const select = e.target;
  try {
    const settings = await api('PUT', `/api/teacher/classes/${cl.id}/settings`, { timezone: select.value });
    applySettings(cl.id, settings);
  } catch (err) {
    select.value = zoneOf(cl); // failed: show the setting as it really is
    throw err;
  }
  toast('Saved');
});

const statusClass = (t) => 'badge ' + (t.status === 'accepted' ? 'published' : t.status === 'open' ? 'draft' : 'plain');

async function loadTrades(cls) {
  tradesLoading.value = true;
  try {
    classTrades.value = await api('GET', `/api/teacher/classes/${cls.id}/trades`);
  } catch (err) {
    toast(err.message, true);
  } finally {
    tradesLoading.value = false;
  }
}

// The sub-tabs: the roster, the join codes, and the class settings. The
// trade log starts closed and its list is fetched when the tab is opened, so
// a professor who only wants the roster does not pay for it.
function setActiveTab(tab) {
  activeTab.value = tab;
  showTradeLog.value = false;
  if (tab === 'settings' && selectedClass.value) loadTrades(selectedClass.value);
}

// Open a class straight on its settings, from its card on the grid.
async function openClassSettings(cls) {
  await selectClassToManage(cls);
  setActiveTab('settings');
}

const handleCreateClass = action(async () => {
  if (!newClassName.value.trim()) throw new Error('Class name is required.');
  if (!newClassCourseId.value) throw new Error('Please select a course.');

  const created = await api('POST', '/api/classes', {
    courseId: newClassCourseId.value,
    name: newClassName.value.trim(),
    description: newClassDescription.value.trim(),
  });

  toast(`Class "${created.name}" created successfully!`);
  newClassName.value = '';
  newClassDescription.value = '';
  showCreateModal.value = false;
  await loadData();
  const c = classes.value.find((x) => x.id === created.id);
  if (c) selectClassToManage(c);
});

const handleArchiveClass = (cls) => action(async () => {
  const willArchive = !cls.archivedAt;
  const res = await api('POST', `/api/classes/${cls.id}/archive`);
  cls.archivedAt = res.archivedAt;
  toast(willArchive ? `Class "${cls.name}" archived.` : `Class "${cls.name}" restored.`);
  await loadData();
});

const handleRemoveMember = (member) => action(async () => {
  if (!confirm(`Are you sure you want to remove ${member.name} from this class?`)) return;
  await api('DELETE', `/api/classes/${selectedClass.value.id}/members/${member.id}`);
  toast(`Removed ${member.name} from roster.`);
  await loadClassDetails(selectedClass.value);
  await loadData();
});

// Enrol a student: by email, into a class named as listed here. The roster's
// form fills in the open class's name.
const enrolEmail = ref('');
const enrolClassName = ref('');
const activeClassNames = computed(() => classes.value.filter((c) => !c.archivedAt).map((c) => c.name));

const enrolStudent = (className) => action(async () => {
  if (!enrolEmail.value.trim()) throw new Error("Enter the student's email.");
  if (!className.trim()) throw new Error('Enter the class name.');
  const res = await api('POST', '/api/classes/enrol', { email: enrolEmail.value.trim(), className });
  toast(`Added ${res.student.name} to ${res.class.name}.`);
  enrolEmail.value = '';
  enrolClassName.value = '';
  if (selectedClass.value) await loadClassDetails(selectedClass.value);
  await loadData();
});

// Clicking a student's name opens their profile row: their classes with
// you, and a dropdown of your other active classes to add them to.
const openStudentId = ref(null);
const addToClassId = ref('');
function toggleStudent(m) {
  openStudentId.value = openStudentId.value === m.id ? null : m.id;
  addToClassId.value = '';
}
const classNameOf = (id) => classes.value.find((c) => c.id === id)?.name || id;
const otherClasses = (m) => classes.value.filter((c) => !c.archivedAt && !m.classIds?.includes(c.id));

const addToClass = (m) => action(async () => {
  const target = classes.value.find((c) => c.id === addToClassId.value);
  if (!target) throw new Error('Choose a class.');
  const res = await api('POST', '/api/classes/enrol', { email: m.email, className: target.name });
  toast(`Added ${res.student.name} to ${res.class.name}.`);
  addToClassId.value = '';
  await loadClassDetails(selectedClass.value);
  await loadData();
});

const handleGenerateCode = action(async () => {
  const res = await api('POST', `/api/classes/${selectedClass.value.id}/join-codes`, {
    usageLimit: Number(codeUsageLimit.value) || null,
    expiresInDays: Number(codeExpiresDays.value) || null,
  });

  newlyGeneratedCode.value = res.code;
  newlyGeneratedCodeId.value = res.id;
  showGenerateCodeModal.value = false;
  toast(`New join code generated: ${res.code}`);
  await loadClassDetails(selectedClass.value);
  await loadData();
});

const handleRevokeCode = (code) => action(async () => {
  if (!confirm('Are you sure you want to revoke this join code? Students will no longer be able to use it.')) return;
  await api('DELETE', `/api/classes/${selectedClass.value.id}/join-codes/${code.id}`);
  // The green banner still holds the code that was just revoked, and it
  // still says "Share this code with your students" with a live Copy Code
  // button - so the professor could copy and hand out a code that no
  // longer works. The banner goes when the code it names is the one that
  // dies; a code revoked from the list that is not the banner's leaves the
  // banner alone, because that one is still good.
  // The banner is matched by the code's id, not by the code itself: the
  // server keeps only a hash of the code, so the list never carries it.
  if (newlyGeneratedCodeId.value === code.id) {
    newlyGeneratedCode.value = null;
    newlyGeneratedCodeId.value = null;
  }
  toast('Join code revoked.');
  await loadClassDetails(selectedClass.value);
  await loadData();
});

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  toast(`Copied "${text}" to clipboard!`);
}
</script>

<template>
  <div class="class-mgmt-container">
    <Heading
      title="Class Management"
      subtitle="Organize class groups, view student rosters, generate enrolment join codes, and control class availability."
    >
      <button class="btn primary" @click="showCreateModal = true">+ Create Class</button>
    </Heading>

    <div v-if="error" class="note bad">{{ error }}</div>

    <!-- MAIN VIEW: CLASSES OVERVIEW -->
    <template v-if="!selectedClass">
      <div class="panel">
        <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <span class="muted small">
            Showing {{ displayedClasses.length }} {{ showArchived ? 'total' : 'active' }} classes
          </span>
          <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
            <input v-model="showArchived" type="checkbox" />
            Show archived classes
          </label>
        </div>
        <div class="row top" style="margin-top: 12px; align-items: center; gap: 10px;">
          <input
            v-model="classSearch"
            type="search"
            class="grow"
            placeholder="Search classes by name or course"
            aria-label="Search classes"
            autocomplete="off"
          />
          <span v-if="classSearch.trim()" class="small muted" style="white-space: nowrap;">
            {{ filteredClasses.length }} match{{ filteredClasses.length === 1 ? '' : 'es' }}
          </span>
          <button v-if="classSearch.trim()" class="btn small" @click="classSearch = ''">Clear</button>
        </div>
        <p v-if="archivedMatches" class="small muted" style="margin: 8px 0 0;">
          {{ archivedMatches }} archived class{{ archivedMatches === 1 ? ' matches' : 'es match' }} too — tick
          "Show archived classes" to see {{ archivedMatches === 1 ? 'it' : 'them' }}.
        </p>
      </div>

      <form class="panel" aria-label="Enrol a student" @submit.prevent="enrolStudent(enrolClassName)($event)">
        <h3 style="margin-bottom: 2px;">Enrol a student</h3>
        <p class="muted small">Adds an existing student account to one of your classes. They stay in their other classes.</p>
        <div class="row top">
          <Field class="grow" label="Student email" v-slot="{ id }">
            <input :id="id" v-model="enrolEmail" type="email" placeholder="student01@quizquest.demo" autocomplete="off" />
          </Field>
          <Field class="grow" label="Class name" v-slot="{ id }">
            <input :id="id" v-model="enrolClassName" type="text" list="enrol-class-names" autocomplete="off" />
          </Field>
        </div>
        <datalist id="enrol-class-names">
          <option v-for="name in activeClassNames" :key="name" :value="name" />
        </datalist>
        <button type="submit" class="btn primary">Enrol student</button>
      </form>

      <div class="classes-grid">
        <div
          v-for="c in filteredClasses"
          :key="c.id"
          class="panel class-card"
          :class="{ archived: c.archivedAt }"
        >
          <div class="row top" style="justify-content: space-between;">
            <div>
              <span class="badge" :class="c.archivedAt ? 'bad' : 'plain'">
                {{ c.courseTitle || 'Course' }}
              </span>
              <h3 style="margin: 8px 0 4px; font-size: 18px;">{{ c.name }}</h3>
              <p v-if="c.description" class="small muted" style="margin-bottom: 8px;">
                {{ c.description }}
              </p>
            </div>
            <span v-if="c.archivedAt" class="badge bad">Archived</span>
          </div>

          <div class="class-stats-row">
            <span class="stat-pill">👥 {{ c.memberCount }} {{ c.memberCount === 1 ? 'Student' : 'Students' }}</span>
            <span class="stat-pill">🔑 {{ c.activeCodesCount }} Active {{ c.activeCodesCount === 1 ? 'Code' : 'Codes' }}</span>
            <span class="stat-pill">🤝 Trading {{ c.settings?.tradingEnabled ? 'on' : 'off' }}</span>
          </div>

          <div class="row" style="margin-top: 16px; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div class="row" style="gap: 8px; flex-wrap: wrap;">
              <button class="btn small primary" @click="selectClassToManage(c)">
                Manage Roster & Codes →
              </button>
              <button class="btn small" @click="openClassSettings(c)">Settings</button>
            </div>
            <button
              class="btn small"
              :class="c.archivedAt ? 'good' : 'bad'"
              @click="handleArchiveClass(c)($event)"
            >
              {{ c.archivedAt ? 'Restore' : 'Archive' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="!filteredClasses.length" class="panel empty-state">
        <p class="muted">
          <template v-if="classSearch.trim()">No class matches "{{ classSearch.trim() }}".</template>
          <template v-else>You have no classes yet. Create one to get started.</template>
        </p>
      </div>
    </template>

    <!-- SELECTED CLASS DETAILS & ROSTER -->
    <template v-else>
      <div class="panel">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <button class="link-btn small" style="margin-bottom: 4px;" @click="selectedClass = null">
              ← Back to all classes
            </button>
            <h2 style="margin: 0;">{{ selectedClass.name }}</h2>
            <span class="muted small">{{ selectedClass.courseTitle }} · ID: {{ selectedClass.id }}</span>
          </div>
          <div class="row">
            <button
              class="btn small"
              :class="selectedClass.archivedAt ? 'good' : 'bad'"
              @click="handleArchiveClass(selectedClass)($event)"
            >
              {{ selectedClass.archivedAt ? 'Restore Class' : 'Archive Class' }}
            </button>
          </div>
        </div>

        <div class="sub-tabs">
          <button
            type="button"
            :class="['sub-tab-btn', { active: activeTab === 'roster' }]"
            @click="setActiveTab('roster')"
          >
            Student Roster ({{ roster.length }})
          </button>
          <button
            type="button"
            :class="['sub-tab-btn', { active: activeTab === 'codes' }]"
            @click="setActiveTab('codes')"
          >
            Join Codes ({{ joinCodes.filter((c) => !c.revoked && !c.isExpired).length }})
          </button>
          <button
            type="button"
            :class="['sub-tab-btn', { active: activeTab === 'settings' }]"
            @click="setActiveTab('settings')"
          >
            Class Settings
          </button>
        </div>
      </div>

      <!-- NEW CODE SUCCESS BANNER -->
      <div v-if="newlyGeneratedCode" class="panel good" style="background: var(--good-soft); border-color: var(--good);">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <b style="color: var(--good);">New Join Code Generated:</b>
            <span class="code-badge-large" :data-code-id="newlyGeneratedCodeId">{{ newlyGeneratedCode }}</span>
            <span class="small muted" style="margin-left: 8px;">id {{ newlyGeneratedCodeId ? newlyGeneratedCodeId.slice(0, 8) : '' }}</span>
            <p class="small muted" style="margin: 4px 0 0;">
              Share this code with your students. They can redeem it on their student practice dashboard to enroll!
              <br />
              <b>Copy it now — it is shown only once.</b> The server keeps a hash of the code, not the code
              itself, so it cannot be shown again. If you lose it, generate another one.
            </p>
          </div>
          <button class="btn good" @click="copyToClipboard(newlyGeneratedCode)">
            Copy Code
          </button>
        </div>
      </div>

      <!-- TAB 1: STUDENT ROSTER -->
      <div v-if="activeTab === 'roster'" class="panel">
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h3>Enrolled Students</h3>
          <span class="small muted">Total: {{ roster.length }}</span>
        </div>

        <form
          v-if="!selectedClass.archivedAt"
          class="row"
          aria-label="Add a student to this class"
          style="margin-bottom: 14px;"
          @submit.prevent="enrolStudent(selectedClass.name)($event)"
        >
          <Field class="grow" label="Add a student by email" v-slot="{ id }">
            <input :id="id" v-model="enrolEmail" type="email" placeholder="student01@quizquest.demo" autocomplete="off" />
          </Field>
          <button type="submit" class="btn primary">Add student</button>
        </form>

        <div v-if="rosterLoading" class="muted small">Loading roster…</div>
        <div v-else-if="!roster.length" class="empty-state">
          <p class="muted">No students are currently enrolled in this class. Add one by email above, or share a join code.</p>
          <button class="btn small" @click="activeTab = 'codes'; showGenerateCodeModal = true;">
            + Generate a Join Code
          </button>
        </div>
        <div v-else class="table-wrap teacher-roster-table">
          <table class="data-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Email</th>
                <th>Questions Attempted</th>
                <th>Last Active</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="m in roster" :key="m.id">
                <tr>
                  <td>
                    <button
                      type="button"
                      class="link-btn student-name"
                      :aria-expanded="openStudentId === m.id ? 'true' : 'false'"
                      @click="toggleStudent(m)"
                    >
                      {{ m.name }} <span aria-hidden="true">{{ openStudentId === m.id ? '▴' : '▾' }}</span>
                    </button>
                  </td>
                  <td class="muted small">{{ m.email }}</td>
                  <td>{{ m.attemptsCount }}</td>
                  <td class="muted small">{{ m.lastActive ? new Date(m.lastActive).toLocaleDateString() : 'Never' }}</td>
                  <td style="text-align: right;">
                    <button class="btn small bad" @click="handleRemoveMember(m)($event)">
                      Remove
                    </button>
                  </td>
                </tr>
                <tr v-if="openStudentId === m.id" class="student-profile">
                  <td colspan="5">
                    <p class="small" style="margin: 0 0 8px;">
                      <span class="muted">Classes with you:</span>
                      <span v-for="id in m.classIds" :key="id" class="badge plain" style="margin-left: 6px;">{{ classNameOf(id) }}</span>
                    </p>
                    <form
                      v-if="otherClasses(m).length"
                      class="row"
                      :aria-label="`Add ${m.name} to another class`"
                      @submit.prevent="addToClass(m)($event)"
                    >
                      <select v-model="addToClassId" aria-label="Add to class" style="width: auto;">
                        <option value="" disabled>Add to class…</option>
                        <option v-for="c in otherClasses(m)" :key="c.id" :value="c.id">{{ c.name }}</option>
                      </select>
                      <button type="submit" class="btn small primary" :disabled="!addToClassId">Add</button>
                    </form>
                    <p v-else class="small muted" style="margin: 0;">Already in all of your active classes.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: JOIN CODES -->
      <div v-if="activeTab === 'codes'" class="panel">
        <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div>
            <h3 style="margin-bottom: 2px;">Enrolment Join Codes</h3>
            <p class="muted small">Students enter these codes to self-enroll in this class.</p>
          </div>
          <button class="btn primary small" @click="showGenerateCodeModal = true">
            + Generate Join Code
          </button>
        </div>

        <div v-if="codesLoading" class="muted small">Loading join codes…</div>
        <div v-else-if="!joinCodes.length" class="empty-state">
          <p class="muted">No join codes have been created for this class yet.</p>
          <button class="btn primary small" @click="showGenerateCodeModal = true">
            Generate First Join Code
          </button>
        </div>
        <div v-else class="table-wrap teacher-codes-table">
          <table class="data-table">
            <thead>
              <tr>
                <th>Join Code</th>
                <th>Usage</th>
                <th>Expires</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in joinCodes" :key="c.id" :data-code-id="c.id">
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <code class="code-badge-table">QQ-••••••••••••</code>
                    <span class="small muted" :title="`Code id ${c.id}`">{{ c.id.slice(0, 8) }}</span>
                  </div>
                </td>
                <td>{{ c.usageCount }} / {{ c.usageLimit ? c.usageLimit : '∞' }}</td>
                <td class="small muted">{{ c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never' }}</td>
                <td>
                  <span v-if="c.revoked" class="badge bad">Revoked</span>
                  <span v-else-if="c.isExpired" class="badge warn">Expired</span>
                  <span v-else class="badge good">Active</span>
                </td>
                <td style="text-align: right;">
                  <button
                    v-if="!c.revoked && !c.isExpired"
                    class="btn small bad"
                    @click="handleRevokeCode(c)($event)"
                  >
                    Revoke
                  </button>
                  <span v-else class="muted small">—</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="small muted" style="margin: 10px 0 0;">
            A code is shown once, on the banner above, when it is generated. The server keeps only a hash of it,
            so it cannot be shown again — the id beside each row is what identifies a code, and what the
            Revoke button uses. The banner shows the id too, so a code and its row can be matched up.
          </p>
        </div>
      </div>

      <!-- TAB 3: CLASS SETTINGS -->
      <div v-if="activeTab === 'settings'" class="panel" role="region" aria-label="Class settings">
        <h3>Class settings</h3>
        <p class="muted small">How {{ selectedClass.name }} behaves for its students.</p>

        <label style="font-weight: 400; color: inherit; margin: 12px 0; display: block;">
          <input
            type="checkbox"
            :checked="!!selectedClass.settings?.tradingEnabled"
            @change="toggleTrading(selectedClass)($event)"
          />
          <b>Allow resource trading between classmates</b>
          <div class="small muted" style="margin-left: 24px">
            Students post offers to the whole class (no private targeting), with limits on open offers, size
            and daily trades. Turning this off refunds every open offer.
          </div>
        </label>

        <div class="row" style="margin: 12px 0 2px">
          <label :for="'tz-' + selectedClass.id" style="margin: 0"><b>Time zone for analytics</b></label>
          <select
            :id="'tz-' + selectedClass.id"
            style="width: auto"
            :value="zoneOf(selectedClass)"
            @change="setZone(selectedClass)($event)"
          >
            <option v-for="z in zonesFor(selectedClass)" :key="z" :value="z">{{ z.replace(/_/g, ' ') }}</option>
          </select>
        </div>
        <div class="small muted">
          Decides when a "day" and a "week" start on the Analytics dashboard, so an answer at 7am counts on
          the right day.
        </div>

        <div class="row" style="margin-top: 16px; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button class="btn small" @click="showTradeLog = !showTradeLog">
            {{ showTradeLog ? 'Hide trade log' : 'View trade log' }} ({{ classTrades.length }})
          </button>
          <span class="small muted">The last 40 trades in this class.</span>
        </div>

        <div v-if="showTradeLog" style="margin-top: 10px">
          <div v-if="tradesLoading" class="muted small">Loading trade log…</div>
          <div v-else-if="!classTrades.length" class="small muted">No trades yet.</div>
          <div v-else class="table-wrap">
            <table>
              <tbody>
                <tr v-for="t in classTrades" :key="t.id">
                  <td class="small muted">{{ when(t.createdAt) }}</td>
                  <td>{{ t.from }}</td>
                  <td>{{ `${fmtBundle(t.give, RES)} for ${fmtBundle(t.want, RES)}` }}</td>
                  <td><span :class="statusClass(t)">{{ t.status }}</span></td>
                  <td>{{ t.acceptedByName || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- MODAL: CREATE CLASS -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-card">
        <h3>Create New Class Group</h3>
        <p class="small muted">A class group represents an assigned section or tutorial cohort.</p>

        <form @submit.prevent="handleCreateClass($event)">
          <div class="field" style="margin-bottom: 14px;">
            <label for="new-class-course">Course</label>
            <select id="new-class-course" v-model="newClassCourseId" required>
              <option v-for="crs in courses" :key="crs.id" :value="crs.id">
                {{ crs.title }} ({{ crs.id }})
              </option>
            </select>
          </div>

          <div class="field" style="margin-bottom: 14px;">
            <label for="new-class-name">Class Name</label>
            <input
              id="new-class-name"
              v-model="newClassName"
              type="text"
              placeholder="e.g. Computing - Tutorial Group D"
              required
            />
          </div>

          <div class="field" style="margin-bottom: 18px;">
            <label for="new-class-desc">Description (Optional)</label>
            <textarea
              id="new-class-desc"
              v-model="newClassDescription"
              rows="3"
              placeholder="e.g. Thursday 2pm tutorial lab session"
            />
          </div>

          <div class="row" style="justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn" @click="showCreateModal = false">Cancel</button>
            <button type="submit" class="btn primary">Create Class</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: GENERATE JOIN CODE -->
    <div v-if="showGenerateCodeModal" class="modal-overlay" @click.self="showGenerateCodeModal = false">
      <div class="modal-card">
        <h3>Generate Student Join Code</h3>
        <p class="small muted">Create an enrolment code for students to join {{ selectedClass?.name }}.</p>

        <form @submit.prevent="handleGenerateCode($event)">
          <div class="field" style="margin-bottom: 14px;">
            <label for="code-usage">Usage Limit (Maximum redemptions)</label>
            <input
              id="code-usage"
              v-model.number="codeUsageLimit"
              type="number"
              min="1"
              max="200"
              placeholder="Leave blank or enter max students (e.g. 25)"
            />
            <span class="small muted">Maximum number of students who can join using this code.</span>
          </div>

          <div class="field" style="margin-bottom: 18px;">
            <label for="code-expiry">Expires After (Days)</label>
            <select id="code-expiry" v-model.number="codeExpiresDays">
              <option :value="3">3 Days</option>
              <option :value="7">7 Days</option>
              <option :value="14">14 Days (2 Weeks)</option>
              <option :value="30">30 Days (1 Month)</option>
              <option :value="0">Never Expires</option>
            </select>
          </div>

          <div class="row" style="justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn" @click="showGenerateCodeModal = false">Cancel</button>
            <button type="submit" class="btn primary">Generate Code</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.class-mgmt-container {
  max-width: 1040px;
  margin: 0 auto;
}
.classes-grid {
  display: grid;
  gap: 16px;
  /* min(): a card never forces the page wider than a 320px phone */
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  margin-top: 16px;
}
.class-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.class-card:hover {
  border-color: var(--accent);
}
.class-card.archived {
  opacity: 0.7;
  background: rgba(0, 0, 0, 0.02);
}
.class-stats-row {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.stat-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  background: var(--bg);
  border-radius: 6px;
  color: var(--muted);
}
.sub-tabs {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}
.sub-tab-btn {
  background: none;
  border: none;
  font: inherit;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
}
.sub-tab-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.code-badge-large {
  display: inline-block;
  font-family: monospace;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 2px;
  background: var(--panel);
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px dashed var(--good);
  color: var(--good);
  margin-left: 8px;
}
.code-badge-table {
  font-family: monospace;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--panel-sub, rgba(255, 255, 255, 0.05));
}
.empty-state {
  text-align: center;
  padding: 32px 16px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.data-table th, .data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.data-table th {
  color: var(--muted);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-card {
  background: var(--panel);
  border-radius: var(--radius);
  border: 1px solid var(--line);
  padding: 24px;
  width: 100%;
  max-width: 480px;
  box-shadow: var(--shadow);
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.student-name {
  color: var(--ink, inherit);
}
.student-profile td {
  background: var(--accent-soft);
}
</style>
