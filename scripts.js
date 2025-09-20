import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  setLogLevel,
  getDocs,
  query,
  where,
  limit,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY_PLACEHOLDER",
  authDomain: "agenda-pribadi-saya.firebaseapp.com",
  projectId: "agenda-pribadi-saya",
  storageBucket: "agenda-pribadi-saya.firebasestorage.app",
  messagingSenderId: "739991166893",
  appId: "1:739991166893:web:18136511a7c4cb988f8b24",
};

const appId = "personal-task-manager-app";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Tambahkan di bagian Firebase initialization
// console.log('Firebase API Key:', firebaseConfig.apiKey);
// console.log('Gemini API Key:', process.env.GEMINI_API_KEY);

let userId,
  tasksCollectionRef,
  unsubscribeFromTasks,
  logoutTimer,
  synth,
  panicLoop;
let loginMode = "change";
let isFirstDataLoad = true;
let currentDate = dayjs();
let selectedDate = dayjs().startOf("day");
let allTasks = [];
let audioInitialized = false;
let isMuted = false;
let panicTime = 5;

// Helper Functions
const elements = {
  loader: document.getElementById("loader"),
  appContainer: document.getElementById("app-container"),
  calendarGrid: document.getElementById("calendar-grid"),
  monthYearLabel: document.getElementById("month-year-label"),
  tasksHeader: document.getElementById("tasks-header"),
  tasksList: document.getElementById("tasks-list"),
  remindersList: document.getElementById("reminders-list"),
  historyList: document.getElementById("history-list"),
  taskModal: document.getElementById("task-modal"),
  taskModalContent: document.getElementById("task-modal-content"),
  taskForm: document.getElementById("task-form"),
  modalTitle: document.getElementById("modal-title"),
  taskIdInput: document.getElementById("task-id"),
  taskNameInput: document.getElementById("task-name"),
  taskDeadlineInput: document.getElementById("task-deadline"),
  taskCategoryInput: document.getElementById("task-category"),
  taskPriorityInput: document.getElementById("task-priority"),
  taskLinkInput: document.getElementById("task-link"),
  taskNotesInput: document.getElementById("task-notes"),
  deleteConfirmModal: document.getElementById("delete-confirm-modal"),
  deleteConfirmModalContent: document.getElementById(
    "delete-confirm-modal-content"
  ),
  loginModal: document.getElementById("login-modal"),
  loginModalContent: document.getElementById("login-modal-content"),
  loginForm: document.getElementById("login-form"),
  loginUserIdInput: document.getElementById("login-user-id"),
  idChoiceModal: document.getElementById("id-choice-modal"),
  idChoiceModalContent: document.getElementById("id-choice-modal-content"),
  initialTasksModal: document.getElementById("initial-tasks-modal"),
  initialTasksModalContent: document.getElementById(
    "initial-tasks-modal-content"
  ),
  historyCategoryFilter: document.getElementById("history-category-filter"),
  historyPriorityFilter: document.getElementById("history-priority-filter"),
  notificationBellBtn: document.getElementById("notification-bell-btn"),
  notificationBadge: document.getElementById("notification-badge"),
  notificationPopover: document.getElementById("notification-popover"),
  notificationPopoverList: document.getElementById("notification-popover-list"),
  limitModal: document.getElementById("limit-modal"),
  limitModalContent: document.getElementById("limit-modal-content"),
  logoutConfirmModal: document.getElementById("logout-confirm-modal"),
  logoutConfirmModalContent: document.getElementById(
    "logout-confirm-modal-content"
  ),
  firstTimeIdPromptModal: document.getElementById("first-time-id-prompt-modal"),
  firstTimeIdPromptModalContent: document.getElementById(
    "first-time-id-prompt-modal-content"
  ),
  settingsModal: document.getElementById("settings-modal"),
  settingsModalContent: document.getElementById("settings-modal-content"),
  settingsForm: document.getElementById("settings-form"),
  panicTimeInput: document.getElementById("panic-time-input"),
  statsContainer: document.getElementById("stats-container"),
  muteBtn: document.getElementById("mute-btn"),
  iconUnmuted: document.getElementById("icon-unmuted"),
  iconMuted: document.getElementById("icon-muted"),
  ghostAccountModal: document.getElementById("ghost-account-modal"),
  ghostAccountModalContent: document.getElementById(
    "ghost-account-modal-content"
  ),
  smartAddModal: document.getElementById("smart-add-modal"),
  smartAddModalContent: document.getElementById("smart-add-modal-content"),
  smartAddTextarea: document.getElementById("smart-add-textarea"),
  smartAddResultsContainer: document.getElementById(
    "smart-add-results-container"
  ),
  smartAddResults: document.getElementById("smart-add-results"),
};
let taskToDeleteId = null;

dayjs.extend(dayjs_plugin_localeData);
dayjs.locale("id");

const initAudio = async () => {
  if (audioInitialized) return;
  try {
    await Tone.start();
    synth = new Tone.Synth().toDestination();
    panicLoop = new Tone.Loop((time) => {
      synth.triggerAttackRelease("A5", "16n", time);
    }, "4n");
    audioInitialized = true;
  } catch (e) {
    console.error("Could not initialize audio:", e);
  }
};

let lastSoundTime = 0;
let soundQueue = [];
let isProcessingSound = false;

const playSound = (type) => {
  if (!audioInitialized || !synth || isMuted) return;

  // Add to queue instead of playing immediately
  soundQueue.push(type);
  processNextSound();
};

const processNextSound = () => {
  if (isProcessingSound || soundQueue.length === 0) return;

  isProcessingSound = true;
  const type = soundQueue.shift();

  try {
    // Always use a safe future time
    const safeTime = Tone.now() + 0.1;

    switch (type) {
      case "notification":
        synth.triggerAttackRelease("C5", "16n", safeTime);
        synth.triggerAttackRelease("E5", "16n", safeTime + 0.25);
        break;
      case "loginSuccess":
        synth.triggerAttackRelease("C4", "8n", safeTime);
        synth.triggerAttackRelease("E4", "8n", safeTime + 0.15);
        synth.triggerAttackRelease("G4", "8n", safeTime + 0.3);
        break;
      case "taskCreate":
        synth.triggerAttackRelease("C5", "16n", safeTime);
        break;
      case "taskComplete":
        synth.triggerAttackRelease("G4", "8n", safeTime);
        synth.triggerAttackRelease("C5", "8n", safeTime + 0.1);
        break;
      case "taskDelete":
        synth.triggerAttackRelease("C3", "8n", safeTime);
        break;
      case "logout":
        synth.triggerAttackRelease("G4", "8n", safeTime);
        synth.triggerAttackRelease("E4", "8n", safeTime + 0.15);
        synth.triggerAttackRelease("C4", "8n", safeTime + 0.3);
        break;
    }

    // Process next sound after delay
    setTimeout(() => {
      isProcessingSound = false;
      processNextSound();
    }, 500);
  } catch (audioError) {
    isProcessingSound = false;
    console.log("Audio skipped");
    processNextSound();
  }
};

