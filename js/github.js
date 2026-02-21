/* ============================================================
   METTLESTATE — github.js
   All GitHub API interactions:
   · Config save/load
   · Data file commit (league-data.json)
   · Image upload (match screenshots → match-images/)
   · Status UI updates
   ============================================================ */

const GH = {
    // ---- CONFIG ----
    config: null,

    load() {
        const raw = localStorage.getItem('eafc_gh_config');
        this.config = raw ? JSON.parse(raw) : null;
        this.updateStatusUI();
        return !!this.config;
    },

    save(owner, repo, branch, token) {
        this.config = { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || 'main', token: token.trim() };
        localStorage.setItem('eafc_gh_config', JSON.stringify(this.config));
        this.updateStatusUI();
    },

    disconnect() {
        this.config = null;
        localStorage.removeItem('eafc_gh_config');
        this.updateStatusUI();
    },

    isConnected() {
        return !!(this.config?.owner && this.config?.repo && this.config?.token);
    },

    // ---- STATUS UI ----
    updateStatusUI() {
        const dot   = document.getElementById('gh-status-dot');
        const label = document.getElementById('gh-status-label');
        const btn   = document.getElementById('btn-force-sync');
        if (!dot || !label) return;

        if (this.isConnected()) {
            dot.className   = 'status-dot status-github';
            label.textContent = `${this.config.owner}/${this.config.repo}`;
            if (btn) btn.style.display = 'block';

            // Pre-fill form fields if already configured
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            setVal('ghOwner',  this.config.owner);
            setVal('ghRepo',   this.config.repo);
            setVal('ghBranch', this.config.branch);
            setVal('ghToken',  this.config.token);
        } else {
            dot.className   = 'status-dot status-local';
            label.textContent = 'Local only';
            if (btn) btn.style.display = 'none';
        }
    },

    showSyncBar(msg) {
        const bar = document.getElementById('sync-bar');
        const msgEl = document.getElementById('sync-msg');
        const icon  = document.getElementById('sync-icon');
        if (!bar) return;
        msgEl.textContent = msg || 'Syncing to GitHub…';
        icon.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        bar.classList.remove('hidden', 'sync-error', 'sync-ok');
        bar.classList.add('sync-active');
    },

    hideSyncBar(status = 'ok', msg = '') {
        const bar   = document.getElementById('sync-bar');
        const msgEl = document.getElementById('sync-msg');
        const icon  = document.getElementById('sync-icon');
        if (!bar) return;
        bar.classList.remove('sync-active');
        if (status === 'ok') {
            icon.innerHTML    = '<i class="fas fa-check-circle"></i>';
            msgEl.textContent = msg || 'Synced to GitHub';
            bar.classList.add('sync-ok');
        } else {
            icon.innerHTML    = '<i class="fas fa-exclamation-circle"></i>';
            msgEl.textContent = msg || 'Sync failed — data saved locally';
            bar.classList.add('sync-error');
        }
        setTimeout(() => bar.classList.add('hidden'), 4000);
    },

    // ---- CORE API ----
    apiBase() {
        return `https://api.github.com/repos/${this.config.owner}/${this.config.repo}`;
    },

    headers() {
        return {
            'Authorization': `token ${this.config.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    },

    // Get the current SHA of a file (needed to update it)
    async getFileSHA(path) {
        try {
            const res = await fetch(`${this.apiBase()}/contents/${path}?ref=${this.config.branch}`, {
                headers: this.headers()
            });
            if (res.status === 404) return null;
            if (!res.ok) return null;
            const data = await res.json();
            return data.sha || null;
        } catch {
            return null;
        }
    },

    // Commit a file (create or update)
    async commitFile(path, content, commitMsg, isBinary = false) {
        if (!this.isConnected()) return false;

        const sha = await this.getFileSHA(path);
        const body = {
            message: commitMsg,
            branch:  this.config.branch,
            content: isBinary ? content : btoa(unescape(encodeURIComponent(content)))
        };
        if (sha) body.sha = sha;

        const res = await fetch(`${this.apiBase()}/contents/${path}`, {
            method:  'PUT',
            headers: this.headers(),
            body:    JSON.stringify(body)
        });

        return res.ok;
    },

    // ---- SYNC LEAGUE DATA ----
    async syncData(players, fixtures, results) {
        if (!this.isConnected()) return;
        this.showSyncBar('Syncing league data…');
        try {
            const payload = JSON.stringify({ players, fixtures, results, lastUpdated: new Date().toISOString() }, null, 2);
            const ok = await this.commitFile(
                'data/league-data.json',
                payload,
                `📊 League data update — ${new Date().toLocaleString('en-ZA')}`
            );
            this.hideSyncBar(ok ? 'ok' : 'error', ok ? 'League data saved to GitHub' : 'Data sync failed');
        } catch (err) {
            console.error('GH sync error:', err);
            this.hideSyncBar('error', 'Sync failed — check token & repo');
        }
    },

    // ---- UPLOAD MATCH IMAGE ----
    // base64Data: pure base64 string (no data:image/... prefix)
    // filename: e.g. "match_bhaze_vs_Sailor_1720000000.png"
    async uploadMatchImage(base64Data, filename) {
        if (!this.isConnected()) return null;
        this.showSyncBar('Uploading match screenshot…');
        try {
            const path = `match-images/${filename}`;
            const ok = await this.commitFile(
                path,
                base64Data,
                `📸 Match screenshot: ${filename}`,
                true  // binary — already base64
            );
            if (ok) {
                this.hideSyncBar('ok', 'Screenshot saved to GitHub');
                // Return the raw GitHub URL so we can store/display it
                return `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}/${path}`;
            } else {
                this.hideSyncBar('error', 'Image upload failed');
                return null;
            }
        } catch (err) {
            console.error('GH image upload error:', err);
            this.hideSyncBar('error', 'Image upload failed');
            return null;
        }
    },

    // ---- LOAD DATA FROM GITHUB (on first visit / override local) ----
    async loadRemoteData() {
        if (!this.isConnected()) return null;
        this.showSyncBar('Loading data from GitHub…');
        try {
            const res = await fetch(`${this.apiBase()}/contents/data/league-data.json?ref=${this.config.branch}`, {
                headers: this.headers()
            });
            if (!res.ok) {
                this.hideSyncBar('ok', 'No remote data yet — starting fresh');
                return null;
            }
            const file = await res.json();
            const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
            const data = JSON.parse(decoded);
            this.hideSyncBar('ok', 'Data loaded from GitHub');
            return data;
        } catch (err) {
            console.error('GH load error:', err);
            this.hideSyncBar('error', 'Could not load remote data');
            return null;
        }
    },

    // ---- TEST CONNECTION ----
    async testConnection() {
        if (!this.isConnected()) return { ok: false, msg: 'Not configured' };
        try {
            const res = await fetch(`${this.apiBase()}`, { headers: this.headers() });
            if (res.status === 200) return { ok: true, msg: 'Connected!' };
            if (res.status === 401) return { ok: false, msg: 'Invalid token' };
            if (res.status === 404) return { ok: false, msg: 'Repo not found' };
            return { ok: false, msg: `Error ${res.status}` };
        } catch {
            return { ok: false, msg: 'Network error' };
        }
    }
};
