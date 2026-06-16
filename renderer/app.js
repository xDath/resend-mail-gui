// ═══════════════════════════════════════════════════════════
// RESEND MAILER — RENDERER v2
// Tabs: Send / History / Receive
// ═══════════════════════════════════════════════════════════

(function () {
    'use strict';

    // ── DOM ──────────────────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    // Tabs
    const tabs = $$('.nav__tab');
    const panels = $$('.tab-panel');

    // Send form
    const form = $('#compose-form');
    const fieldTo = $('#field-to');
    const fieldCc = $('#field-cc');
    const fieldBcc = $('#field-bcc');
    const fieldSubject = $('#field-subject');
    const fieldBody = $('#field-body');
    const sendBtn = $('#send-btn');
    const sendBtnText = $('#send-btn-text');
    const sendBtnLoader = $('#send-btn-loader');

    const ccRow = $('#cc-row');
    const bccRow = $('#bcc-row');
    const ccToggle = $('#cc-toggle');
    const modeToggle = $('#mode-toggle');

    // Toast
    const toast = $('#toast');
    const toastIndex = $('#toast-index');
    const toastMessage = $('#toast-message');

    // History
    const historyList = $('#history-list');
    const historyEmpty = $('#history-empty');
    const sentCount = $('#sent-count');
    const historyListView = $('#history-list-view');
    const historyDetailView = $('#history-detail-view');
    const historyBackBtn = $('#history-back-btn');

    // History detail
    const detailSubject = $('#detail-subject');
    const detailTo = $('#detail-to');
    const detailCc = $('#detail-cc');
    const detailCcRow = $('#detail-cc-row');
    const detailDate = $('#detail-date');
    const detailId = $('#detail-id');
    const detailBody = $('#detail-body');

    // Status
    const statusDot = $('#status-dot');
    const statusText = $('#status-text');
    const senderDisplay = $('#sender-display');

    // ── STATE ────────────────────────────────────────────────
    let showCcBcc = false;
    let htmlMode = false;
    let sending = false;
    let toastTimer = null;
    let pendingAttachments = []; // { filename, content (base64), size }

    // ── TITLEBAR ─────────────────────────────────────────────
    $('#btn-minimize').addEventListener('click', () => window.api.minimize());
    $('#btn-maximize').addEventListener('click', () => window.api.maximize());
    $('#btn-close').addEventListener('click', () => window.api.close());

    // ── TAB SWITCHING ────────────────────────────────────────
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            $(`#panel-${target}`).classList.add('active');
        });
    });

    // ── INIT ─────────────────────────────────────────────────
    async function init() {
        try {
            const config = await window.api.getConfig();
            if (config.apiKeySet) {
                statusDot.classList.add('active');
                statusText.textContent = 'CONNECTED';
                // Start auto-polling after 5s
                setTimeout(() => startAutoCheck(), 5000);
            } else {
                statusDot.classList.add('error');
                statusText.textContent = 'NO API KEY';
            }
            senderDisplay.textContent = config.senderEmail;
        } catch {
            statusDot.classList.add('error');
            statusText.textContent = 'ERROR';
        }
        renderHistory();
    }

    // ── AUTO-POLL (silent background check every 30s) ────────
    const SEEN_KEY = 'resend_mailer_seen_inbox';

    function getSeenIds() {
        try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); }
        catch { return []; }
    }

    function saveSeenIds(ids) {
        localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    }

    function startAutoCheck() {
        silentCheck();
        setInterval(() => silentCheck(), 60000); // refresh every 60s
    }

    async function silentCheck() {
        try {
            const result = await window.api.listReceivedEmails();
            if (result.success && result.data) {
                const emails = result.data.data || result.data || [];
                const seenIds = getSeenIds();
                const newCount = emails.filter(e => !seenIds.includes(e.id)).length;

                if (newCount > 0 && inboxLoaded) {
                    renderInbox(emails);
                    showToast('success', `📨 ${newCount} new email(s)`);
                }

                saveSeenIds(emails.map(e => e.id));
            }
        } catch {
            // Silent fail
        }
    }
    init();

    // ── CC/BCC TOGGLE ────────────────────────────────────────
    ccToggle.addEventListener('click', () => {
        showCcBcc = !showCcBcc;
        ccRow.classList.toggle('visible', showCcBcc);
        bccRow.classList.toggle('visible', showCcBcc);
        ccToggle.textContent = showCcBcc ? '− CC / BCC' : '+ CC / BCC';
        ccToggle.classList.toggle('active', showCcBcc);
    });

    // ── MODE TOGGLE ──────────────────────────────────────────
    modeToggle.addEventListener('click', () => {
        htmlMode = !htmlMode;
        modeToggle.textContent = htmlMode ? 'HTML' : 'PLAIN TEXT';
        modeToggle.classList.toggle('active', htmlMode);
        fieldBody.placeholder = htmlMode
            ? '<p>Write your HTML here…</p>'
            : 'Write your message here…';
    });

    // ── ATTACHMENTS ─────────────────────────────────────────
    const attachBtn = $('#attach-btn');
    const attachList = $('#attach-list');

    attachBtn.addEventListener('click', async () => {
        const files = await window.api.pickFiles();
        if (files && files.length > 0) {
            pendingAttachments.push(...files);
            renderAttachments();
        }
    });

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderAttachments() {
        attachList.innerHTML = '';
        pendingAttachments.forEach((file, idx) => {
            const chip = document.createElement('span');
            chip.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:var(--text); color:var(--white); font-family:var(--font-mono); font-size:11px; letter-spacing:0.05em;';
            chip.innerHTML = `${escapeHtml(file.filename)} <span style="color:var(--muted);">${formatFileSize(file.size)}</span> <button type="button" data-idx="${idx}" style="background:none; border:none; color:#E53935; cursor:pointer; font-size:14px; padding:0 2px;">✕</button>`;
            chip.querySelector('button').addEventListener('click', () => {
                pendingAttachments.splice(idx, 1);
                renderAttachments();
            });
            attachList.appendChild(chip);
        });
    }

    // ── UTILS ────────────────────────────────────────────────
    function parseEmails(str) {
        if (!str || !str.trim()) return [];
        return str.split(/[,;]\s*/).map(e => e.trim()).filter(e => e.length > 0);
    }

    function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatTime(iso) {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    }

    // ── TOAST ────────────────────────────────────────────────
    function showToast(type, msg) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.className = 'toast visible toast--' + type;
        toastIndex.textContent = type === 'success' ? '✓' : '✗';
        toastMessage.textContent = msg;
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
    }

    // ── LOADING STATE ────────────────────────────────────────
    function setLoading(on) {
        sending = on;
        sendBtn.disabled = on;
        sendBtnText.style.display = on ? 'none' : 'inline';
        sendBtnLoader.style.display = on ? 'inline' : 'none';
    }

    // ── SEND EMAIL ───────────────────────────────────────────
    async function handleSend(e) {
        e.preventDefault();
        if (sending) return;

        const toList = parseEmails(fieldTo.value);
        if (!toList.length) { showToast('error', 'Recipient required'); fieldTo.focus(); return; }
        for (const em of toList) {
            if (!isValidEmail(em)) { showToast('error', `Invalid: ${em}`); fieldTo.focus(); return; }
        }
        if (!fieldSubject.value.trim()) { showToast('error', 'Subject required'); fieldSubject.focus(); return; }
        if (!fieldBody.value.trim()) { showToast('error', 'Body required'); fieldBody.focus(); return; }

        const payload = { to: toList, subject: fieldSubject.value.trim() };
        if (htmlMode) payload.html = fieldBody.value;
        else payload.text = fieldBody.value;

        const ccList = parseEmails(fieldCc.value);
        if (ccList.length) payload.cc = ccList;
        const bccList = parseEmails(fieldBcc.value);
        if (bccList.length) payload.bcc = bccList;

        // Include attachments
        if (pendingAttachments.length > 0) {
            payload.attachments = pendingAttachments.map(a => ({
                filename: a.filename,
                content: a.content,
            }));
        }

        setLoading(true);
        try {
            const result = await window.api.sendEmail(payload);
            if (result.success) {
                const attachNames = pendingAttachments.map(a => a.filename);
                showToast('success', `Sent — ID: ${result.id}`);
                saveToHistory({
                    id: result.id,
                    to: toList.join(', '),
                    cc: ccList.join(', '),
                    subject: payload.subject,
                    body: fieldBody.value,
                    htmlMode,
                    attachments: attachNames,
                    time: new Date().toISOString(),
                });
                form.reset();
                pendingAttachments = [];
                renderAttachments();
            } else {
                showToast('error', result.error || 'Send failed');
            }
        } catch (err) {
            showToast('error', err.message || 'Network error');
        }
        setLoading(false);
    }
    form.addEventListener('submit', handleSend);

    // Ctrl+Enter
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    // Clear
    $('#clear-btn').addEventListener('click', (e) => {
        e.preventDefault();
        form.reset();
        fieldTo.focus();
    });

    // ── HISTORY ──────────────────────────────────────────────
    const HISTORY_KEY = 'resend_mailer_history';

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
        catch { return []; }
    }

    function saveToHistory(entry) {
        const h = getHistory();
        h.unshift(entry);
        if (h.length > 100) h.length = 100;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
        renderHistory();
    }

    function renderHistory() {
        const history = getHistory();
        sentCount.textContent = history.length;

        // Remove old items
        historyList.querySelectorAll('.history-item').forEach(el => el.remove());

        if (!history.length) {
            historyEmpty.style.display = 'flex';
            return;
        }
        historyEmpty.style.display = 'none';

        history.forEach((entry, idx) => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.dataset.index = idx;

            item.innerHTML = `
        <span class="history-item__index">${String(idx + 1).padStart(3, '0')}</span>
        <div class="history-item__content">
          <div class="history-item__subject">${escapeHtml(entry.subject)}</div>
          <div class="history-item__meta">
            <span class="history-item__to">→ ${escapeHtml(entry.to)}</span>
            <span class="history-item__time">${formatTime(entry.time)}</span>
          </div>
        </div>
        <span class="history-item__arrow">→</span>
      `;

            item.addEventListener('click', () => showHistoryDetail(entry));
            historyList.appendChild(item);
        });
    }

    // ── HISTORY DETAIL VIEW ──────────────────────────────────
    function showHistoryDetail(entry) {
        historyListView.style.display = 'none';
        historyDetailView.style.display = 'block';

        detailSubject.textContent = entry.subject;
        detailTo.textContent = entry.to;
        detailDate.textContent = formatTime(entry.time);
        detailId.textContent = entry.id || '—';

        if (entry.cc) {
            detailCcRow.style.display = 'flex';
            detailCc.textContent = entry.cc;
        } else {
            detailCcRow.style.display = 'none';
        }

        if (entry.htmlMode && entry.body) {
            detailBody.innerHTML = entry.body;
        } else {
            detailBody.textContent = entry.body || '(no content)';
        }
    }

    historyBackBtn.addEventListener('click', () => {
        historyDetailView.style.display = 'none';
        historyListView.style.display = 'block';
    });

    // ── INBOX (RECEIVE) ────────────────────────────────────
    const inboxList = $('#inbox-list');
    const inboxEmpty = $('#inbox-empty');
    const inboxCount = $('#inbox-count');
    const inboxListView = $('#inbox-list-view');
    const inboxDetailView = $('#inbox-detail-view');
    const inboxBackBtn = $('#inbox-back-btn');
    const inboxRefreshBtn = $('#inbox-refresh-btn');

    const inboxDetailSubject = $('#inbox-detail-subject');
    const inboxDetailFrom = $('#inbox-detail-from');
    const inboxDetailTo = $('#inbox-detail-to');
    const inboxDetailDate = $('#inbox-detail-date');
    const inboxDetailBody = $('#inbox-detail-body');

    let inboxLoaded = false;

    // Auto-load inbox when tab is clicked
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'receive' && !inboxLoaded) {
                loadInbox(false); // first load = no notifications
            }
        });
    });

    inboxRefreshBtn.addEventListener('click', () => loadInbox());

    async function loadInbox() {
        inboxRefreshBtn.textContent = 'LOADING…';
        inboxRefreshBtn.disabled = true;

        try {
            const result = await window.api.listReceivedEmails();
            if (result.success && result.data) {
                const emails = result.data.data || result.data || [];
                renderInbox(emails);
                inboxLoaded = true;
                saveSeenIds(emails.map(e => e.id));
                showToast('success', `${emails.length} email(s) loaded`);
            } else {
                showToast('error', result.error || 'Failed to load inbox');
            }
        } catch (err) {
            showToast('error', err.message || 'Inbox error');
        }

        inboxRefreshBtn.textContent = 'REFRESH';
        inboxRefreshBtn.disabled = false;
    }

    function renderInbox(emails) {
        inboxCount.textContent = emails.length;
        inboxList.querySelectorAll('.history-item').forEach(el => el.remove());

        if (!emails.length) {
            inboxEmpty.style.display = 'flex';
            return;
        }
        inboxEmpty.style.display = 'none';

        emails.forEach((email, idx) => {
            const item = document.createElement('div');
            item.className = 'history-item';

            const from = email.from || '—';
            const subject = email.subject || '(no subject)';
            const time = email.created_at ? formatTime(email.created_at) : '—';

            item.innerHTML = `
                <span class="history-item__index">${String(idx + 1).padStart(3, '0')}</span>
                <div class="history-item__content">
                    <div class="history-item__subject">${escapeHtml(subject)}</div>
                    <div class="history-item__meta">
                        <span class="history-item__to">← ${escapeHtml(from)}</span>
                        <span class="history-item__time">${time}</span>
                    </div>
                </div>
                <span class="history-item__arrow">→</span>
            `;

            item.addEventListener('click', () => openInboxDetail(email));
            inboxList.appendChild(item);
        });
    }

    async function openInboxDetail(email) {
        inboxListView.style.display = 'none';
        inboxDetailView.style.display = 'block';

        inboxDetailSubject.textContent = email.subject || '(no subject)';
        inboxDetailFrom.textContent = email.from || '—';
        inboxDetailTo.textContent = Array.isArray(email.to) ? email.to.join(', ') : (email.to || '—');
        inboxDetailDate.textContent = email.created_at ? formatTime(email.created_at) : '—';
        inboxDetailBody.textContent = 'Loading full email…';

        // Fetch full content via REST API
        try {
            const result = await window.api.getReceivedEmail(email.id);
            if (result.success && result.data) {
                const d = result.data;
                if (d.html) {
                    inboxDetailBody.innerHTML = d.html;
                } else if (d.text) {
                    inboxDetailBody.textContent = d.text;
                } else if (d.body) {
                    inboxDetailBody.textContent = d.body;
                } else {
                    inboxDetailBody.textContent = '(email has no body content)';
                }
            } else {
                inboxDetailBody.textContent = `Error: ${result.error || 'Could not load'}`;
            }
        } catch (err) {
            inboxDetailBody.textContent = `Error: ${err.message}`;
        }
    }

    inboxBackBtn.addEventListener('click', () => {
        inboxDetailView.style.display = 'none';
        inboxListView.style.display = 'block';
    });

    // ── SETTINGS ────────────────────────────────────────────
    const settingsForm = $('#settings-form');
    const envApiKey = $('#env-api-key');
    const envSenderEmail = $('#env-sender-email');
    const envSenderName = $('#env-sender-name');
    const envReplyTo = $('#env-reply-to');
    const envNotify = $('#env-notify');
    const restartBtn = $('#restart-btn');
    let settingsLoaded = false;

    // Auto-load settings when tab is clicked
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.tab === 'settings' && !settingsLoaded) {
                loadSettings();
            }
        });
    });

    async function loadSettings() {
        const result = await window.api.readEnv();
        if (result.success && result.data) {
            envApiKey.value = result.data.RESEND_API_KEY || '';
            envSenderEmail.value = result.data.SENDER_EMAIL || '';
            envSenderName.value = result.data.SENDER_NAME || '';
            envReplyTo.value = result.data.REPLY_TO || '';
            envNotify.value = result.data.NOTIFY_EMAIL || '';
            settingsLoaded = true;
        }
    }

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const vars = {
            RESEND_API_KEY: envApiKey.value.trim(),
            SENDER_EMAIL: envSenderEmail.value.trim(),
            SENDER_NAME: envSenderName.value.trim(),
            REPLY_TO: envReplyTo.value.trim(),
            NOTIFY_EMAIL: envNotify.value.trim(),
        };
        const result = await window.api.saveEnv(vars);
        if (result.success) {
            showToast('success', 'Settings saved — restart to apply');
        } else {
            showToast('error', result.error || 'Save failed');
        }
    });

    restartBtn.addEventListener('click', () => {
        window.location.reload();
    });

})();