// Fungsi untuk mendapatkan path collection yang benar
const getTasksCollectionPath = (dataKey) => {
  return collection(db, `artifacts/${appId}/tasks/${dataKey}/user_tasks`);
};

// Fungsi untuk mendapatkan path user document yang benar
const getUserDocPath = (customId) => {
  return doc(db, `artifacts/${appId}/users`, customId);
};

const renderCalendar = () => {
  const firstDayOfMonth = currentDate.startOf("month");
  const daysInMonth = currentDate.daysInMonth();
  const startDayOfWeek = firstDayOfMonth.day();
  elements.monthYearLabel.textContent = currentDate.format("MMMM YYYY");
  elements.calendarGrid.innerHTML = "";
  dayjs.weekdaysMin(true).forEach((day) => {
    elements.calendarGrid.innerHTML += `<div class="flex items-center justify-center h-10 font-semibold text-xs text-slate-500 dark:text-slate-400">${day}</div>`;
  });
  for (let i = 0; i < startDayOfWeek; i++) {
    elements.calendarGrid.innerHTML += "<div></div>";
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const date = currentDate.date(i);
    const dayEl = document.createElement("div");
    dayEl.className =
      "calendar-day relative flex items-center justify-center h-10 w-10 mx-auto text-sm rounded-full cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700";
    dayEl.textContent = i;
    dayEl.dataset.date = date.format("YYYY-MM-DD");
    if (allTasks.some((task) => dayjs(task.deadline).isSame(date, "day"))) {
      dayEl.classList.add("has-tasks");
    }
    if (date.isSame(dayjs(), "day")) {
      dayEl.classList.add("bg-red-500", "text-white", "font-bold");
    }
    if (date.isSame(selectedDate, "day")) {
      dayEl.classList.add("bg-primary", "text-primary-foreground");
    }
    dayEl.addEventListener("click", () => {
      selectedDate = date;
      renderAll();
    });
    elements.calendarGrid.appendChild(dayEl);
  }
};

const categoryColors = {
  Pekerjaan: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  Pribadi:
    "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  Belajar:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
  Lainnya:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
};

const priorityStyles = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

const createTaskElement = (task) => {
  const taskEl = document.createElement("div");
  taskEl.id = `task-card-${task.id}`;
  const priorityClass = priorityStyles[task.priority] || priorityStyles.medium;
  taskEl.className = `task-card flex items-start gap-3 p-3 rounded-lg border border-l-4 ${priorityClass} border-default transition-colors`;

  const deadline = dayjs(task.deadline);
  const categoryHTML = task.category
    ? `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${
        categoryColors[task.category] || categoryColors["Lainnya"]
      }">${task.category}</span>`
    : "";

  // Format waktu kerja
  const formatTime = (seconds) => {
    if (!seconds) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  };

  // Timer display
  const totalTime = task.totalTimeSpent || 0;
  const timerDisplayClass = task.isTimerRunning
    ? "timer-display text-xs font-mono bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-1 rounded animate-pulse"
    : "timer-display text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded";

  const timerHTML = `<span class="${timerDisplayClass}">${formatTime(
    totalTime
  )}</span>`;

  let completedText = "";
  if (task.completed && task.completedAt) {
    const completionTime = task.totalTimeSpent
      ? ` (${formatTime(task.totalTimeSpent)} total)`
      : "";
    completedText = `<div class="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="m9 12 2 2 4-4"/>
            </svg>
            Selesai: ${dayjs(task.completedAt).format(
              "D MMM, HH:mm"
            )}${completionTime}
        </div>`;
  }

  taskEl.innerHTML = `
        <input type="checkbox" id="task-${
          task.id
        }" class="mt-1.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${
    task.completed ? "checked" : ""
  }>
        <div class="flex-1">
            <label for="task-${task.id}" class="font-medium cursor-pointer">${
    task.name
  }</label>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <div class="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>${deadline.format("D MMM, HH:mm")}</span>
                </div>
                ${categoryHTML}
                ${timerHTML}
            </div>
            ${completedText}
            ${
              task.link
                ? `<a href="${task.link}" target="_blank" class="mt-2 text-xs text-blue-500 hover:underline flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>
                </svg>
                Lihat Tautan
            </a>`
                : ""
            }
        </div>
        <div class="flex items-center gap-1">
            <button class="timer-btn px-2 py-1 ${
              task.isTimerRunning
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            } text-white rounded text-xs" title="${
    task.isTimerRunning ? "Pause Timer" : "Kerjakan"
  }">
                ${
                  task.isTimerRunning
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
                }
            </button>
            <button class="edit-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" x2="22" y1="2" y2="6"/>
                    <path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z"/>
                </svg>
            </button>
            <button class="delete-btn p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" x2="10" y1="11" y2="17"/>
                    <line x1="14" x2="14" y1="11" y2="17"/>
                </svg>
            </button>
        </div>
    `;

  // Event listeners
  taskEl
    .querySelector('input[type="checkbox"]')
    .addEventListener("change", async (e) => {
      const isCompleted = e.target.checked;

      // Jika menyelesaikan tugas dan timer berjalan, pause timer dulu
      if (isCompleted && task.isTimerRunning) {
        await pauseTaskTimer(task.id);
        playSound("taskComplete");
      }

      await updateDoc(doc(tasksCollectionRef, task.id), {
        completed: isCompleted,
        completedAt: isCompleted ? new Date().toISOString() : null,
      });
    });

  taskEl.querySelector(".timer-btn").addEventListener("click", async () => {
    if (task.completed) {
      showNotification(
        "Tidak dapat menggunakan timer untuk tugas yang sudah selesai",
        "warn",
        "Timer Disabled"
      );
      return;
    }

    if (task.isTimerRunning) {
      await pauseTaskTimer(task.id);
    } else {
      await startTaskTimer(task.id);
    }
  });

  taskEl
    .querySelector(".edit-btn")
    .addEventListener("click", () => openTaskModal(task));
  taskEl
    .querySelector(".delete-btn")
    .addEventListener("click", () => openDeleteConfirmModal(task.id));

  return taskEl;
};

const renderTasks = () => {
  elements.tasksHeader.textContent = `Tugas untuk ${
    dayjs(selectedDate).isSame(dayjs(), "day")
      ? "Hari Ini"
      : selectedDate.format("D MMMM")
  }`;
  elements.tasksList.innerHTML = "";
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const tasksForSelectedDate = allTasks
    .filter((task) => dayjs(task.deadline).isSame(selectedDate, "day"))
    .sort((a, b) => {
      const priorityA = priorityOrder[a.priority || "medium"];
      const priorityB = priorityOrder[b.priority || "medium"];
      if (priorityA !== priorityB) return priorityA - priorityB;
      return new Date(a.deadline) - new Date(b.deadline);
    });
  if (tasksForSelectedDate.length === 0) {
    elements.tasksList.innerHTML = `<div class="text-center py-10"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto text-slate-400 dark:text-slate-500"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 14V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="m16 20 2 2 4-4"/></svg><p class="mt-4 text-slate-500 dark:text-slate-400">Tidak ada tugas untuk tanggal ini.</p></div>`;
  } else {
    tasksForSelectedDate.forEach((task) =>
      elements.tasksList.appendChild(createTaskElement(task))
    );
  }
};

