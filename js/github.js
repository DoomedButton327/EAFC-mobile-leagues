/* ============================================================
   METTLESTATE — github.js  v3
   
   KEY PROBLEMS SOLVED:
   · 409 Conflict — caused by concurrent commits racing each other.
     Fixed with a serialised commit queue: only one PUT to GitHub
     ever runs at a time. Rapid saves are debounced (600ms) so a
     burst of changes collapses into a single commit.
   · Stale SHA — after a successful commit we cache the new SHA
     returned by GitHub, so the next commit never needs to re-fetch
     it and can't race against another process fetching it at the
     same time.
   ============================================================ */

const GH = {

    // ---- CONFIG ----
    config: null,

    // ---- INTERNAL QUEUE STATE ----
    _queue:          [],    // pending jobs: { job, resolve, reject }
    _running:        false, // is the queue worker currently active?
    _shaCache:       {},    // path -> sha string (or null for new files)
    _debounceTimer:  null,  // timer handle for coalescing rapid saves
    _pendingPayload: null,  // latest data snapshot waiting to commit
    _hideTimer:      null,  // timer for hiding sync bar

    // ================================================================
    // CONFIG
    // ================================================================

    load() {
        const raw = localStorage.getItem('eafc_gh_config');
        this.config = raw ? JSON.parse(raw) : null;
        this.updateStatusUI();
        return !!this.config;
    },

    save(owner, repo, branch, token) {
        this.config = {
            owner:  owner.trim(),
            repo:   repo.trim(),
            branch: (branch || 'main').trim(),
            token:  token.trim()
        };
        localStorage.setItem('eafc_gh_config', JSON.stringify(this.config));
        this._shaCache = {};
        this.updateStatusUI();
    },

    disconnect() {
        this.config    = null;
        this._shaCache = {};
        localStorage.removeItem('eafc_gh_config');
        this.updateStatusUI();
    },

    isConnected() {
        return !!(this.config && this.config.owner && this.config.repo && this.config.token);
    },

    // ================================================================
    // STATUS UI
    // ================================================================

    updateStatusUI() {
        const dot   = document.getElementById('gh-status-dot');
        const label = document.getElementById('gh-status-label');
        const btn   = document.getElementById('btn-force-sync');
        if (!dot || !label) return;

        if (this.isConnected()) {
            dot.className     = 'status-dot status-github';
            label.textContent = this.config.owner + '/' + this.config.repo;
            if (btn) btn.style.display = 'block';
            var setVal = function(id, val) {
                var el = document.getElementById(id);
                if (el) el.value = val;
            };
            setVal('ghOwner',  this.config.owner);
            setVal('ghRepo',   this.config.repo);
            setVal('ghBranch', this.config.branch);
            setVal('ghToken',  this.config.token);
        } else {
            dot.className     = 'status-dot status-local';
            label.textContent = 'Local only';
            if (btn) btn.style.display = 'none';
        }
    },

    showSyncBar(msg) {
        var bar   = document.getElementById('sync-bar');
        var msgEl = document.getElementById('sync-msg');
        var icon  = document.getElementById('sync-icon');
        if (!bar) return;
        msgEl.textContent = msg || 'Syncing to GitHub...';
        icon.innerHTML    = '<i class="fas fa-circle-notch fa-spin"></i>';
        bar.classList.remove('hidden', 'sync-error', 'sync-ok');
        bar.classList.add('sync-active');
    },

    hideSyncBar(status, msg) {
        status = status || 'ok';
        var bar   = document.getElementById('sync-bar');
        var msgEl = document.getElementById('sync-msg');
        var icon  = document.getElementById('sync-icon');
        if (!bar) return;
        bar.classList.remove('sync-active');
        if (status === 'ok') {
            icon.innerHTML    = '<i class="fas fa-check-circle"></i>';
            msgEl.textContent = msg || 'Saved to GitHub';
            bar.classList.add('sync-ok');
        } else {
            icon.innerHTML    = '<i class="fas fa-exclamation-circle"></i>';
            msgEl.textContent = msg || 'Sync failed - data saved locally';
            bar.classList.add('sync-error');
        }
        clearTimeout(this._hideTimer);
        var self = this;
        this._hideTimer = setTimeout(function() { bar.classList.add('hidden'); }, 4000);
    },

    // ================================================================
    // CORE API
    // ================================================================

    apiBase() {
        return 'https://api.github.com/repos/' + this.config.owner + '/' + this.config.repo;
    },

    headers() {
        return {
            'Authorization': 'token ' + this.config.token,
            'Accept':        'application/vnd.github.v3+json',
            'Content-Type':  'application/json'
        };
    },

    async getFileSHA(path) {
        // Return cached SHA if we have it (null = known new file, undefined = not yet fetched)
        if (this._shaCache[path] !== undefined) {
            return this._shaCache[path];
        }
        try {
            var res = await fetch(
                this.apiBase() + '/contents/' + path + '?ref=' + this.config.branch,
                { headers: this.headers() }
            );
            if (res.status === 404) {
                this._shaCache[path] = null;
                return null;
            }
            if (!res.ok) return null;
            var data = await res.json();
            this._shaCache[path] = data.sha || null;
            return this._shaCache[path];
        } catch(e) {
            return null;
        }
    },

    // ================================================================
    // COMMIT QUEUE — serialises all PUT requests so they never
    // run concurrently, which is what causes 409 conflicts.
    // ================================================================

    _enqueue(job) {
        var self = this;
        return new Promise(function(resolve, reject) {
            self._queue.push({ job: job, resolve: resolve, reject: reject });
            self._drainQueue();
        });
    },

    async _drainQueue() {
        if (this._running) return;
        if (!this._queue.length) return;
        this._running = true;
        while (this._queue.length > 0) {
            var item = this._queue.shift();
            try {
                var result = await item.job();
                item.resolve(result);
            } catch(err) {
                item.reject(err);
            }
        }
        this._running = false;
    },

    // ================================================================
    // COMMIT FILE (queued + retry on 409)
    // ================================================================

    async commitFile(path, content, commitMsg, isBinary) {
        if (!this.isConnected()) return false;
        var self = this;
        return this._enqueue(function() {
            return self._doCommit(path, content, commitMsg, isBinary || false, 1);
        });
    },

    async _doCommit(path, content, commitMsg, isBinary, attempt) {
        var MAX = 3;
        var sha = await this.getFileSHA(path);

        var body = {
            message: commitMsg,
            branch:  this.config.branch,
            content: isBinary ? content : btoa(unescape(encodeURIComponent(content)))
        };
        if (sha) body.sha = sha;

        var res = await fetch(this.apiBase() + '/contents/' + path, {
            method:  'PUT',
            headers: this.headers(),
            body:    JSON.stringify(body)
        });

        if (res.ok) {
            // Cache the new SHA returned in the response so future commits are instant
            try {
                var respData = await res.json();
                var newSha   = (respData && respData.content) ? respData.content.sha : null;
                if (newSha) this._shaCache[path] = newSha;
            } catch(e) { /* non-critical */ }
            return true;
        }

        if (res.status === 409 && attempt < MAX) {
            // SHA is stale — bust cache, wait, retry
            console.warn('GH 409 on attempt ' + attempt + ' for ' + path + ' - retrying...');
            delete this._shaCache[path];
            await this._sleep(400 * attempt);
            return this._doCommit(path, content, commitMsg, isBinary, attempt + 1);
        }

        console.error('GH commit failed (' + res.status + ') for ' + path);
        return false;
    },

    _sleep(ms) {
        return new Promise(function(r) { setTimeout(r, ms); });
    },

    // ================================================================
    // DEBOUNCED SYNC — collapses rapid saves into one commit
    // ================================================================

    syncData(players, fixtures, results) {
        if (!this.isConnected()) return Promise.resolve();

        // Store latest snapshot — previous pending snapshot is superseded
        this._pendingPayload = { players: players, fixtures: fixtures, results: results };

        clearTimeout(this._debounceTimer);
        var self = this;
        this._debounceTimer = setTimeout(function() { self._flushData(); }, 600);

        // Return a promise that resolves when the flush completes
        return new Promise(function(resolve) {
            var check = setInterval(function() {
                if (!self._debounceTimer) { clearInterval(check); resolve(); }
            }, 80);
            setTimeout(function() { clearInterval(check); resolve(); }, 12000);
        });
    },

    async _flushData() {
        this._debounceTimer  = null;
        if (!this._pendingPayload) return;
        var snap             = this._pendingPayload;
        this._pendingPayload = null;

        this.showSyncBar('Syncing to GitHub...');
        try {
            var payload = JSON.stringify(
                { players: snap.players, fixtures: snap.fixtures, results: snap.results, lastUpdated: new Date().toISOString() },
                null, 2
            );
            var ok = await this.commitFile(
                'data/league-data.json',
                payload,
                'Update league data - ' + new Date().toLocaleString('en-ZA')
            );
            this.hideSyncBar(
                ok ? 'ok'    : 'error',
                ok ? 'Saved to GitHub' : 'Sync failed - data saved locally'
            );
        } catch(err) {
            console.error('GH syncData error:', err);
            this.hideSyncBar('error', 'Sync error - data saved locally');
        }
    },

    // Force commit immediately (no debounce) — used by Force Sync button
    async syncDataNow(players, fixtures, results) {
        clearTimeout(this._debounceTimer);
        this._debounceTimer  = null;
        this._pendingPayload = null;

        this.showSyncBar('Force syncing...');
        try {
            var payload = JSON.stringify(
                { players: players, fixtures: fixtures, results: results, lastUpdated: new Date().toISOString() },
                null, 2
            );
            var ok = await this.commitFile(
                'data/league-data.json',
                payload,
                'Force sync - ' + new Date().toLocaleString('en-ZA')
            );
            this.hideSyncBar(ok ? 'ok' : 'error', ok ? 'Force sync complete' : 'Sync failed');
            return ok;
        } catch(err) {
            console.error('GH force sync error:', err);
            this.hideSyncBar('error', 'Sync error');
            return false;
        }
    },

    // ================================================================
    // MATCH IMAGE UPLOAD
    // ================================================================

    async uploadMatchImage(base64Data, filename) {
        if (!this.isConnected()) return null;
        this.showSyncBar('Uploading match screenshot...');
        try {
            var path = 'match-images/' + filename;
            var ok   = await this.commitFile(
                path,
                base64Data,
                'Match screenshot: ' + filename,
                true
            );
            if (ok) {
                this.hideSyncBar('ok', 'Screenshot saved to GitHub');
                return 'https://raw.githubusercontent.com/' + this.config.owner + '/' + this.config.repo + '/' + this.config.branch + '/' + path;
            } else {
                this.hideSyncBar('error', 'Image upload failed');
                return null;
            }
        } catch(err) {
            console.error('GH image upload error:', err);
            this.hideSyncBar('error', 'Image upload failed');
            return null;
        }
    },

    // ================================================================
    // LOAD REMOTE DATA
    // ================================================================

    async loadRemoteData() {
        if (!this.isConnected()) return null;
        this.showSyncBar('Loading data from GitHub...');
        try {
            var res = await fetch(
                this.apiBase() + '/contents/data/league-data.json?ref=' + this.config.branch,
                { headers: this.headers() }
            );
            if (!res.ok) {
                this.hideSyncBar('ok', 'No remote data yet - starting fresh');
                return null;
            }
            var file    = await res.json();
            var decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
            var data    = JSON.parse(decoded);

            // Warm SHA cache so first save after load skips the extra GET
            if (file.sha) this._shaCache['data/league-data.json'] = file.sha;

            this.hideSyncBar('ok', 'Data loaded from GitHub');
            return data;
        } catch(err) {
            console.error('GH load error:', err);
            this.hideSyncBar('error', 'Could not load remote data');
            return null;
        }
    },

    // ================================================================
    // TEST CONNECTION
    // ================================================================

    async testConnection() {
        if (!this.isConnected()) return { ok: false, msg: 'Not configured' };
        try {
            var res = await fetch(this.apiBase(), { headers: this.headers() });
            if (res.status === 200) return { ok: true,  msg: 'Connected!' };
            if (res.status === 401) return { ok: false, msg: 'Invalid token - check PAT has repo scope' };
            if (res.status === 404) return { ok: false, msg: 'Repo not found - check owner and repo name' };
            return { ok: false, msg: 'GitHub error ' + res.status };
        } catch(e) {
            return { ok: false, msg: 'Network error - are you online?' };
        }
    }
};
