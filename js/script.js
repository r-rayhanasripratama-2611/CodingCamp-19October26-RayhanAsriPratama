(function () {
  'use strict';

  /* ---------- Warnings ---------- */
  var warningEl = document.getElementById('warning');
  var warnings = [];
  function showWarning(msg) {
    if (warnings.indexOf(msg) === -1) warnings.push(msg);
    warningEl.innerHTML = '';
    warnings.forEach(function (w) {
      var p = document.createElement('p');
      p.textContent = w;
      warningEl.appendChild(p);
    });
    warningEl.hidden = false;
  }

  /* ---------- Storage ---------- */
  var TASKS_KEY = 'tld.tasks';
  var LINKS_KEY = 'tld.links';
  var storageOk = true;
  try {
    var probe = '__tld_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (e) {
    storageOk = false;
    showWarning('Warning: browser storage is unavailable, so your data cannot be saved.');
  }

  function isQuotaError(e) {
    return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                 e.code === 22 || e.code === 1014);
  }

  function save(key, value) {
    if (!storageOk) {
      showWarning('Warning: browser storage is unavailable, so your data cannot be saved.');
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      if (isQuotaError(e)) {
        showWarning('Warning: your data could not be saved due to storage limitations.');
      } else {
        showWarning('Warning: browser storage is unavailable, so your data cannot be saved.');
      }
    }
  }

  function loadArray(key, validator) {
    var raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    var parsed = JSON.parse(raw); // may throw
    if (!Array.isArray(parsed) || !parsed.every(validator)) throw new Error('corrupt');
    return parsed;
  }
  function validTask(t) {
    return t && typeof t.id === 'string' && typeof t.text === 'string' && typeof t.done === 'boolean';
  }
  function validLink(l) {
    return l && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.url === 'string';
  }

  var tasks = [];
  var links = [];
  if (storageOk) {
    try {
      tasks = loadArray(TASKS_KEY, validTask);
      links = loadArray(LINKS_KEY, validLink);
    } catch (e) {
      tasks = [];
      links = [];
      showWarning('Warning: saved data was corrupt and could not be read. Starting with empty lists.');
    }
  }

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- Personalization: theme and name ---------- */
  var THEME_KEY = 'tld.theme';
  var NAME_KEY = 'tld.name';
  var themeToggle = document.getElementById('theme-toggle');
  var nameInput = document.getElementById('name-input');
  var saveNameBtn = document.getElementById('save-name');

  function applyTheme(theme) {
    document.body.classList.toggle('light-mode', theme === 'light');
    themeToggle.textContent = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }
  var savedTheme = 'dark';
  try {
    savedTheme = window.localStorage.getItem(THEME_KEY) || 'dark';
    nameInput.value = window.localStorage.getItem(NAME_KEY) || '';
  } catch (e) {
    showWarning('Warning: personalization settings could not be loaded.');
  }
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');

  themeToggle.addEventListener('click', function () {
    var nextTheme = document.body.classList.contains('light-mode') ? 'dark' : 'light';
    applyTheme(nextTheme);
    save(THEME_KEY, nextTheme);
  });

  function saveName() {
    var name = nameInput.value.trim().slice(0, 40);
    nameInput.value = name;
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch (e) {
      showWarning('Warning: your name could not be saved.');
    }
    updateGreeting();
  }
  saveNameBtn.addEventListener('click', saveName);
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') saveName();
  });

  /* ---------- Greeting ---------- */
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var clockEl = document.getElementById('clock');
  var dateEl = document.getElementById('date');
  var greetEl = document.getElementById('greeting-text');
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateGreeting() {
    var now = new Date();
    var h = now.getHours();
    clockEl.textContent = pad(h) + ':' + pad(now.getMinutes());
    dateEl.textContent = WEEKDAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();
    var text;
    if (h < 12) text = 'Good morning';
    else if (h < 18) text = 'Good afternoon';
    else text = 'Good evening';
    var name = '';
    try { name = (window.localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) {}
    greetEl.textContent = name ? text + ', ' + name + '!' : text + '!';
  }
  updateGreeting();
  (function scheduleGreeting() {
    // align to the start of each second
    setTimeout(function () { updateGreeting(); scheduleGreeting(); }, 1000 - (Date.now() % 1000));
  })();

  /* ---------- Focus Timer ---------- */
  var DURATION = 25 * 60;
  var durationInput = document.getElementById('pomodoro-minutes');
  var applyDurationBtn = document.getElementById('apply-duration');
  var timerError = document.getElementById('timer-error');
  try {
    var savedMinutes = Number(window.localStorage.getItem('tld.pomodoroMinutes'));
    if (savedMinutes >= 1 && savedMinutes <= 180 && Number.isInteger(savedMinutes)) {
      DURATION = savedMinutes * 60;
      durationInput.value = String(savedMinutes);
    }
  } catch (e) {}
  applyDurationBtn.addEventListener('click', function () {
    var minutes = Number(durationInput.value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      timerError.textContent = 'Choose a whole number between 1 and 180 minutes.';
      return;
    }
    if (running) {
      timerError.textContent = 'Pause the timer before changing its duration.';
      return;
    }
    DURATION = minutes * 60;
    try { window.localStorage.setItem('tld.pomodoroMinutes', String(minutes)); } catch (e) {}
    timerError.textContent = '';
    resetTimer();
  });
  var remaining = DURATION;
  var running = false;
  var finished = false;
  var endTime = 0;
  var timerHandle = null;

  var displayEl = document.getElementById('timer-display');
  var statusEl = document.getElementById('timer-status');
  var messageEl = document.getElementById('timer-message');

  function fmt(s) { return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function renderTimer() { displayEl.textContent = fmt(remaining); }

  function tick() {
    var left = endTime - Date.now();
    remaining = Math.max(0, Math.ceil(left / 1000));
    renderTimer();
    if (remaining <= 0) {
      running = false;
      finished = true;
      timerHandle = null;
      statusEl.textContent = 'Finished';
      messageEl.textContent = "Time's up! Great focus session.";
      return;
    }
    // next boundary: when remaining-1 seconds are left
    var delay = Math.max(0, left - (remaining - 1) * 1000);
    timerHandle = setTimeout(tick, delay);
  }

  function startTimer() {
    if (finished || remaining <= 0) {
      messageEl.textContent = "Time's up! Great focus session.";
      return;
    }
    if (running) return;
    running = true;
    statusEl.textContent = 'Running';
    endTime = Date.now() + remaining * 1000;
    timerHandle = setTimeout(tick, 1000);
  }
  function stopTimer() {
    if (running) {
      clearTimeout(timerHandle);
      timerHandle = null;
      running = false;
      statusEl.textContent = 'Paused';
    }
  }
  function resetTimer() {
    clearTimeout(timerHandle);
    timerHandle = null;
    running = false;
    finished = false;
    remaining = DURATION;
    messageEl.textContent = '';
    statusEl.textContent = 'Ready';
    renderTimer();
  }

  function flash(btn) {
    btn.classList.add('pressed');
    setTimeout(function () { btn.classList.remove('pressed'); }, 150);
  }
  var startBtn = document.getElementById('timer-start');
  var stopBtn = document.getElementById('timer-stop');
  var resetBtn = document.getElementById('timer-reset');
  startBtn.addEventListener('click', function () { flash(startBtn); startTimer(); });
  stopBtn.addEventListener('click', function () { flash(stopBtn); stopTimer(); });
  resetBtn.addEventListener('click', function () { flash(resetBtn); resetTimer(); });
  renderTimer();

  /* ---------- To-Do List ---------- */
  var todoForm = document.getElementById('todo-form');
  var todoInput = document.getElementById('todo-input');
  var todoError = document.getElementById('todo-error');
  var todoListEl = document.getElementById('todo-list');
  var TASK_ERROR = 'Task text must contain between 1 and 200 characters.';
  var editingId = null;
  var editError = '';

  function validTaskText(text) { return text.length >= 1 && text.length <= 200; }

  function addTask(text) {
    tasks.push({ id: uid(), text: text, done: false });
    save(TASKS_KEY, tasks);
    renderTasks();
  }

  function renderTasks() {
    todoListEl.innerHTML = '';
    if (tasks.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No tasks yet. Add your first one above.';
      todoListEl.appendChild(empty);
      return;
    }
    tasks.forEach(function (task) {
      var li = document.createElement('li');
      li.className = 'task' + (task.done ? ' done' : '');

      if (editingId === task.id) {
        var wrap = document.createElement('div');
        wrap.className = 'edit-wrap';
        var lbl = document.createElement('label');
        lbl.className = 'field-label';
        lbl.setAttribute('for', 'edit-' + task.id);
        lbl.textContent = 'Edit task';
        var input = document.createElement('input');
        input.type = 'text';
        input.id = 'edit-' + task.id;
        input.value = task.text;
        input.autocomplete = 'off';
        var err = document.createElement('p');
        err.className = 'error';
        err.setAttribute('role', 'alert');
        err.textContent = editError;
        var row = document.createElement('div');
        row.className = 'actions';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'small';
        saveBtn.textContent = 'Save';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'small secondary';
        cancelBtn.textContent = 'Cancel';

        function commit() {
          var value = input.value.trim();
          if (!validTaskText(value)) {
            editError = TASK_ERROR;
            err.textContent = editError;
            return;
          }
          task.text = value;
          editingId = null;
          editError = '';
          save(TASKS_KEY, tasks);
          renderTasks();
        }
        saveBtn.addEventListener('click', commit);
        cancelBtn.addEventListener('click', function () {
          editingId = null; editError = ''; renderTasks();
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { editingId = null; editError = ''; renderTasks(); }
        });

        wrap.appendChild(lbl);
        wrap.appendChild(input);
        wrap.appendChild(err);
        wrap.appendChild(row);
        row.appendChild(saveBtn);
        row.appendChild(cancelBtn);
        li.appendChild(wrap);
        todoListEl.appendChild(li);
        setTimeout(function () { input.focus(); }, 0);
        return;
      }

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'cb-' + task.id;
      cb.checked = task.done;
      cb.addEventListener('change', function () {
        task.done = cb.checked;
        save(TASKS_KEY, tasks);
        renderTasks();
      });

      var text = document.createElement('label');
      text.className = 'task-text';
      text.setAttribute('for', cb.id);
      text.textContent = task.text;

      var actions = document.createElement('div');
      actions.className = 'actions';
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'small secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () {
        editingId = task.id; editError = ''; renderTasks();
      });
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'small secondary';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', function () {
        tasks = tasks.filter(function (t) { return t.id !== task.id; });
        if (editingId === task.id) editingId = null;
        save(TASKS_KEY, tasks);
        renderTasks();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(cb);
      li.appendChild(text);
      li.appendChild(actions);
      todoListEl.appendChild(li);
    });
  }

  todoForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = todoInput.value.trim();
    if (!validTaskText(value)) {
      todoError.textContent = TASK_ERROR;
      return;
    }
    todoError.textContent = '';
    addTask(value);
    todoInput.value = '';
    todoInput.focus();
  });
  todoInput.addEventListener('input', function () { todoError.textContent = ''; });

  /* ---------- Quick Links ---------- */
  var linkForm = document.getElementById('link-form');
  var linkName = document.getElementById('link-name');
  var linkUrl = document.getElementById('link-url');
  var linkError = document.getElementById('link-error');
  var linksListEl = document.getElementById('links-list');
  var URL_PATTERN = /^https?:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d{1,5})?([\/?#]\S*)?$/i;

  function renderLinks() {
    linksListEl.innerHTML = '';
    if (links.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No quick links yet. Add one below.';
      linksListEl.appendChild(empty);
      return;
    }
    links.forEach(function (link) {
      var li = document.createElement('li');
      li.className = 'link-item';
      var a = document.createElement('a');
      a.className = 'link-btn';
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = link.name;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'small secondary';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Remove ' + link.name);
      rm.addEventListener('click', function () {
        links = links.filter(function (l) { return l.id !== link.id; });
        save(LINKS_KEY, links);
        renderLinks();
      });
      li.appendChild(a);
      li.appendChild(rm);
      linksListEl.appendChild(li);
    });
  }

  linkForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = linkName.value.trim();
    var url = linkUrl.value.trim();
    if (name.length < 1 || name.length > 50) {
      linkError.textContent = 'Name must contain between 1 and 50 characters.';
      return;
    }
    if (!URL_PATTERN.test(url)) {
      linkError.textContent = 'URL is invalid. It must start with http:// or https:// followed by a domain name.';
      return;
    }
    linkError.textContent = '';
    links.push({ id: uid(), name: name, url: url });
    save(LINKS_KEY, links);
    renderLinks();
    linkName.value = '';
    linkUrl.value = '';
    linkName.focus();
  });
  linkName.addEventListener('input', function () { linkError.textContent = ''; });
  linkUrl.addEventListener('input', function () { linkError.textContent = ''; });

  /* ---------- Init ---------- */
  renderTasks();
  renderLinks();
})();