const renderReminders = () => {
  elements.remindersList.innerHTML = "";
  const tasksForToday = allTasks
    .filter(
      (task) => dayjs(task.deadline).isSame(dayjs(), "day") && !task.completed
    )
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  if (tasksForToday.length === 0) {
    elements.remindersList.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Tidak ada pengingat untuk hari ini. Santai! 🥳</p>`;
  } else {
    tasksForToday.forEach((task) => {
      elements.remindersList.innerHTML += `<div class="flex items-center text-sm p-2 rounded-md bg-slate-100 dark:bg-slate-700/50"><div class="w-2 h-2 rounded-full bg-red-500 mr-3 flex-shrink-0"></div><div class="flex-1"><p class="font-medium text-slate-900 dark:text-white">${
        task.name
      }</p><p class="text-xs text-slate-500 dark:text-slate-400">Deadline: ${dayjs(
        task.deadline
      ).format("HH:mm")}</p></div></div>`;
    });
  }
};

const renderHistory = () => {
  elements.historyList.innerHTML = "";
  const searchTerm = document
    .getElementById("history-search")
    .value.toLowerCase();
  const statusFilter = document.getElementById("history-status-filter").value;
  const priorityFilter = elements.historyPriorityFilter.value;
  const categoryFilter = elements.historyCategoryFilter.value;

  const filteredTasks = allTasks
    .filter((task) => {
      const nameMatch = task.name.toLowerCase().includes(searchTerm);
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "completed" ? task.completed : !task.completed);
      const priorityMatch =
        priorityFilter === "all" ||
        (task.priority || "medium") === priorityFilter;
      const categoryMatch =
        categoryFilter === "all" || task.category === categoryFilter;
      return nameMatch && statusMatch && priorityMatch && categoryMatch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (filteredTasks.length === 0) {
    elements.historyList.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-4">Tidak ada riwayat tugas yang cocok.</p>`;
  } else {
    filteredTasks.forEach((task) =>
      elements.historyList.appendChild(createTaskElement(task))
    );
  }
};

const renderStatistics = () => {
  const total = allTasks.length;
  const completed = allTasks.filter((t) => t.completed).length;
  const pending = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Statistik waktu kerja
  const totalWorkTime = allTasks.reduce(
    (sum, task) => sum + (task.totalTimeSpent || 0),
    0
  );
  const avgTaskTime = completed > 0 ? Math.floor(totalWorkTime / completed) : 0;

  const formatWorkTime = (seconds) => {
    if (!seconds) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
  };

  elements.statsContainer.innerHTML = `
         <div class="flex justify-between items-center"><span>Total Tugas</span><span class="font-bold">${total}</span></div>
         <div class="flex justify-between items-center text-green-600 dark:text-green-400"><span>Selesai</span><span class="font-bold">${completed}</span></div>
         <div class="flex justify-between items-center text-amber-600 dark:text-amber-400"><span>Tertunda</span><span class="font-bold">${pending}</span></div>
         <div class="mt-2">
             <div class="flex justify-between mb-1"><span class="font-semibold">Progres</span><span>${percentage}%</span></div>
             <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${percentage}%"></div>
             </div>
         </div>
         <div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
             <div class="flex justify-between items-center text-sm">
                 <span>Total Waktu Kerja</span>
                 <span class="font-bold text-blue-600 dark:text-blue-400">${formatWorkTime(
                   totalWorkTime
                 )}</span>
             </div>
             ${
               avgTaskTime > 0
                 ? `
                 <div class="flex justify-between items-center text-sm text-slate-500">
                     <span>Rata-rata per Tugas</span>
                     <span>${formatWorkTime(avgTaskTime)}</span>
                 </div>
             `
                 : ""
             }
         </div>
    `;
};
const populateCategoryFilters = () => {
  const uniqueCategories = [
    ...new Set(allTasks.map((t) => t.category).filter(Boolean)),
  ];
  elements.historyCategoryFilter.innerHTML =
    '<option value="all">Semua Kategori</option>';
  uniqueCategories.forEach((cat) => {
    elements.historyCategoryFilter.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
};

const renderAll = () => {
  renderCalendar();
  renderTasks();
  renderReminders();
  renderHistory();
  renderStatistics();
  populateCategoryFilters();
  checkAndDisplayNotifications();
  initializeActiveTimers(); // Initialize timers
};

const openModal = (modal, content) => {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => content.classList.remove("scale-95", "opacity-0"), 10);
};
const closeModal = (modal, content) => {
  content.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }, 200);
};

const openTaskModal = (task = null) => {
  elements.taskForm.reset();
  if (task) {
    elements.modalTitle.textContent = "Edit Tugas";
    elements.taskIdInput.value = task.id;
    elements.taskNameInput.value = task.name;
    elements.taskDeadlineInput.value = dayjs(task.deadline).format(
      "YYYY-MM-DDTHH:mm"
    );
    elements.taskCategoryInput.value = task.category || "Pribadi";
    elements.taskPriorityInput.value = task.priority || "medium";
    elements.taskLinkInput.value = task.link || "";
    elements.taskNotesInput.value = task.notes || "";
  } else {
    elements.modalTitle.textContent = "Tambah Tugas Baru ✨";
    elements.taskIdInput.value = "";
    elements.taskDeadlineInput.value = selectedDate
      .hour(dayjs().hour())
      .minute(dayjs().minute())
      .second(0)
      .format("YYYY-MM-DDTHH:mm");
  }
  openModal(elements.taskModal, elements.taskModalContent);
};
const openDeleteConfirmModal = (id) => {
  taskToDeleteId = id;
  openModal(elements.deleteConfirmModal, elements.deleteConfirmModalContent);
};
const openInitialTasksModal = (tasks) => {
  const listEl = document.getElementById("initial-tasks-list");
  listEl.innerHTML = "";
  if (tasks.length > 0) {
    tasks.forEach((task) => listEl.appendChild(createTaskElement(task)));
  } else {
    listEl.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-4">Hebat! Tidak ada tugas untuk hari ini. 🙌</p>`;
  }
  openModal(elements.initialTasksModal, elements.initialTasksModalContent);
};

const logout = async () => {
  // Pause timer yang aktif sebelum logout
  if (currentWorkingTask) {
    await pauseTaskTimer(currentWorkingTask);
  }

  // Clear semua intervals
  activeTimers.forEach((intervalId) => clearInterval(intervalId));
  activeTimers.clear();

  if (unsubscribeFromTasks) unsubscribeFromTasks();
  playSound("logout");
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out: ", error);
  } finally {
    const creationCount = localStorage.getItem("newIdCreationCount");
    localStorage.clear();
    if (creationCount)
      localStorage.setItem("newIdCreationCount", creationCount);
    location.reload();
  }
};
const resetLogoutTimer = () => {
  clearTimeout(logoutTimer);
  logoutTimer = setTimeout(logout, 2 * 60 * 60 * 1000);
};

