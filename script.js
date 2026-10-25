
"use strict";

const STORAGE_KEY = "studentLifeSolverData";

const $ = (id) => document.getElementById(id);

const today = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const makeId = () =>
  window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(amount) || 0);

const prettyDate = (value) => {
  if (!value) return "No date";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
};

const escapeHTML = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

function normalizeAssignment(item) {
  if (typeof item === "string") {
    return {
      id: makeId(),
      name: item,
      date: "",
      completed: false
    };
  }

  item = item && typeof item === "object" ? item : {};
  return {
    id: String(item.id ?? makeId()),
    name: String(item.name ?? item.title ?? item.assignmentName ?? "Untitled assignment"),
    date: String(item.date ?? item.dueDate ?? ""),
    completed: Boolean(item.completed ?? item.done ?? item.isCompleted)
  };
}

function normalizeExpense(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: String(item.id ?? makeId()),
    name: String(item.name ?? item.title ?? item.expenseName ?? "Expense"),
    amount: Math.max(0, Number(item.amount ?? item.price ?? 0) || 0),
    category: String(item.category ?? "Other"),
    date: String(item.date ?? ""),
  };
}

function normalizeStudy(item) {
  if (typeof item === "string") {
    return {
      id: makeId(),
      name: item,
      date: "",
      duration: 0,
      completed: false
    };
  }

  item = item && typeof item === "object" ? item : {};
  return {
    id: String(item.id ?? makeId()),
    name: String(item.name ?? item.title ?? item.studyName ?? "Study session"),
    date: String(item.date ?? ""),
    duration: Math.max(0, Number(item.duration ?? item.minutes ?? item.studyDuration ?? 0) || 0),
    completed: Boolean(item.completed ?? item.done ?? item.isCompleted)
  };
}

function defaultData() {
  return {
    attendance: { totalLectures: 0, attendedLectures: 0 },
    assignments: [],
    expenses: [],
    studyTasks: []
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();

    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return defaultData();
    }

    const oldAttendance =
      saved.attendance && typeof saved.attendance === "object"
        ? saved.attendance
        : {};

    const total = Number(
      oldAttendance.totalLectures ?? saved.totalLectures ?? 0
    ) || 0;
    const attended = Number(
      oldAttendance.attendedLectures ?? saved.attendedLectures ?? 0
    ) || 0;

    return {
      attendance: {
        totalLectures: Math.max(0, total),
        attendedLectures: Math.max(0, attended)
      },
      assignments: firstArray(saved, ["assignments", "assignmentList"]).map(normalizeAssignment),
      expenses: firstArray(saved, ["expenses", "expenseList"]).map(normalizeExpense).filter(Boolean),
      studyTasks: firstArray(saved, ["studyTasks", "study", "studySessions", "studyList"]).map(normalizeStudy)
    };
  } catch (error) {
    console.error("Could not load saved data:", error);
    showToast("Saved data could not be read. Check the browser console.", true);
    return defaultData();
  }
}

let data = loadData();
let expenseChart = null;
let toastTimer = null;

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    showToast("Data could not be saved. Browser storage may be full or blocked.", true);
    return false;
  }
}

function showToast(message, isError = false) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setDefaultDates() {
  ["assignmentDate", "expenseDate", "studyDate"].forEach((id) => {
    const field = $(id);
    if (field && !field.value) field.value = today();
  });
}

