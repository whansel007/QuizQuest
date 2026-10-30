<script setup>
// ============================================================
// Professor Class Management View (Task 1B)
// Create/edit classes, soft-archive, manage rosters,
// and generate/revoke student join codes.
// ============================================================
import { ref, onMounted, computed } from 'vue';
import { api } from '../api.js';
import { toast, action } from '../ui.js';
import { loadCourses } from './courses.js';
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
const newlyGeneratedCode = ref(null);

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
  showGenerateCodeModal.value = false;
  toast(`New join code generated: ${res.code}`);
  await loadClassDetails(selectedClass.value);
  await loadData();
});

const handleRevokeCode = (code) => action(async () => {
  if (!confirm('Are you sure you want to revoke this join code? Students will no longer be able to use it.')) return;
  await api('DELETE', `/api/classes/${selectedClass.value.id}/join-codes/${code.id}`);
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
      <div class="panel row" style="justify-content: space-between; align-items: center;">
        <span class="muted small">
          Showing {{ displayedClasses.length }} {{ showArchived ? 'total' : 'active' }} classes
        </span>
        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
          <input v-model="showArchived" type="checkbox" />
          Show archived classes
        </label>
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
          v-for="c in displayedClasses"
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
          </div>

          <div class="row" style="margin-top: 16px; justify-content: space-between;">
            <button class="btn small primary" @click="selectClassToManage(c)">
              Manage Roster & Codes →
            </button>
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
            @click="activeTab = 'roster'"
          >
            Student Roster ({{ roster.length }})
          </button>
          <button
            type="button"
            :class="['sub-tab-btn', { active: activeTab === 'codes' }]"
            @click="activeTab = 'codes'"
          >
            Join Codes ({{ joinCodes.filter((c) => !c.revoked && !c.isExpired).length }})
          </button>
        </div>
      </div>

      <!-- NEW CODE SUCCESS BANNER -->
      <div v-if="newlyGeneratedCode" class="panel good" style="background: var(--good-soft); border-color: var(--good);">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <b style="color: var(--good);">New Join Code Generated:</b>
            <span class="code-badge-large">{{ newlyGeneratedCode }}</span>
            <p class="small muted" style="margin: 4px 0 0;">
              Share this code with your students. They can redeem it on their student practice dashboard to enroll!
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
            <p class="muted small">Students enter these unpredictable codes to self-enroll in this class.</p>
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
              <tr v-for="c in joinCodes" :key="c.id">
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <code class="code-badge-table">{{ c.code || c.id }}</code>
                    <button
                      v-if="c.code && !c.revoked && !c.isExpired"
                      type="button"
                      class="btn small"
                      style="padding: 2px 8px; font-size: 11px;"
                      @click="copyToClipboard(c.code)"
                    >
                      Copy
                    </button>
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