const openLoginModal = (mode = "change") => {
  loginMode = mode;
  const titleEl = elements.loginModal.querySelector("#login-modal-title");
  const descEl = elements.loginModal.querySelector("#login-modal-description");
  const btnTextEl = elements.loginModal.querySelector(
    "#save-user-id-btn .btn-text"
  );

  if (mode === "login") {
    titleEl.textContent = "Masuk dengan ID";
    descEl.textContent =
      "Masukkan User ID Anda yang sudah ada untuk memuat semua data tugas Anda.";
    btnTextEl.textContent = "Masuk";
  } else {
    // mode === 'change'
    titleEl.textContent = "Ganti ID Pengguna";
    descEl.textContent =
      "Pindahkan semua data Anda ke ID baru yang lebih mudah diingat. Proses ini tidak dapat diurungkan.";
    btnTextEl.textContent = "Simpan & Pindahkan Data";
  }
  openModal(elements.loginModal, elements.loginModalContent);
};

// Fungsi applyTheme yang diperbaiki
const applyTheme = (theme) => {
  localStorage.setItem("theme", theme);
  let effectiveTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.classList.toggle("dark", effectiveTheme === "dark");

  // Pastikan elemen tema ada sebelum mengaksesnya
  const updateThemeIcon = (iconId, shouldShow) => {
    const icon = document.getElementById(iconId);
    if (icon) {
      if (shouldShow) {
        icon.classList.remove("hidden");
      } else {
        icon.classList.add("hidden");
      }
    }
  };

  updateThemeIcon("theme-icon-sun", theme === "light");
  updateThemeIcon("theme-icon-moon", theme === "dark");
  updateThemeIcon("theme-icon-system", theme === "system");
};

// Event Listeners Setup
document.getElementById("prev-month-btn").addEventListener("click", () => {
  currentDate = currentDate.subtract(1, "month");
  renderCalendar();
});
document.getElementById("next-month-btn").addEventListener("click", () => {
  currentDate = currentDate.add(1, "month");
  renderCalendar();
});
document
  .getElementById("show-add-task-modal-btn")
  .addEventListener("click", () => openTaskModal());
document
  .getElementById("close-modal-btn")
  .addEventListener("click", () =>
    closeModal(elements.taskModal, elements.taskModalContent)
  );
elements.taskModal.addEventListener("click", (e) => {
  if (e.target === elements.taskModal)
    closeModal(elements.taskModal, elements.taskModalContent);
});
elements.taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = elements.taskIdInput.value;
  const taskData = {
    name: elements.taskNameInput.value,
    deadline: new Date(elements.taskDeadlineInput.value).toISOString(),
    link: elements.taskLinkInput.value || null,
    category: elements.taskCategoryInput.value,
    priority: elements.taskPriorityInput.value,
    notes: elements.taskNotesInput.value || null,
  };
  if (id) {
    await updateDoc(doc(tasksCollectionRef, id), taskData);
  } else {
    await addDoc(tasksCollectionRef, {
      ...taskData,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
    playSound("taskCreate");
  }
  closeModal(elements.taskModal, elements.taskModalContent);
});
document
  .getElementById("confirm-delete-btn")
  .addEventListener("click", async () => {
    if (taskToDeleteId) {
      await deleteDoc(doc(tasksCollectionRef, taskToDeleteId));
      playSound("taskDelete");
      closeModal(
        elements.deleteConfirmModal,
        elements.deleteConfirmModalContent
      );
    }
  });
document
  .getElementById("cancel-delete-btn")
  .addEventListener("click", () =>
    closeModal(elements.deleteConfirmModal, elements.deleteConfirmModalContent)
  );
document
  .getElementById("history-search")
  .addEventListener("input", renderHistory);
document
  .getElementById("history-status-filter")
  .addEventListener("change", renderHistory);
elements.historyPriorityFilter.addEventListener("change", renderHistory);
elements.historyCategoryFilter.addEventListener("change", renderHistory);

document
  .getElementById("switch-user-btn")
  .addEventListener("click", () => openLoginModal("change"));
document
  .getElementById("banner-change-id-btn")
  .addEventListener("click", () => openLoginModal("change"));

document.getElementById("copy-id-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(userId).then(() => {
    showNotification("User ID berhasil disalin!", "info", "Disalin!");
  });
});
document.getElementById("logout-btn").addEventListener("click", async () => {
  const isTemporaryId = auth.currentUser && userId === auth.currentUser.uid;
  if (isTemporaryId) {
    const tasksSnapshot = await getDocs(query(tasksCollectionRef, limit(1)));
    if (tasksSnapshot.empty) {
      openModal(elements.ghostAccountModal, elements.ghostAccountModalContent);
      return;
    }
  }
  document.getElementById("logout-confirm-user-id").textContent = userId;
  openModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent);
});
document
  .getElementById("close-logout-modal-btn")
  .addEventListener("click", () =>
    closeModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent)
  );
document.getElementById("logout-copy-id-btn").addEventListener("click", () => {
  navigator.clipboard.writeText(userId).then(() => {
    showNotification("ID berhasil disalin!", "info", "Disalin!");
  });
});
document
  .getElementById("logout-change-id-btn")
  .addEventListener("click", () => {
    closeModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent);
    openLoginModal("change");
  });
document.getElementById("confirm-logout-btn").addEventListener("click", logout);

document
  .getElementById("close-login-modal-btn")
  .addEventListener("click", () => {
    closeModal(elements.loginModal, elements.loginModalContent);
    if (!userId) {
      openModal(elements.idChoiceModal, elements.idChoiceModalContent);
    }
  });