function renderAttendanceSummary() {
  const { totalLectures, attendedLectures } = data.attendance;
  const percent = totalLectures > 0
    ? Math.min(100, (attendedLectures / totalLectures) * 100)
    : 0;

  $("attendanceSummary").textContent =
    totalLectures > 0 ? `${percent.toFixed(1)}%` : "—";

  $("attendanceCaption").textContent = totalLectures > 0
    ? `${attendedLectures} of ${totalLectures} lectures attended`
    : "Enter your lecture details";

  $("attendanceProgress").style.width = `${percent}%`;

  const pending = data.assignments.filter((item) => !item.completed).length;
  $("pendingSummary").textContent = String(pending);
  $("assignmentCaption").textContent = pending === 1
    ? "1 assignment needs attention"
    : `${pending} assignment${pending === 1 ? "" : "s"} need attention`;

  const totalExpenses = data.expenses.reduce((sum, item) => sum + item.amount, 0);
  $("expenseSummary").textContent = money(totalExpenses);
  $("expenseTotal").textContent = money(totalExpenses);

  const completedMinutes = data.studyTasks
    .filter((item) => item.completed)
    .reduce((sum, item) => sum + item.duration, 0);

  const hours = Math.floor(completedMinutes / 60);
  const minutes = completedMinutes % 60;

  $("studySummary").textContent = hours > 0
    ? `${hours}h${minutes ? ` ${minutes}m` : ""}`
    : `${minutes}m`;

  $("studyCaption").textContent =
    `${data.studyTasks.filter((item) => item.completed).length} completed session(s)`;

  $("studyInsightTitle").textContent = completedMinutes > 0
    ? "Good work — keep going!"
    : "One session at a time";

  $("studyInsightText").textContent = completedMinutes > 0
    ? `You have logged ${hours}h ${minutes}m of completed study time.`
    : "Mark a study session complete to count its time here.";
}


const attendanceForm = document.getElementById("attendanceForm");

attendanceForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const semesterTotal = Number(
    document.getElementById("semesterTotalLectures").value
  );
  const conducted = Number(
    document.getElementById("totalLectures").value
  );
  const attended = Number(
    document.getElementById("attendedLectures").value
  );

  const result = document.getElementById("attendanceResult");

  // Validate input
  if (
    !Number.isInteger(semesterTotal) ||
    !Number.isInteger(conducted) ||
    !Number.isInteger(attended) ||
    semesterTotal <= 0 ||
    conducted < 0 ||
    attended < 0 ||
    conducted > semesterTotal ||
    attended > conducted
  ) {
    result.textContent =
      "Invalid details. Check your lecture counts and try again.";
    return;
  }

  const missed = conducted - attended;
  const remaining = semesterTotal - conducted;
  const percentage = (attended / conducted) * 100;
  const target = Math.ceil(semesterTotal * 0.75);
  const needed = Math.max(0, target - attended);
  const possible = needed <= remaining;
  const finalPercentage =
    ((attended + remaining) / semesterTotal) * 100;

  let message = `
    <h3>Attendance Report</h3>
    <p>Current attendance: <strong>${
      conducted === 0 ? "0.00" : percentage.toFixed(2)
    }%</strong></p>
    <p>Lectures attended: ${attended}</p>
    <p>Lectures missed: ${missed}</p>
    <p>Lectures remaining: ${remaining}</p>
    <p>Lectures needed for 75%: ${needed}</p>
  `;

  if (conducted === 0) {
    message += `<p>Attend upcoming lectures to build your attendance.</p>`;
  }

  if (possible) {
    message += `
      <p><strong>75% target is achievable!</strong></p>
      <p>You must attend at least ${needed} of the remaining
      ${remaining} lectures to finish the semester with 75%.</p>
      <p>You can miss at most ${remaining - needed}
      more lectures and still reach the target.</p>
    `;
  } else {
    message += `
      <p><strong>75% target is not achievable</strong>
      if the semester ends after ${semesterTotal} total lectures.</p>
      <p>Even if you attend every remaining lecture,
      your maximum attendance will be
      ${finalPercentage.toFixed(2)}%.</p>
    `;
  }

  result.innerHTML = message;

  // Update the dashboard attendance summary
  const summary = document.getElementById("attendanceSummary");
  const caption = document.getElementById("attendanceCaption");
  const progress = document.getElementById("attendanceProgress");

  if (summary) {
    summary.textContent =
      `${conducted === 0 ? "0.00" : percentage.toFixed(2)}%`;
  }

  if (caption) {
    caption.textContent = possible
      ? "75% target is achievable"
      : "75% target needs attention";
  }

  if (progress) {
    progress.style.width =
      `${Math.min(100, conducted === 0 ? 0 : percentage)}%`;
  }
});


