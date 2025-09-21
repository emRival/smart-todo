 import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
      import {
        getAuth,
        onAuthStateChanged,
        signOut,
        GoogleAuthProvider,
        signInWithPopup,
      } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
      import {
        getFirestore,
        collection,
        onSnapshot,
        addDoc,
        doc,
        updateDoc,
        deleteDoc,
      } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

      let userId,
        tasksCollectionRef,
        unsubscribeFromTasks,
        logoutTimer,
        synth,
        panicLoop;
      let isFirstDataLoad = true;
      let currentDate = dayjs();
      let selectedDate = dayjs().startOf("day");
      let allTasks = [];
      let audioInitialized = false;
      let isMuted = false;
      let panicTime = 5;

      const elements = {
        loader: document.getElementById("loader"),
        loginContainer: document.getElementById("login-container"), 
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
        deleteConfirmModalContent: document.getElementById("delete-confirm-modal-content"),
        historyCategoryFilter: document.getElementById("history-category-filter"),
        historyPriorityFilter: document.getElementById("history-priority-filter"),
        notificationBellBtn: document.getElementById("notification-bell-btn"),
        notificationBadge: document.getElementById("notification-badge"),
        notificationPopover: document.getElementById("notification-popover"),
        notificationPopoverList: document.getElementById("notification-popover-list"),
        logoutConfirmModal: document.getElementById("logout-confirm-modal"),
        logoutConfirmModalContent: document.getElementById("logout-confirm-modal-content"),
        settingsModal: document.getElementById("settings-modal"),
        settingsModalContent: document.getElementById("settings-modal-content"),
        settingsForm: document.getElementById("settings-form"),
        panicTimeInput: document.getElementById("panic-time-input"),
        statsContainer: document.getElementById("stats-container"),
        muteBtn: document.getElementById("mute-btn"),
        iconUnmuted: document.getElementById("icon-unmuted"),
        iconMuted: document.getElementById("icon-muted"),
        smartAddModal: document.getElementById("smart-add-modal"),
        smartAddModalContent: document.getElementById("smart-add-modal-content"),
        smartAddTextarea: document.getElementById("smart-add-textarea"),
        smartAddResultsContainer: document.getElementById("smart-add-results-container"),
        smartAddResults: document.getElementById("smart-add-results"),
        todaysTasksModal: document.getElementById("todays-tasks-modal"),
        todaysTasksModalContent: document.getElementById("todays-tasks-modal-content"),
      };
      let taskToDeleteId = null;

      dayjs.extend(dayjs_plugin_localeData);
      dayjs.locale("id");
      
      const initAudio = () => {
        if (audioInitialized) return;
        try {
            Tone.start().then(() => {
                synth = new Tone.Synth().toDestination();
                panicLoop = new Tone.Loop((time) => {
                    synth.triggerAttackRelease("A5", "16n", time);
                }, "4n");
                audioInitialized = true;
                console.log("Audio initialized successfully");
            }).catch((e) => {
                console.error("Failed to start Tone.js:", e);
            });
        } catch (e) {
            console.error("Could not initialize audio:", e);
        }
      };

      const playSound = (type) => {
        if (!audioInitialized) { initAudio(); return; }
        if (!synth || isMuted) return;
        try {
            const now = Tone.now();
            switch (type) {
                case "notification": synth.triggerAttackRelease("C5", "16n", now); synth.triggerAttackRelease("E5", "16n", now + 0.1); break;
                case "loginSuccess": synth.triggerAttackRelease("C4", "8n", now); synth.triggerAttackRelease("E4", "8n", now + 0.1); synth.triggerAttackRelease("G4", "8n", now + 0.2); break;
                case "taskCreate": synth.triggerAttackRelease("C5", "16n", now); break;
                case "taskComplete": synth.triggerAttackRelease("G4", "8n", now); synth.triggerAttackRelease("C5", "8n", now + 0.1); break;
                case "taskDelete": synth.triggerAttackRelease("C3", "8n", now); break;
                case "logout": synth.triggerAttackRelease("G4", "8n", now); synth.triggerAttackRelease("E4", "8n", now + 0.1); synth.triggerAttackRelease("C4", "8n", now + 0.2); break;
            }
        } catch (audioError) {
            console.log("Audio error:", audioError);
            audioInitialized = false;
            initAudio();
        }
      };

      const getTasksCollectionPath = (uid) => {
          return collection(db, `artifacts/${appId}/tasks/${uid}/user_tasks`);
      };
      
      const renderCalendar = () => {
        const firstDayOfMonth = currentDate.startOf("month");
        const daysInMonth = currentDate.daysInMonth();
        const startDayOfWeek = firstDayOfMonth.day();
        elements.monthYearLabel.textContent = currentDate.format("MMMM YYYY");
        elements.calendarGrid.innerHTML = "";
        dayjs.weekdaysMin(true).forEach((day) => {
            elements.calendarGrid.innerHTML += `<div class="flex items-center justify-center h-10 font-semibold text-[0.6rem] sm:text-xs text-slate-500 dark:text-slate-400">${day}</div>`;
        });
        for (let i = 0; i < startDayOfWeek; i++) {
            elements.calendarGrid.innerHTML += "<div></div>";
        }
        for (let i = 1; i <= daysInMonth; i++) {
            const date = currentDate.date(i);
            const dayEl = document.createElement("div");
            dayEl.className = "calendar-day relative flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 mx-auto text-sm rounded-full cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700";
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
        Pribadi: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
        Belajar: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
        Lainnya: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
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
        taskEl.className = `task-card flex items-start gap-3 p-3 rounded-lg border border-l-4 ${priorityClass} border-default transition-all duration-300`;
        const deadline = dayjs(task.deadline);
        const categoryHTML = task.category ? `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${categoryColors[task.category] || categoryColors["Lainnya"]}">${task.category}</span>` : "";
        const formatTime = (seconds) => {
            if (!seconds) return "0:00";
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            } else {
                return `${minutes}:${secs.toString().padStart(2, "0")}`;
            }
        };
        const totalTime = task.totalTimeSpent || 0;
        const timerDisplayClass = task.isTimerRunning ? "timer-display text-xs font-mono bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-1 rounded animate-pulse" : "timer-display text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded";
        const timerHTML = `<span class="${timerDisplayClass}">${formatTime(totalTime)}</span>`;
        let completedText = "";
        if (task.completed && task.completedAt) {
            const completionTime = task.totalTimeSpent ? ` (${formatTime(task.totalTimeSpent)} total)` : "";
            completedText = `<div class="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                </svg>
                Selesai: ${dayjs(task.completedAt).format("D MMM, HH:mm")}${completionTime}
            </div>`;
        }
        taskEl.innerHTML = `
            <input type="checkbox" id="task-${task.id}" class="mt-1.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" ${task.completed ? "checked" : ""}>
            <div class="flex-1">
                <label for="task-${task.id}" class="font-medium cursor-pointer">${task.name}</label>
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
                ${task.link ? `<a href="${task.link}" target="_blank" class="mt-2 text-xs text-blue-500 hover:underline flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/>
                    </svg>
                    Lihat Tautan
                </a>` : ""}
            </div>
            <div class="flex items-center gap-1">
                <button class="timer-btn px-2 py-1 ${task.isTimerRunning ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"} text-white rounded text-xs" title="${task.isTimerRunning ? "Pause Timer" : "Kerjakan"}">
                    ${task.isTimerRunning ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'}
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
        taskEl.querySelector('input[type="checkbox"]').addEventListener("change", async (e) => {
            const isCompleted = e.target.checked;
            if (isCompleted && task.isTimerRunning) {
                await pauseTaskTimer(task.id);
            }
            // Trigger sound only when completing, not un-completing
            if (isCompleted) {
                 playSound("taskComplete");
            }
            await updateDoc(doc(tasksCollectionRef, task.id), {
                completed: isCompleted,
                completedAt: isCompleted ? new Date().toISOString() : null,
            });
        });
        taskEl.querySelector(".timer-btn").addEventListener("click", async () => {
            if (task.completed) {
                showNotification("Tidak dapat menggunakan timer untuk tugas yang sudah selesai", "warn", "Timer Disabled");
                return;
            }
            if (task.isTimerRunning) {
                await pauseTaskTimer(task.id);
            } else {
                await startTaskTimer(task.id);
            }
        });
        taskEl.querySelector(".edit-btn").addEventListener("click", () => openTaskModal(task));
        taskEl.querySelector(".delete-btn").addEventListener("click", () => openDeleteConfirmModal(task.id));
        return taskEl;
      };

      const sortTasks = (a, b) => {
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityA = priorityOrder[a.priority || "medium"];
        const priorityB = priorityOrder[b.priority || "medium"];
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return new Date(a.deadline) - new Date(b.deadline);
      };

      const renderTasks = () => {
        elements.tasksHeader.textContent = `Tugas untuk ${dayjs(selectedDate).isSame(dayjs(), "day") ? "Hari Ini" : selectedDate.format("D MMMM")}`;
        elements.tasksList.innerHTML = "";
        const tasksForSelectedDate = allTasks
            .filter((task) => dayjs(task.deadline).isSame(selectedDate, "day"))
            .sort(sortTasks);
        if (tasksForSelectedDate.length === 0) {
            elements.tasksList.innerHTML = `<div class="text-center py-10"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mx-auto text-slate-400 dark:text-slate-500"><path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 14V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="m16 20 2 2 4-4"/></svg><p class="mt-4 text-slate-500 dark:text-slate-400">Tidak ada tugas untuk tanggal ini.</p></div>`;
        } else {
            tasksForSelectedDate.forEach((task) => elements.tasksList.appendChild(createTaskElement(task)));
        }
      };

      const renderReminders = () => {
        elements.remindersList.innerHTML = "";
        const tasksForToday = allTasks
            .filter((task) => dayjs(task.deadline).isSame(dayjs(), "day") && !task.completed)
            .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
        if (tasksForToday.length === 0) {
            elements.remindersList.innerHTML = `<p class="text-sm text-slate-500 dark:text-slate-400">Tidak ada pengingat untuk hari ini. Santai! 🥳</p>`;
        } else {
            tasksForToday.forEach((task) => {
                elements.remindersList.innerHTML += `<div class="flex items-center text-sm p-2 rounded-md bg-slate-100 dark:bg-slate-700/50"><div class="w-2 h-2 rounded-full bg-red-500 mr-3 flex-shrink-0"></div><div class="flex-1"><p class="font-medium text-slate-900 dark:text-white">${task.name}</p><p class="text-xs text-slate-500 dark:text-slate-400">Deadline: ${dayjs(task.deadline).format("HH:mm")}</p></div></div>`;
            });
        }
      };

      const renderHistory = () => {
        elements.historyList.innerHTML = "";
        const searchTerm = document.getElementById("history-search").value.toLowerCase();
        const statusFilter = document.getElementById("history-status-filter").value;
        const priorityFilter = elements.historyPriorityFilter.value;
        const categoryFilter = elements.historyCategoryFilter.value;
        const filteredTasks = allTasks
            .filter((task) => {
                const nameMatch = task.name.toLowerCase().includes(searchTerm);
                const statusMatch = statusFilter === "all" || (statusFilter === "completed" ? task.completed : !task.completed);
                const priorityMatch = priorityFilter === "all" || (task.priority || "medium") === priorityFilter;
                const categoryMatch = categoryFilter === "all" || task.category === categoryFilter;
                return nameMatch && statusMatch && priorityMatch && categoryMatch;
            })
            .sort((a, b) => {
                if (a.completed !== b.completed) { return a.completed ? 1 : -1; }
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        if (filteredTasks.length === 0) {
            elements.historyList.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-4">Tidak ada riwayat tugas yang cocok.</p>`;
        } else {
            filteredTasks.forEach((task) => elements.historyList.appendChild(createTaskElement(task)));
        }
      };
      
      const renderStatistics = () => {
        const total = allTasks.length;
        const completed = allTasks.filter((t) => t.completed).length;
        const pending = total - completed;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const totalWorkTime = allTasks.reduce((sum, task) => sum + (task.totalTimeSpent || 0), 0);
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
                    <span class="font-bold text-blue-600 dark:text-blue-400">${formatWorkTime(totalWorkTime)}</span>
                </div>
                ${avgTaskTime > 0 ? `
                <div class="flex justify-between items-center text-sm text-slate-500">
                    <span>Rata-rata per Tugas</span>
                    <span>${formatWorkTime(avgTaskTime)}</span>
                </div>` : ""}
            </div>
        `;
      };
      
      const populateCategoryFilters = () => {
        const uniqueCategories = [...new Set(allTasks.map((t) => t.category).filter(Boolean))];
        elements.historyCategoryFilter.innerHTML = '<option value="all">Semua Kategori</option>';
        uniqueCategories.forEach((cat) => {
            elements.historyCategoryFilter.innerHTML += `<option value="${cat}">${cat}</option>`;
        });
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
            elements.taskDeadlineInput.value = dayjs(task.deadline).format("YYYY-MM-DDTHH:mm");
            elements.taskCategoryInput.value = task.category || "Pribadi";
            elements.taskPriorityInput.value = task.priority || "medium";
            elements.taskLinkInput.value = task.link || "";
            elements.taskNotesInput.value = task.notes || "";
        } else {
            elements.modalTitle.textContent = "Tambah Tugas Baru ✨";
            elements.taskIdInput.value = "";
            elements.taskDeadlineInput.value = selectedDate.hour(dayjs().hour()).minute(dayjs().minute()).second(0).format("YYYY-MM-DDTHH:mm");
        }
        openModal(elements.taskModal, elements.taskModalContent);
      };

      const openDeleteConfirmModal = (id) => {
        taskToDeleteId = id;
        openModal(elements.deleteConfirmModal, elements.deleteConfirmModalContent);
      };

      const applyTheme = (theme) => {
        localStorage.setItem("theme", theme);
        let effectiveTheme = theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : theme;
        document.documentElement.classList.toggle("dark", effectiveTheme === "dark");
        const updateThemeIcon = (iconId, shouldShow) => {
            const icon = document.getElementById(iconId);
            if (icon) {
                if (shouldShow) icon.classList.remove("hidden");
                else icon.classList.add("hidden");
            }
        };
        updateThemeIcon("theme-icon-sun", theme === "light");
        updateThemeIcon("theme-icon-moon", theme === "dark");
        updateThemeIcon("theme-icon-system", theme === "system");
      };
      
      let currentWorkingTask = null;
      let activeTimers = new Map();

      const startTaskTimer = async (taskId) => {
        if (currentWorkingTask && currentWorkingTask !== taskId) {
            await pauseTaskTimer(currentWorkingTask);
        }
        currentWorkingTask = taskId;
        const task = allTasks.find((t) => t.id === taskId);
        if (!task) return;
        const updateData = { isTimerRunning: true, currentSessionStart: new Date().toISOString() };
        await updateDoc(doc(tasksCollectionRef, taskId), updateData);
        const intervalId = setInterval(() => { updateTimerDisplay(taskId); }, 1000);
        activeTimers.set(taskId, intervalId);
        showNotification(`Timer dimulai untuk: ${task.name}`, "info", "Mulai Kerja");
        playSound("taskCreate");
      };

      const pauseTaskTimer = async (taskId) => {
        const task = allTasks.find((t) => t.id === taskId);
        if (!task || !task.isTimerRunning) return;
        const sessionStart = new Date(task.currentSessionStart);
        const sessionEnd = new Date();
        const sessionDuration = Math.floor((sessionEnd - sessionStart) / 1000);
        const sessions = task.sessions || [];
        sessions.push({ start: task.currentSessionStart, end: sessionEnd.toISOString(), duration: sessionDuration });
        const updateData = {
            isTimerRunning: false,
            currentSessionStart: null,
            totalTimeSpent: (task.totalTimeSpent || 0) + sessionDuration,
            sessions: sessions,
        };
        await updateDoc(doc(tasksCollectionRef, taskId), updateData);
        const intervalId = activeTimers.get(taskId);
        if (intervalId) {
            clearInterval(intervalId);
            activeTimers.delete(taskId);
        }
        currentWorkingTask = null;
        const formatTime = (seconds) => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return hours > 0 ? `${hours}j ${minutes}m` : `${minutes}m`;
        };
        showNotification(`Timer dihentikan. Durasi sesi: ${formatTime(sessionDuration)}`, "info", "Timer Paused");
      };
      
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
                return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            } else {
                return `${minutes}:${secs.toString().padStart(2, "0")}`;
            }
        };
        const timerDisplay = document.querySelector(`#task-card-${taskId} .timer-display`);
        if (timerDisplay) {
            timerDisplay.textContent = formatTime(totalTime);
        }
      };

      const initializeActiveTimers = () => {
        allTasks.forEach((task) => {
            if (task.isTimerRunning) {
                const intervalId = setInterval(() => { updateTimerDisplay(task.id); }, 1000);
                activeTimers.set(task.id, intervalId);
                currentWorkingTask = task.id;
            }
        });
      };
      
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
        const upcomingTasks = allTasks.filter((task) => !task.completed && dayjs(task.deadline).isAfter(now) && dayjs(task.deadline).isBefore(sixHoursFromNow));
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
        document.querySelectorAll("#notification-popover-list [data-deadline]").forEach((el) => {
            const deadline = dayjs(el.dataset.deadline);
            if (deadline.isBefore(now)) {
                el.remove(); checkAndDisplayNotifications(); return;
            }
            const diff = deadline.diff(now);
            const hours = Math.floor(diff / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const seconds = Math.floor((diff % 60000) / 1000);
            const countdownEl = el.querySelector(".countdown-timer");
            if (countdownEl) {
                countdownEl.textContent = `Sisa Waktu: ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            }
        });
        document.querySelectorAll(".task-card").forEach((card) => card.classList.remove("is-panicking"));
        const panicTasks = allTasks.filter((task) => !task.completed && dayjs(task.deadline).isAfter(now) && dayjs(task.deadline).diff(now, "minute") < panicTime);
        if (panicTasks.length > 0) {
            inPanicMode = true;
            panicTasks.forEach((task) => {
                const card = document.getElementById(`task-card-${task.id}`);
                if (card) card.classList.add("is-panicking");
            });
        }
        if (inPanicMode && !isMuted && panicLoop && panicLoop.state !== "started") {
            Tone.Transport.start(); panicLoop.start(0);
        } else if ((!inPanicMode || isMuted) && panicLoop && panicLoop.state === "started") {
            Tone.Transport.stop(); panicLoop.stop(0);
        }
      };
      
      const showOverdueTasksAlert = () => {
        const today = dayjs();
        const overdueTasks = allTasks.filter((task) => dayjs(task.deadline).isBefore(today, "day") && !task.completed);
        if (overdueTasks.length > 0) {
            showNotification(`Anda memiliki ${overdueTasks.length} tugas yang sudah lewat dari deadline.`, "danger", "Tugas Terlewat!");
        }
      };
      
      const callGeminiForText = async (prompt) => {
          const apiKey = "YOUR_GEMINI_API_KEY_PLACEHOLDER";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
          const payload = { contents: [{ parts: [{ text: prompt }] }] };
          const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
          const result = await response.json();
          if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
              return result.candidates[0].content.parts[0].text;
          } else {
              console.warn("Tidak ada konten yang diterima dari Gemini API", result); return null;
          }
      };

      const callGeminiForSmartAdd = async (prompt) => {
          const apiKey = "YOUR_GEMINI_API_KEY_PLACEHOLDER";
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
          const payload = {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                  responseMimeType: "application/json",
                  responseSchema: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, deadline: { type: "STRING" } }, required: ["name", "deadline"] } },
              },
          };
          const response = await fetch(apiUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
          const result = await response.json();
          if (result.candidates && result.candidates[0].content?.parts?.[0]?.text) {
              try { return JSON.parse(result.candidates[0].content.parts[0].text); } catch (e) { console.error("Gagal mem-parsing JSON dari Gemini:", e); throw new Error("Respons JSON tidak valid dari API."); }
          } else {
              console.warn("Tidak ada konten yang diterima dari Gemini API", result); return null;
          }
      };

      const handleGenerateNotes = async (buttonEl) => {
        const taskName = elements.taskNameInput.value;
        if (!taskName) {
            showNotification("Harap masukkan nama tugas terlebih dahulu.", "warn", "Nama Tugas Kosong"); return;
        }
        const originalText = buttonEl.innerHTML;
        buttonEl.innerHTML = '<div class="btn-spinner" style="width:14px; height:14px; border-width:2px;"></div> Generating...';
        buttonEl.disabled = true;
        const prompt = `Buatlah rencana aksi atau checklist langkah-demi-langkah dalam poin-poin singkat untuk tugas ini. Berikan jawaban HANYA sebagai teks biasa (plain text), tanpa judul, dan gunakan format penomoran (1., 2., 3., dst.) untuk setiap langkah. Tugas: "${taskName}"`;
        try {
            const generatedNotes = await callGeminiForText(prompt);
            if (generatedNotes) {
                elements.taskNotesInput.value = generatedNotes;
                showNotification("Rencana aksi berhasil dibuat!", "info", "✨ AI Berhasil");
            } else {
                showNotification("AI tidak dapat membuat rencana.", "warn", "Gagal");
            }
        } catch (error) {
            console.error("Error generating notes:", error);
            showNotification("Gagal menghubungi AI. Coba lagi nanti.", "danger", "Error");
        } finally {
            buttonEl.innerHTML = originalText;
            buttonEl.disabled = false;
        }
      };

      const handleSmartAdd = async (buttonEl) => {
        const text = elements.smartAddTextarea.value;
        if (!text.trim()) {
            showNotification("Harap masukkan teks terlebih dahulu.", "warn"); return;
        }
        const originalText = buttonEl.querySelector(".btn-text").textContent;
        const btnTextEl = buttonEl.querySelector(".btn-text");
        btnTextEl.textContent = "";
        buttonEl.innerHTML = '<div class="btn-spinner"></div>' + buttonEl.innerHTML;
        buttonEl.disabled = true;
        const prompt = `Analisis teks berikut dan ekstrak tugas-tugas yang dapat ditindaklanjuti. Untuk setiap tugas, identifikasi nama tugas dan deadline jika disebutkan. Jika tidak ada deadline, gunakan tanggal dan waktu saat ini (${dayjs().format()}). Kembalikan hasilnya HANYA dalam format array JSON dari objek. Setiap objek harus memiliki properti "name" (string) dan "deadline" (string dalam format YYYY-MM-DDTHH:mm). Teks untuk dianalisis: "${text}"`;
        try {
            const suggestedTasks = await callGeminiForSmartAdd(prompt);
            if (suggestedTasks && suggestedTasks.length > 0) {
                renderSuggestedTasks(suggestedTasks);
                elements.smartAddResultsContainer.classList.remove("hidden");
            } else {
                showNotification("Tidak ada tugas yang dapat ditemukan dalam teks.", "info");
                elements.smartAddResultsContainer.classList.add("hidden");
            }
        } catch (error) {
            console.error("Error with Smart Add:", error);
            showNotification("Gagal menghubungi AI untuk memproses teks.", "danger");
        } finally {
            buttonEl.querySelector(".btn-spinner").remove();
            btnTextEl.textContent = originalText;
            buttonEl.disabled = false;
        }
      };

      const renderSuggestedTasks = (tasks) => {
        elements.smartAddResults.innerHTML = "";
        tasks.forEach((task, index) => {
            const taskEl = document.createElement("div");
            taskEl.className = "suggested-task-item flex items-center gap-3 p-2 bg-slate-100 dark:bg-slate-700 rounded-md";
            taskEl.innerHTML = `
                <input type="checkbox" id="suggested-task-${index}" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked>
                <div class="flex-1">
                    <input type="text" value="${task.name}" class="w-full bg-transparent font-medium text-sm p-1 rounded focus:bg-white dark:focus:bg-slate-800 outline-none">
                    <input type="datetime-local" value="${dayjs(task.deadline).format("YYYY-MM-DDTHH:mm")}" class="w-full bg-transparent text-xs text-slate-500 dark:text-slate-400 p-1 rounded focus:bg-white dark:focus:bg-slate-800 outline-none">
                </div>
            `;
            elements.smartAddResults.appendChild(taskEl);
        });
      };
      
      let pomodoroTimer = null;
      let pomodoroTime = 25 * 60;
      let isWorkMode = true;
      let pomodoroRunning = false;

      const updatePomodoroDisplay = () => {
        const minutes = Math.floor(pomodoroTime / 60);
        const seconds = pomodoroTime % 60;
        const display = document.getElementById("pomodoro-display");
        if (display) {
            display.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
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
                const message = isWorkMode ? "Waktu kerja selesai! Waktunya istirahat 5 menit." : "Waktu istirahat selesai! Kembali fokus bekerja.";
                showNotification(message, "info", "Pomodoro");
                pomodoroTime = isWorkMode ? 5 * 60 : 25 * 60;
                isWorkMode = !isWorkMode;
                updatePomodoroDisplay();
                document.getElementById("work-mode").classList.toggle("bg-blue-100", isWorkMode);
                document.getElementById("break-mode").classList.toggle("bg-blue-100", !isWorkMode);
            }
        }, 1000);
      };

      const signInWithGoogle = async () => {
          const provider = new GoogleAuthProvider();
          try {
              await signInWithPopup(auth, provider);
              playSound("loginSuccess");
          } catch (error) {
              console.error("Error during Google sign-in:", error);
              showNotification("Gagal masuk dengan Google. Coba lagi.", "danger", "Login Error");
          }
      };

      const logout = async () => {
          if (unsubscribeFromTasks) unsubscribeFromTasks();
          playSound("logout");
          try {
              await signOut(auth);
              allTasks = [];
              renderAll();
          } catch (error) {
              console.error("Error signing out: ", error);
          }
      };
      
      const openTodaysTasksModal = () => {
        const listEl = document.getElementById("todays-tasks-list");
        listEl.innerHTML = "";
        const todaysTasks = allTasks.filter(
            (task) => dayjs(task.deadline).isSame(dayjs(), "day")
        );

        if (todaysTasks.length > 0) {
            todaysTasks
              .sort(sortTasks)
              .forEach((task) => {
                  listEl.appendChild(createTaskElement(task));
              });
        } else {
            listEl.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-4">Luar biasa! Tidak ada tugas yang dijadwalkan untuk hari ini. 🙌</p>`;
        }
        openModal(elements.todaysTasksModal, elements.todaysTasksModalContent);
      };

      const setupUserData = (user) => {
          if (unsubscribeFromTasks) unsubscribeFromTasks();
          isFirstDataLoad = true;
          userId = user.uid;
          document.getElementById('user-profile-name').textContent = user.displayName || 'User';
          document.getElementById('user-profile-email').textContent = user.email || '';
          document.getElementById('user-profile-img').src = user.photoURL || 'https://via.placeholder.com/150';
          tasksCollectionRef = getTasksCollectionPath(userId);
          unsubscribeFromTasks = onSnapshot(
              tasksCollectionRef,
              (snapshot) => {
                  allTasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
                  renderAll();
                  if (isFirstDataLoad) {
                      openTodaysTasksModal();
                      showOverdueTasksAlert();
                      isFirstDataLoad = false;
                      elements.loader.style.opacity = "0";
                      setTimeout(() => {
                          elements.loader.style.display = "none";
                          elements.appContainer.classList.remove('hidden');
                          elements.appContainer.classList.add('opacity-1');
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

      const resetLogoutTimer = () => {
        clearTimeout(logoutTimer);
        logoutTimer = setTimeout(logout, 2 * 60 * 60 * 1000); 
      };

      const renderAll = () => {
        renderCalendar();
        renderTasks();
        renderReminders();
        renderHistory();
        renderStatistics();
        populateCategoryFilters();
        checkAndDisplayNotifications();
        initializeActiveTimers();
      };
      
      onAuthStateChanged(auth, (user) => {
          if (user) {
              elements.loginContainer.classList.add('hidden');
              setupUserData(user);
          } else {
              elements.loader.style.display = 'none';
              elements.loginContainer.classList.remove('hidden');
              elements.appContainer.classList.add('hidden');
              
              setTimeout(() => {
                const loginCard = document.getElementById('login-card');
                if (loginCard) {
                    loginCard.classList.remove('scale-95', 'opacity-0');
                }
              }, 100);

              if (unsubscribeFromTasks) unsubscribeFromTasks();
              allTasks = [];
          }
      });
      
      document.getElementById('login-with-google-btn').addEventListener('click', signInWithGoogle);

      document.getElementById("logout-btn").addEventListener("click", () => {
          openModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent);
      });
      
      document.getElementById("confirm-logout-btn").addEventListener("click", () => {
          closeModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent);
          logout();
      });

      document.getElementById("cancel-logout-btn").addEventListener("click", () =>
          closeModal(elements.logoutConfirmModal, elements.logoutConfirmModalContent)
      );

      document.getElementById("prev-month-btn").addEventListener("click", () => {
          currentDate = currentDate.subtract(1, "month");
          renderCalendar();
      });

      document.getElementById("next-month-btn").addEventListener("click", () => {
          currentDate = currentDate.add(1, "month");
          renderCalendar();
      });

      document.getElementById("show-add-task-modal-btn").addEventListener("click", () => openTaskModal());
      
      document.getElementById("close-modal-btn").addEventListener("click", () => closeModal(elements.taskModal, elements.taskModalContent));
      
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
            await addDoc(tasksCollectionRef, { ...taskData, completed: false, completedAt: null, createdAt: new Date().toISOString() });
            playSound("taskCreate");
        }
        closeModal(elements.taskModal, elements.taskModalContent);
      });

      document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
          if (taskToDeleteId) {
              await deleteDoc(doc(tasksCollectionRef, taskToDeleteId));
              playSound("taskDelete");
              closeModal(elements.deleteConfirmModal, elements.deleteConfirmModalContent);
          }
      });

      document.getElementById("cancel-delete-btn").addEventListener("click", () => closeModal(elements.deleteConfirmModal, elements.deleteConfirmModalContent));
      
      document.getElementById("history-search").addEventListener("input", renderHistory);
      document.getElementById("history-status-filter").addEventListener("change", renderHistory);
      elements.historyPriorityFilter.addEventListener("change", renderHistory);
      elements.historyCategoryFilter.addEventListener("change", renderHistory);

      document.getElementById("toggle-theme-btn").addEventListener("click", () => {
          const themes = ["light", "dark", "system"];
          const currentTheme = localStorage.getItem("theme") || "system";
          const currentIndex = themes.indexOf(currentTheme);
          const nextIndex = (currentIndex + 1) % themes.length;
          applyTheme(themes[nextIndex]);
      });

      elements.notificationBellBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        elements.notificationPopover.classList.toggle("hidden");
      });

      document.addEventListener("click", (e) => {
        if (!elements.notificationPopover.classList.contains("hidden") && !elements.notificationPopover.contains(e.target) && e.target !== elements.notificationBellBtn) {
            elements.notificationPopover.classList.add("hidden");
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

      elements.muteBtn.addEventListener("click", () => {
        isMuted = !isMuted;
        localStorage.setItem("isMuted", isMuted);
        updateMuteIcon();
        if (isMuted && panicLoop && panicLoop.state === "started") {
            Tone.Transport.stop();
            panicLoop.stop(0);
        }
      });

      document.getElementById("settings-btn").addEventListener("click", () => {
          elements.panicTimeInput.value = panicTime;
          openModal(elements.settingsModal, elements.settingsModalContent);
      });

      document.getElementById("close-settings-modal-btn").addEventListener("click", () => closeModal(elements.settingsModal, elements.settingsModalContent));
      
      elements.settingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const newTime = parseInt(elements.panicTimeInput.value);
        if (newTime && newTime > 0) {
            panicTime = newTime;
            localStorage.setItem("panicTime", panicTime);
            showNotification(`Waktu notifikasi panik diubah ke ${panicTime} menit.`, "info", "Pengaturan Disimpan");
        }
        closeModal(elements.settingsModal, elements.settingsModalContent);
      });
      
      document.getElementById("close-todays-tasks-modal-btn").addEventListener("click", () => closeModal(elements.todaysTasksModal, elements.todaysTasksModalContent));
      document.getElementById("ok-todays-tasks-btn").addEventListener("click", () => closeModal(elements.todaysTasksModal, elements.todaysTasksModalContent));

      setInterval(updateTimers, 1000);
      setInterval(() => { document.getElementById("realtime-clock").textContent = `WIB: ${dayjs().format("HH:mm:ss")}`; }, 1000);
      
      window.addEventListener("load", () => {
          document.getElementById("generate-notes-btn").addEventListener("click", (e) => handleGenerateNotes(e.currentTarget));
          
          document.getElementById("show-smart-add-modal-btn").addEventListener("click", () => {
              elements.smartAddResultsContainer.classList.add("hidden");
              elements.smartAddTextarea.value = "";
              openModal(elements.smartAddModal, elements.smartAddModalContent);
          });

          document.getElementById("close-smart-add-modal-btn").addEventListener("click", () => closeModal(elements.smartAddModal, elements.smartAddModalContent));
          
          document.getElementById("process-text-btn").addEventListener("click", (e) => handleSmartAdd(e.currentTarget));

          document.getElementById("add-selected-tasks-btn").addEventListener("click", async () => {
            const selectedTasks = [];
            const taskElements = elements.smartAddResults.querySelectorAll(".suggested-task-item");
            taskElements.forEach((el) => {
                const checkbox = el.querySelector('input[type="checkbox"]');
                if (checkbox && checkbox.checked) {
                    const name = el.querySelector('input[type="text"]').value;
                    const deadline = el.querySelector('input[type="datetime-local"]').value;
                    selectedTasks.push({ name, deadline });
                }
            });
            if (selectedTasks.length === 0) {
                showNotification("Pilih setidaknya satu tugas untuk ditambahkan.", "warn");
                return;
            }
            const creationPromises = selectedTasks.map((task) => {
                return addDoc(tasksCollectionRef, {
                    name: task.name,
                    deadline: new Date(task.deadline).toISOString(),
                    category: "Pribadi",
                    priority: "medium",
                    completed: false,
                    createdAt: new Date().toISOString()
                });
            });
            await Promise.all(creationPromises);
            showNotification(`${selectedTasks.length} tugas berhasil ditambahkan!`, "info", "✨ Sukses");
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
          ["click", "mousemove", "keydown"].forEach((event) => document.addEventListener(event, resetLogoutTimer));
      });

      document.getElementById("pomodoro-start").addEventListener("click", startPomodoro);
      
      document.getElementById("pomodoro-pause").addEventListener("click", () => {
        if (pomodoroRunning) {
            clearInterval(pomodoroTimer);
            pomodoroRunning = false;
        } else {
            startPomodoro();
        }
      });
      
      document.getElementById("pomodoro-reset").addEventListener("click", () => {
        clearInterval(pomodoroTimer);
        pomodoroRunning = false;
        pomodoroTime = 25 * 60;
        isWorkMode = true;
        updatePomodoroDisplay();
      });