elements.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("save-user-id-btn");
  const btnText = saveBtn.querySelector(".btn-text");
  const newUserId = elements.loginUserIdInput.value.trim();

  if (!newUserId || (loginMode === "change" && newUserId === userId)) {
    closeModal(elements.loginModal, elements.loginModalContent);
    return;
  }

  btnText.classList.add("opacity-0");
  if (!saveBtn.querySelector(".btn-spinner-overlay")) {
    const spinner = document.createElement("div");
    spinner.className = "btn-spinner-overlay";
    spinner.innerHTML = '<div class="btn-spinner"></div>';
    saveBtn.appendChild(spinner);
  }
  saveBtn.disabled = true;

  const reEnableButton = () => {
    btnText.classList.remove("opacity-0");
    const spinnerEl = saveBtn.querySelector(".btn-spinner-overlay");
    if (spinnerEl) spinnerEl.remove();
    saveBtn.disabled = false;
  };

  try {
    const userDocRef = getUserDocPath(newUserId);
    const userDocSnap = await getDoc(userDocRef);
    const currentUid = auth.currentUser.uid;

    if (loginMode === "login") {
      if (!userDocSnap.exists()) {
        showNotification(
          "User ID tidak ditemukan. Periksa kembali penulisan.",
          "danger",
          "Gagal Masuk"
        );
        reEnableButton();
        return;
      }

      // Update user document dengan session baru
      await updateDoc(userDocRef, {
        owner_uid: currentUid,
        last_login: new Date().toISOString(),
      });

      playSound("loginSuccess");
      setupUserData(currentUid, newUserId);
      closeModal(elements.loginModal, elements.loginModalContent);
    } else {
      // loginMode === 'change'
      if (userDocSnap.exists()) {
        showNotification(
          "User ID ini sudah digunakan. Silakan pilih yang lain.",
          "danger",
          "Gagal"
        );
        reEnableButton();
        return;
      }

      const oldDataKey = userId; // ID lama
      const newDataKey = newUserId; // ID baru

      // Buat dokumen user baru
      await setDoc(userDocRef, {
        owner_uid: currentUid,
        created_at: new Date().toISOString(),
      });

      // Migrasi data dan hapus data lama
      if (oldDataKey !== newDataKey) {
        const oldTasksRef = getTasksCollectionPath(oldDataKey);
        const newTasksRef = getTasksCollectionPath(newDataKey);

        try {
          const oldTasksSnapshot = await getDocs(oldTasksRef);

          if (!oldTasksSnapshot.empty) {
            // Pindahkan semua tasks ke lokasi baru
            const migrationPromises = oldTasksSnapshot.docs.map(
              async (taskDoc) => {
                await addDoc(newTasksRef, taskDoc.data());
              }
            );
            await Promise.all(migrationPromises);

            // Hapus tasks lama
            const deletionPromises = oldTasksSnapshot.docs.map((taskDoc) =>
              deleteDoc(doc(oldTasksRef, taskDoc.id))
            );
            await Promise.all(deletionPromises);

            console.log(
              `Migrated ${oldTasksSnapshot.docs.length} tasks from ${oldDataKey} to ${newDataKey}`
            );
          }

          // PERBAIKAN UTAMA: Hapus dokumen user lama
          // Hanya hapus jika oldDataKey bukan UID temporary (bukan sama dengan currentUid)
          if (oldDataKey !== currentUid) {
            const oldUserDocRef = getUserDocPath(oldDataKey);
            try {
              await deleteDoc(oldUserDocRef);
              console.log(`Deleted old user document: ${oldDataKey}`);
              showNotification(
                `ID berhasil diganti dari "${oldDataKey}" ke "${newDataKey}"`,
                "info",
                "ID Berhasil Diganti"
              );
            } catch (deleteError) {
              console.log(
                "Old user document might not exist or already deleted"
              );
            }
          }
        } catch (migrationError) {
          console.log("Migration error:", migrationError);
        }
      }

      playSound("loginSuccess");
      setupUserData(currentUid, newUserId);
      closeModal(elements.loginModal, elements.loginModalContent);
    }

    reEnableButton();
  } catch (error) {
    console.error("Process error:", error);
    showNotification("Terjadi kesalahan. Coba lagi.", "danger", "Error");
    reEnableButton();
  }
});

const handleIdChoice = () => {
  closeModal(elements.idChoiceModal, elements.idChoiceModalContent);
};
document.getElementById("create-new-id-btn").addEventListener("click", () => {
  const creationCount = parseInt(
    localStorage.getItem("newIdCreationCount") || "0"
  );
  if (creationCount >= 2) {
    openModal(elements.limitModal, elements.limitModalContent);
    return;
  }
  localStorage.setItem("newIdCreationCount", creationCount + 1);
  localStorage.removeItem("customUserId");
  handleIdChoice();
  onAuthStateChanged(
    auth,
    (user) => {
      if (user) setupUserData(user.uid, user.uid);
    },
    { onlyOnce: true }
  );
});
document.getElementById("use-existing-id-btn").addEventListener("click", () => {
  handleIdChoice();
  openLoginModal("login");
});
document
  .getElementById("close-initial-tasks-modal-btn")
  .addEventListener("click", () =>
    closeModal(elements.initialTasksModal, elements.initialTasksModalContent)
  );
document
  .getElementById("ok-initial-tasks-modal-btn")
  .addEventListener("click", () =>
    closeModal(elements.initialTasksModal, elements.initialTasksModalContent)
  );
document
  .getElementById("prompt-change-id-btn")
  .addEventListener("click", () => {
    closeModal(
      elements.firstTimeIdPromptModal,
      elements.firstTimeIdPromptModalContent
    );
    openLoginModal("change");
    sessionStorage.setItem("hasSeenChangeIdPrompt", "true");
  });
document.getElementById("prompt-keep-id-btn").addEventListener("click", () => {
  closeModal(
    elements.firstTimeIdPromptModal,
    elements.firstTimeIdPromptModalContent
  );
  sessionStorage.setItem("hasSeenChangeIdPrompt", "true");
});
document
  .getElementById("delete-ghost-session-btn")
  .addEventListener("click", () => {
    const creationCount = parseInt(
      localStorage.getItem("newIdCreationCount") || "0"
    );
    if (creationCount > 0) {
      localStorage.setItem("newIdCreationCount", creationCount - 1);
    }
    logout();
  });
document
  .getElementById("cancel-ghost-btn")
  .addEventListener("click", () =>
    closeModal(elements.ghostAccountModal, elements.ghostAccountModalContent)
  );

// Theme Switcher
const toggleThemeBtn = document.getElementById("toggle-theme-btn");
toggleThemeBtn.addEventListener("click", () => {
  const themes = ["light", "dark", "system"];
  const currentTheme = localStorage.getItem("theme") || "system";
  const currentIndex = themes.indexOf(currentTheme);
  const nextIndex = (currentIndex + 1) % themes.length;
  applyTheme(themes[nextIndex]);
});

// Notification Popover Logic
elements.notificationBellBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  elements.notificationPopover.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (
    !elements.notificationPopover.classList.contains("hidden") &&
    !elements.notificationPopover.contains(e.target) &&
    e.target !== elements.notificationBellBtn
  ) {
    elements.notificationPopover.classList.add("hidden");
  }
});

// Mute Button Logic
elements.muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  localStorage.setItem("isMuted", isMuted);
  updateMuteIcon();
  if (isMuted && panicLoop && panicLoop.state === "started") {
    Tone.Transport.stop();
    panicLoop.stop(0);
  }
});

const updateMuteIcon = () => {
  if (isMuted) {
    elements.iconUnmuted.classList.add("hidden");
    elements.iconMuted.classList.remove("hidden");
  } else {
    elements.iconUnmuted.classList.remove("hidden");
    elements.iconMuted.classList.add("hidden");
  }
};

// Settings Modal Logic
document.getElementById("settings-btn").addEventListener("click", () => {
  elements.panicTimeInput.value = panicTime;
  openModal(elements.settingsModal, elements.settingsModalContent);
});
document
  .getElementById("close-settings-modal-btn")
  .addEventListener("click", () =>
    closeModal(elements.settingsModal, elements.settingsModalContent)
  );