function renderAssignments() {
  const list = $("assignmentList");
  const query = $("assignmentSearch").value.trim().toLowerCase();
  const filter = $("assignmentFilter").value;

  const items = data.assignments.filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "pending" && !item.completed) ||
      (filter === "completed" && item.completed);
    return matchesQuery && matchesFilter;
  });

  items.sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });

  if (!items.length) {
    list.innerHTML = `<li class="empty-state">${
      query || filter !== "all"
        ? "No assignments match your search or filter."
        : "No assignments yet. Add your first task above."
    }</li>`;
    return;
  }

  list.innerHTML = items.map((item) => `
    <li class="item-row ${item.completed ? "completed" : ""}">
      <input class="item-check" type="checkbox" data-action="toggle-assignment"
        data-id="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.name)} complete"
        ${item.completed ? "checked" : ""}>
      <div class="item-main">
        <div class="item-name">${escapeHTML(item.name)}</div>
        <div class="item-meta">Due: ${escapeHTML(prettyDate(item.date))}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" type="button" data-action="delete-assignment"
          data-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}">✕</button>
      </div>
    </li>
  `).join("");
}

function renderExpenses() {
  const list = $("expenseList");
  const sorted = [...data.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!sorted.length) {
    list.innerHTML = `<li class="empty-state">No expenses yet. Record your first expense above.</li>`;
  } else {
    list.innerHTML = sorted.slice(0, 12).map((item) => `
      <li class="item-row">
        <div class="item-main">
          <div class="item-name">${escapeHTML(item.name)}</div>
          <div class="item-meta">${escapeHTML(prettyDate(item.date))} · ${escapeHTML(item.category)}</div>
          <span class="category-tag">${escapeHTML(item.category)}</span>
        </div>
        <div class="item-actions">
          <strong class="item-name">${escapeHTML(money(item.amount))}</strong>
          <button class="icon-btn" type="button" data-action="delete-expense"
            data-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}">✕</button>
        </div>
      </li>
    `).join("");
  }

  renderExpenseChart();
}