elements.settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const newTime = parseInt(elements.panicTimeInput.value);
  if (newTime && newTime > 0) {
    panicTime = newTime;
    localStorage.setItem("panicTime", panicTime);
    showNotification(
      `Waktu notifikasi panik diubah ke ${panicTime} menit.`,
      "info",
      "Pengaturan Disimpan"
    );
  }
  closeModal(elements.settingsModal, elements.settingsModalContent);
});

// WORK TIMER FUNCTIONALITY
let activeTimers = new Map(); // taskId -> intervalId
let currentWorkingTask = null;

// Start timer untuk tugas
const startTaskTimer = async (taskId) => {
  // Stop timer lain yang berjalan
  if (currentWorkingTask && currentWorkingTask !== taskId) {
    await pauseTaskTimer(currentWorkingTask);
  }

  currentWorkingTask = taskId;
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  // Update task data
  const updateData = {
    isTimerRunning: true,
    currentSessionStart: new Date().toISOString(),
  };

  await updateDoc(doc(tasksCollectionRef, taskId), updateData);

  // Start interval timer untuk update display
  const intervalId = setInterval(() => {
    updateTimerDisplay(taskId);
  }, 1000);

  activeTimers.set(taskId, intervalId);
  showNotification(`Timer dimulai untuk: ${task.name}`, "info", "Mulai Kerja");
  playSound("taskCreate");
};

// Pause timer
const pauseTaskTimer = async (taskId) => {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.isTimerRunning) return;

  // Hitung durasi sesi
  const sessionStart = new Date(task.currentSessionStart);
  const sessionEnd = new Date();
  const sessionDuration = Math.floor((sessionEnd - sessionStart) / 1000);

  // Update task data
  const sessions = task.sessions || [];
  sessions.push({
    start: task.currentSessionStart,
    end: sessionEnd.toISOString(),
    duration: sessionDuration,
  });

  const updateData = {
    isTimerRunning: false,
    currentSessionStart: null,
    totalTimeSpent: (task.totalTimeSpent || 0) + sessionDuration,
    sessions: sessions,
  };

  await updateDoc(doc(tasksCollectionRef, taskId), updateData);

  // Clear interval
  const intervalId = activeTimers.get(taskId);
  if (intervalId) {
    clearInterval(intervalId);
    activeTimers.delete(taskId);
  }

  currentWorkingTask = null;

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);

    const formatTime = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
    };

    showNotification(
      `Timer dihentikan. Durasi sesi: ${formatTime(sessionDuration)}`,
      "info",
      "Timer Paused"
    );
  };
};

// Update timer display real-time
const updateTimerDisplay = (taskId) => {
  const task = allTasks.find((t) => t.id === taskId);
  if (!task || !task.isTimerRunning) return;

  const sessionStart = new Date(task.currentSessionStart);
  const now = new Date();
  const currentSessionTime = Math.floor((now - sessionStart) / 1000);
  const totalTime = (task.totalTimeSpent || 0) + currentSessionTime;

  const formatTime = (seconds) => {
    if (!seconds) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  };

  const timerDisplay = document.querySelector(
    `#task-card-${taskId} .timer-display`
  );
  if (timerDisplay) {
    timerDisplay.textContent = formatTime(totalTime);
  }
};

// Initialize active timers saat load data
const initializeActiveTimers = () => {
  allTasks.forEach((task) => {
    if (task.isTimerRunning) {
      const intervalId = setInterval(() => {
        updateTimerDisplay(task.id);
      }, 1000);
      activeTimers.set(task.id, intervalId);
      currentWorkingTask = task.id;
    }
  });
};

const setupUserData = (realUid, customId = null) => {
  if (unsubscribeFromTasks) unsubscribeFromTasks();
  isFirstDataLoad = true;

  userId = customId || realUid;
  localStorage.setItem("realUid", realUid);
  if (customId) {
    localStorage.setItem("customUserId", customId);
  }

  document.getElementById("user-id-display").textContent = userId;

  const changeIdBanner = document.getElementById("change-id-banner");
  const isTemporaryId = !customId || userId === realUid;
  if (changeIdBanner) {
    changeIdBanner.classList.toggle("hidden", !isTemporaryId);
  }

  // PERBAIKAN UTAMA: Gunakan customId untuk path data, bukan realUid
  const dataKey = customId || realUid;
  tasksCollectionRef = collection(
    db,
    `artifacts/${appId}/tasks/${dataKey}/user_tasks`
  );

  unsubscribeFromTasks = onSnapshot(
    tasksCollectionRef,
    (snapshot) => {
      allTasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAll();
      if (isFirstDataLoad) {
        const hasSeenPrompt = sessionStorage.getItem("hasSeenChangeIdPrompt");
        if (isTemporaryId && !hasSeenPrompt) {
          openModal(
            elements.firstTimeIdPromptModal,
            elements.firstTimeIdPromptModalContent
          );
        }
        showInitialAlerts();
        isFirstDataLoad = false;
        elements.loader.style.opacity = "0";
        setTimeout(() => {
          elements.loader.style.display = "none";
          elements.appContainer.classList.remove("opacity-0");
        }, 300);
      }
    },
    (error) => {
      console.error("Error fetching tasks:", error);
      allTasks = [];
      renderAll();
    }
  );
  resetLogoutTimer();
};
setInterval(() => {
  document.getElementById(
    "realtime-clock"
  ).textContent = `WIB: ${dayjs().format("HH:mm:ss")}`;
}, 1000);

const showNotification = (message, type = "warn", title = "Peringatan") => {
  playSound("notification");
  const container = document.getElementById("notification-container");
  const notif = document.createElement("div");
  notif.className = `notification ${type}`;
  notif.innerHTML = `<p class="font-bold text-sm">${title}</p><p class="text-sm">${message}</p>`;
  container.appendChild(notif);
  setTimeout(() => notif.classList.add("show"), 10);
  setTimeout(() => {
    notif.classList.remove("show");
    setTimeout(() => notif.remove(), 500);
  }, 5000);
};

const checkAndDisplayNotifications = () => {
  const now = dayjs();
  const sixHoursFromNow = now.add(6, "hour");
  const upcomingTasks = allTasks.filter(
    (task) =>
      !task.completed &&
      dayjs(task.deadline).isAfter(now) &&
      dayjs(task.deadline).isBefore(sixHoursFromNow)
  );

  if (upcomingTasks.length > 0) {
    elements.notificationBadge.textContent = upcomingTasks.length;
    elements.notificationBadge.classList.remove("hidden");
  } else {
    elements.notificationBadge.classList.add("hidden");
  }

  elements.notificationPopoverList.innerHTML = "";
  if (upcomingTasks.length === 0) {
    elements.notificationPopoverList.innerHTML = `<p class="p-4 text-sm text-slate-500 dark:text-slate-400 text-center">Tidak ada deadline dalam waktu dekat.</p>`;
  } else {
    upcomingTasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = "p-3 border-t border-default";
      item.dataset.deadline = task.deadline;
      item.innerHTML = `
                        <p class="font-semibold text-sm">${task.name}</p>
                        <p class="countdown-timer text-xs font-mono text-slate-500 dark:text-slate-400"></p>
                    `;
      elements.notificationPopoverList.appendChild(item);
    });
  }
};

const updateTimers = () => {
  let inPanicMode = false;
  const now = dayjs();

  // Update countdowns in popover
  document
    .querySelectorAll("#notification-popover-list [data-deadline]")
    .forEach((el) => {
      const deadline = dayjs(el.dataset.deadline);
      if (deadline.isBefore(now)) {
        el.remove();
        checkAndDisplayNotifications();
        return;
      }
      const diff = deadline.diff(now);
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const countdownEl = el.querySelector(".countdown-timer");
      if (countdownEl) {
        countdownEl.textContent = `Sisa Waktu: ${String(hours).padStart(
          2,
          "0"
        )}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
          2,
          "0"
        )}`;
      }
    });

  // Check for panic mode tasks
  document
    .querySelectorAll(".task-card")
    .forEach((card) => card.classList.remove("is-panicking"));

  const panicTasks = allTasks.filter(
    (task) =>
      !task.completed &&
      dayjs(task.deadline).isAfter(now) &&
      dayjs(task.deadline).diff(now, "minute") < panicTime
  );

  if (panicTasks.length > 0) {
    inPanicMode = true;
    panicTasks.forEach((task) => {
      const card = document.getElementById(`task-card-${task.id}`);
      if (card) card.classList.add("is-panicking");
    });
  }

  if (inPanicMode && !isMuted && panicLoop && panicLoop.state !== "started") {
    Tone.Transport.start();
    panicLoop.start(0);
  } else if (
    (!inPanicMode || isMuted) &&
    panicLoop &&
    panicLoop.state === "started"
  ) {
    Tone.Transport.stop();
    panicLoop.stop(0);
  }
};
setInterval(updateTimers, 1000);

const showInitialAlerts = () => {
  const today = dayjs();
  const todaysTasks = allTasks.filter(
    (task) => dayjs(task.deadline).isSame(today, "day") && !task.completed
  );
  const overdueTasks = allTasks.filter(
    (task) => dayjs(task.deadline).isBefore(today, "day") && !task.completed
  );
  if (todaysTasks.length > 0) {
    openInitialTasksModal(todaysTasks);
  }
  if (overdueTasks.length > 0) {
    showNotification(
      `Anda memiliki ${overdueTasks.length} tugas yang sudah lewat dari deadline.`,
      "danger",
      "Tugas Terlewat!"
    );
  }
  checkAndDisplayNotifications();
};

// --- Gemini API Functions ---
const callGeminiForText = async (prompt) => {
  const apiKey = "YOUR_GEMINI_API_KEY_PLACEHOLDER";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(`API call failed with status: ${response.status}`);
  const result = await response.json();
  if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
    return result.candidates[0].content.parts[0].text;
  } else {
    console.warn("Tidak ada konten yang diterima dari Gemini API", result);
    return null;
  }
};

const callGeminiForSmartAdd = async (prompt) => {
  const apiKey = "YOUR_GEMINI_API_KEY_PLACEHOLDER";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            deadline: { type: "STRING" },
          },
          required: ["name", "deadline"],
        },
      },
    },
  };
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(`API call failed with status: ${response.status}`);
  const result = await response.json();
  if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
    try {
      return JSON.parse(result.candidates[0].content.parts[0].text);
    } catch (e) {
      console.error("Gagal mem-parsing JSON dari Gemini:", e);
      throw new Error("Respons JSON tidak valid dari API.");
    }
  } else {
    console.warn("Tidak ada konten yang diterima dari Gemini API", result);
    return null;
  }
};

const handleGenerateNotes = async (buttonEl) => {
  const taskName = elements.taskNameInput.value;
  if (!taskName) {
    showNotification(
      "Harap masukkan nama tugas terlebih dahulu.",
      "warn",
      "Nama Tugas Kosong"
    );
    return;
  }

  const originalText = buttonEl.innerHTML;
  buttonEl.innerHTML =
    '<div class="btn-spinner" style="width:14px; height:14px; border-width:2px;"></div> Generating...';
  buttonEl.disabled = true;

  const prompt = `Buatlah rencana aksi atau checklist langkah-demi-langkah dalam poin-poin singkat untuk tugas ini. Berikan jawaban HANYA sebagai teks biasa (plain text), tanpa judul, dan gunakan format penomoran (1., 2., 3., dst.) untuk setiap langkah. Tugas: "${taskName}"`;

  try {
    const generatedNotes = await callGeminiForText(prompt);
    if (generatedNotes) {
      elements.taskNotesInput.value = generatedNotes;
      showNotification(
        "Rencana aksi berhasil dibuat!",
        "info",
        "✨ AI Berhasil"
      );
    } else {
      showNotification("AI tidak dapat membuat rencana.", "warn", "Gagal");
    }
  } catch (error) {
    console.error("Error generating notes:", error);
    showNotification(
      "Gagal menghubungi AI. Coba lagi nanti.",
      "danger",
      "Error"
    );
  } finally {
    buttonEl.innerHTML = originalText;
    buttonEl.disabled = false;
  }
};

const handleSmartAdd = async (buttonEl) => {
  const text = elements.smartAddTextarea.value;
  if (!text.trim()) {
    showNotification("Harap masukkan teks terlebih dahulu.", "warn");
    return;
  }

  const originalText = buttonEl.innerHTML;
  buttonEl.innerHTML = '<div class="btn-spinner"></div>';
  buttonEl.disabled = true;

  const prompt = `Analisis teks berikut dan ekstrak tugas-tugas yang dapat ditindaklanjuti. Untuk setiap tugas, identifikasi nama tugas dan deadline jika disebutkan dengan bahasa yang bagus dan huruf yang besar kecilnya sesuai. Jika tidak ada deadline, gunakan tanggal dan waktu saat ini (${dayjs().format()}). Kembalikan hasilnya HANYA dalam format array JSON dari objek. Setiap objek harus memiliki properti "name" (string) dan "deadline" (string dalam format YYYY-MM-DDTHH:mm). Teks untuk dianalisis: "${text}"`;

  try {
    const suggestedTasks = await callGeminiForSmartAdd(prompt);
    if (suggestedTasks && suggestedTasks.length > 0) {
      renderSuggestedTasks(suggestedTasks);
      elements.smartAddResultsContainer.classList.remove("hidden");
    } else {
      showNotification(
        "Tidak ada tugas yang dapat ditemukan dalam teks.",
        "info"
      );
      elements.smartAddResultsContainer.classList.add("hidden");
    }
  } catch (error) {
    console.error("Error with Smart Add:", error);
    showNotification("Gagal menghubungi AI untuk memproses teks.", "danger");
  } finally {
    buttonEl.innerHTML = originalText;
    buttonEl.disabled = false;
  }
};