function renderExpenseChart() {
  const canvas = $("expenseChart");
  if (!canvas || typeof Chart === "undefined") return;

  const totals = {};
  data.expenses.forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + item.amount;
  });

  const labels = Object.keys(totals);
  const values = labels.map((label) => totals[label]);

  if (expenseChart) expenseChart.destroy();

  expenseChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: labels.length ? labels : ["No expenses yet"],
      datasets: [{
        data: labels.length ? values : [1],
        backgroundColor: labels.length
          ? ["#6558e8", "#20a77a", "#ef9b43", "#3889e8", "#ec6a91", "#a3a8b8"]
          : ["#e9ecf4"],
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "circle", padding: 14, boxWidth: 8, font: { size: 10 } }
        },
        tooltip: {
          callbacks: {
            label(context) {
              if (!labels.length) return " Add an expense to see analytics";
              return ` ${context.label}: ${money(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

function renderStudyTasks() {
  const list = $("studyList");
  const sorted = [...data.studyTasks].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (!sorted.length) {
    list.innerHTML = `<li class="empty-state">No study sessions yet. Plan your first session above.</li>`;
    return;
  }

  list.innerHTML = sorted.map((item) => `
    <li class="item-row ${item.completed ? "completed" : ""}">
      <input class="item-check" type="checkbox" data-action="toggle-study"
        data-id="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.name)} complete"
        ${item.completed ? "checked" : ""}>
      <div class="item-main">
        <div class="item-name">${escapeHTML(item.name)}</div>
        <div class="item-meta">${escapeHTML(prettyDate(item.date))} · ${item.duration} min${item.completed ? " · Completed" : " · Planned"}</div>
      </div>
      <button class="icon-btn" type="button" data-action="delete-study"
        data-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}">✕</button>
    </li>
  `).join("");
}

function renderAll() {
  renderAttendanceSummary();
  renderAttendanceResult();
  renderAssignments();
  renderExpenses();
  renderStudyTasks();
}

function onAttendanceSubmit(event) {
  event.preventDefault();

  const total = Number($("totalLectures").value);
  const attended = Number($("attendedLectures").value);

  if (!Number.isInteger(total) || !Number.isInteger(attended) ||
      total < 1 || attended < 0 || attended > total) {
    showToast("Enter valid lecture counts. Attended cannot exceed total.", true);
    return;
  }

  data.attendance = { totalLectures: total, attendedLectures: attended };
  saveData();
  renderAll();
  showToast("Attendance calculated and saved.");
}

function onAssignmentSubmit(event) {
  event.preventDefault();

  const name = $("assignmentName").value.trim();
  const date = $("assignmentDate").value;

  if (!name || !date) {
    showToast("Please enter an assignment name and due date.", true);
    return;
  }

  data.assignments.push({
    id: makeId(),
    name,
    date,
    completed: false
  });

  if (saveData()) {
    $("assignmentForm").reset();
    $("assignmentDate").value = today();
    renderAll();
    showToast("Assignment added successfully.");
  }
}

function onExpenseSubmit(event) {
  event.preventDefault();

  const name = $("expenseName").value.trim();
  const amount = Number($("expenseAmount").value);
  const category = $("expenseCategory").value;
  const date = $("expenseDate").value;

  if (!name || !date || !Number.isFinite(amount) || amount <= 0) {
    showToast("Enter a name, valid positive amount and date.", true);
    return;
  }

  data.expenses.push({ id: makeId(), name, amount, category, date });

  if (saveData()) {
    $("expenseForm").reset();
    $("expenseDate").value = today();
    renderAll();
    showToast("Expense added successfully.");
  }
}

function onStudySubmit(event) {
  event.preventDefault();

  const name = $("studyName").value.trim();
  const date = $("studyDate").value;
  const duration = Number($("studyDuration").value);

  if (!name || !date || !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    showToast("Enter a task, date and duration from 1 to 1440 minutes.", true);
    return;
  }

  data.studyTasks.push({
    id: makeId(),
    name,
    date,
    duration,
    completed: false
  });

  if (saveData()) {
    $("studyForm").reset();
    $("studyDate").value = today();
    renderAll();
    showToast("Study task added successfully.");
  }
}

function onListClick(event) {
  const control = event.target.closest("[data-action]");
  if (!control) return;

  const id = control.dataset.id;
  const action = control.dataset.action;

  if (action === "toggle-assignment") {
    const item = data.assignments.find((entry) => entry.id === id);
    if (!item) return;
    item.completed = control.checked;
    saveData();
    renderAll();
    showToast(item.completed ? "Assignment completed!" : "Assignment marked pending.");
  }

  if (action === "toggle-study") {
    const item = data.studyTasks.find((entry) => entry.id === id);
    if (!item) return;
    item.completed = control.checked;
    saveData();
    renderAll();
    showToast(item.completed ? "Study session completed!" : "Study session marked planned.");
  }

  if (action === "delete-assignment") {
    data.assignments = data.assignments.filter((entry) => entry.id !== id);
    if (saveData()) {
      renderAll();
      showToast("Assignment deleted.");
    }
  }

  if (action === "delete-expense") {
    data.expenses = data.expenses.filter((entry) => entry.id !== id);
    if (saveData()) {
      renderAll();
      showToast("Expense deleted.");
    }
  }

  if (action === "delete-study") {
    data.studyTasks = data.studyTasks.filter((entry) => entry.id !== id);
    if (saveData()) {
      renderAll();
      showToast("Study task deleted.");
    }
  }
}

function setupNavigation() {
  const sidebar = $("sidebar");
  const menuButton = $("menuBtn");

  menuButton.addEventListener("click", () => sidebar.classList.toggle("open"));

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
      sidebar.classList.remove("open");
    });
  });

  document.addEventListener("click", (event) => {
    if (window.innerWidth <= 850 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuButton.contains(event.target)) {
      sidebar.classList.remove("open");
    }
  });
}

function init() {
  $("todayDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  setDefaultDates();

  $("attendanceForm").addEventListener("submit", onAttendanceSubmit);
  $("assignmentForm").addEventListener("submit", onAssignmentSubmit);
  $("expenseForm").addEventListener("submit", onExpenseSubmit);
  $("studyForm").addEventListener("submit", onStudySubmit);

  $("assignmentSearch").addEventListener("input", renderAssignments);
  $("assignmentFilter").addEventListener("change", renderAssignments);

  $("assignmentList").addEventListener("click", onListClick);
  $("assignmentList").addEventListener("change", onListClick);
  $("expenseList").addEventListener("click", onListClick);
  $("studyList").addEventListener("click", onListClick);
  $("studyList").addEventListener("change", onListClick);

  setupNavigation();
  renderAll();

  // Fill the form with the last saved attendance values.
  if (data.attendance.totalLectures > 0) {
    $("totalLectures").value = data.attendance.totalLectures;
    $("attendedLectures").value = data.attendance.attendedLectures;
  }
}

document.addEventListener("DOMContentLoaded", init);