const renderSuggestedTasks = (tasks) => {
  elements.smartAddResults.innerHTML = "";
  tasks.forEach((task, index) => {
    const taskEl = document.createElement("div");
    taskEl.className =
      "suggested-task-item flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-700 rounded-md";
    taskEl.innerHTML = `
                    <input type="checkbox" id="suggested-task-${index}" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked>
                    <div class="flex-1">
                        <input type="text" value="${
                          task.name
                        }" class="w-full bg-transparent font-medium text-sm p-1 rounded focus:bg-white dark:focus:bg-slate-800 outline-none">
                        <input type="datetime-local" value="${dayjs(
                          task.deadline
                        ).format(
                          "YYYY-MM-DDTHH:mm"
                        )}" class="w-full bg-transparent text-xs text-slate-500 dark:text-slate-400 p-1 rounded focus:bg-white dark:focus:bg-slate-800 outline-none">
                    </div>
                `;
    elements.smartAddResults.appendChild(taskEl);
  });
};

// Initial Load
window.addEventListener("load", () => {
  document
    .getElementById("generate-notes-btn")
    .addEventListener("click", (e) => handleGenerateNotes(e.currentTarget));
  document
    .getElementById("show-smart-add-modal-btn")
    .addEventListener("click", () => {
      elements.smartAddResultsContainer.classList.add("hidden");
      elements.smartAddTextarea.value = "";
      openModal(elements.smartAddModal, elements.smartAddModalContent);
    });
  document
    .getElementById("close-smart-add-modal-btn")
    .addEventListener("click", () =>
      closeModal(elements.smartAddModal, elements.smartAddModalContent)
    );
  document
    .getElementById("process-text-btn")
    .addEventListener("click", (e) => handleSmartAdd(e.currentTarget));
  document
    .getElementById("add-selected-tasks-btn")
    .addEventListener("click", async () => {
      const selectedTasks = [];
      const taskElements = elements.smartAddResults.querySelectorAll(
        ".suggested-task-item"
      );
      taskElements.forEach((el) => {
        const checkbox = el.querySelector('input[type="checkbox"]');
        if (checkbox && checkbox.checked) {
          const name = el.querySelector('input[type="text"]').value;
          const deadline = el.querySelector(
            'input[type="datetime-local"]'
          ).value;
          selectedTasks.push({ name, deadline });
        }
      });

      if (selectedTasks.length === 0) {
        showNotification(
          "Pilih setidaknya satu tugas untuk ditambahkan.",
          "warn"
        );
        return;
      }

      const creationPromises = selectedTasks.map((task) => {
        const newTask = {
          name: task.name,
          deadline: new Date(task.deadline).toISOString(),
          category: "Pribadi",
          priority: "medium",
          link: null,
          notes: null,
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
        };
        return addDoc(tasksCollectionRef, newTask);
      });

      await Promise.all(creationPromises);
      showNotification(
        `${selectedTasks.length} tugas berhasil ditambahkan!`,
        "info",
        "✨ Sukses"
      );
      closeModal(elements.smartAddModal, elements.smartAddModalContent);
    });

  const initialTheme = localStorage.getItem("theme") || "system";
  applyTheme(initialTheme);
  isMuted = localStorage.getItem("isMuted") === "true";
  panicTime = parseInt(localStorage.getItem("panicTime")) || 5;
  updateMuteIcon();

  document.body.addEventListener("click", initAudio, { once: true });
  document.body.addEventListener("keydown", initAudio, { once: true });

  let deferredPrompt;
  const installBtn = document.getElementById("install-btn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
    installBtn.onclick = () => {
      installBtn.classList.add("hidden");
      deferredPrompt.prompt();
    };
  });

  signInAnonymously(auth)
    .then(() => {
      const customUserId = localStorage.getItem("customUserId");
      const realUid = localStorage.getItem("realUid") || auth.currentUser.uid;

      if (customUserId) {
        setupUserData(realUid, customUserId);
      } else {
        elements.loader.style.opacity = "0";
        setTimeout(() => {
          elements.loader.style.display = "none";
        }, 300);
        openModal(elements.idChoiceModal, elements.idChoiceModalContent);
      }
    })
    .catch((error) => {
      console.error("Gagal login anonim:", error);
      elements.loader.innerText = "Gagal terhubung. Silakan refresh.";
    });

  ["click", "mousemove", "keydown"].forEach((event) =>
    document.addEventListener(event, resetLogoutTimer)
  );
});

// POMODORO TIMER
let pomodoroTimer = null;
let pomodoroTime = 25 * 60;
let isWorkMode = true;
let pomodoroRunning = false;

const updatePomodoroDisplay = () => {
  const minutes = Math.floor(pomodoroTime / 60);
  const seconds = pomodoroTime % 60;
  const display = document.getElementById("pomodoro-display");
  if (display) {
    display.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
};

const startPomodoro = () => {
  if (pomodoroRunning) return;
  pomodoroRunning = true;

  pomodoroTimer = setInterval(() => {
    pomodoroTime--;
    updatePomodoroDisplay();

    if (pomodoroTime <= 0) {
      clearInterval(pomodoroTimer);
      pomodoroRunning = false;
      playSound("notification");

      const message = isWorkMode
        ? "Waktu kerja selesai! Waktunya istirahat 5 menit."
        : "Waktu istirahat selesai! Kembali fokus bekerja.";
      showNotification(message, "info", "Pomodoro");

      pomodoroTime = isWorkMode ? 5 * 60 : 25 * 60;
      isWorkMode = !isWorkMode;
      updatePomodoroDisplay();

      // Update mode buttons
      document
        .getElementById("work-mode")
        .classList.toggle("bg-blue-100", isWorkMode);
      document
        .getElementById("break-mode")
        .classList.toggle("bg-blue-100", !isWorkMode);
    }
  }, 1000);
};

// Event listeners untuk fitur baru
document.addEventListener("DOMContentLoaded", () => {
  // Pomodoro controls
  const startBtn = document.getElementById("pomodoro-start");
  const pauseBtn = document.getElementById("pomodoro-pause");
  const resetBtn = document.getElementById("pomodoro-reset");

  if (startBtn) startBtn.addEventListener("click", startPomodoro);
  if (pauseBtn)
    pauseBtn.addEventListener("click", () => {
      if (pomodoroRunning) {
        clearInterval(pomodoroTimer);
        pomodoroRunning = false;
      } else {
        startPomodoro();
      }
    });
  if (resetBtn)
    resetBtn.addEventListener("click", () => {
      clearInterval(pomodoroTimer);
      pomodoroRunning = false;
      pomodoroTime = 25 * 60;
      isWorkMode = true;
      updatePomodoroDisplay();
    });

  // Template buttons
  document.querySelectorAll(".template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const templateType = btn.dataset.template;
      const template = taskTemplates[templateType];
      if (template) {
        elements.taskNameInput.value = template.name;
        elements.taskCategoryInput.value = template.category;
        elements.taskPriorityInput.value = template.priority;
        openTaskModal();
      }
    });
  });
});
