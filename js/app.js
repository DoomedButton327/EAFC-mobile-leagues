/* ============================================================
   METTLESTATE × EA FC MOBILE LEAGUE — App.js
   ============================================================ */

// ---- STATE ----
let players  = JSON.parse(localStorage.getItem('eafc_players'))  || [];
let fixtures = JSON.parse(localStorage.getItem('eafc_fixtures')) || [];
let results  = JSON.parse(localStorage.getItem('eafc_results'))  || [];

// Pending match image (set when user picks a file before submitting score)
let pendingMatchImage = null; // { base64: '...', filename: '...', previewUrl: '...' }

// ---- INIT ----
document.addEventListener('DOMContentLoaded', async () => {
    GH.load();
    initNavigation();

    // If GitHub is configured, try to load remote data on first load
    if (GH.isConnected()) {
        const remote = await GH.loadRemoteData();
        if (remote) {
            if (remote.players)  players  = remote.players;
            if (remote.fixtures) fixtures = remote.fixtures;
            if (remote.results)  results  = remote.results;
            saveLocalOnly(); // mirror to localStorage
        }
    }

    renderAll();

    // File input listeners
    document.getElementById('playerImport').addEventListener('change', e => {
        document.getElementById('file-chosen').textContent = e.target.files[0]?.name || 'No file chosen';
    });

    document.getElementById('matchImageInput').addEventListener('change', handleMatchImagePick);

    document.getElementById('importBackup').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.players)  players  = data.players;
                if (data.fixtures) fixtures = data.fixtures;
                if (data.results)  results  = data.results;
                saveData();
                renderAll();
                toast('Backup restored successfully!', 'success');
            } catch { toast('Invalid backup file.', 'error'); }
        };
        reader.readAsText(file);
    });
});

// ---- NAVIGATION ----
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
            if (btn.dataset.tab === 'admin') renderEvidenceGrid();
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === tabId));
}

// ---- RENDER ALL ----
function renderAll() {
    renderLeaderboard();
    renderFixtures();
    renderResults();
    renderPlayerManagement();
    updatePlayerDatalist();
    updateScoreSelect();
    updatePlayerCount();
}

// ---- LEADERBOARD ----
function renderLeaderboard() {
    const sorted = sortedPlayers();
    const tbody  = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    // Podium
    const podium = document.getElementById('podium-area');
    if (sorted.length >= 3) {
        podium.style.display = 'grid';
        const [first, second, third] = sorted;
        podium.innerHTML = `
            <div class="podium-card rank-2"><div class="podium-medal">🥈</div><div class="podium-name">${second.username}</div><div class="podium-pts">2nd · <strong>${second.points}</strong> pts</div></div>
            <div class="podium-card rank-1"><div class="podium-medal">🥇</div><div class="podium-name">${first.username}</div><div class="podium-pts">1st · <strong>${first.points}</strong> pts</div></div>
            <div class="podium-card rank-3"><div class="podium-medal">🥉</div><div class="podium-name">${third.username}</div><div class="podium-pts">3rd · <strong>${third.points}</strong> pts</div></div>
        `;
    } else {
        podium.style.display = 'none';
    }

    sorted.forEach((p, i) => {
        const rank  = i + 1;
        const gd    = (p.gf || 0) - (p.ga || 0);
        const gdStr = gd > 0 ? `<span class="gd-pos">+${gd}</span>` : gd < 0 ? `<span class="gd-neg">${gd}</span>` : `<span>${gd}</span>`;
        const pos   = rank <= 3 ? `pos-${rank}` : 'pos-n';
        const zone  = rank <= 3 ? 'zone-champ' : (sorted.length >= 5 && rank >= sorted.length - 1 ? 'zone-danger' : '');
        const form  = buildFormBadges(p.form || []);
        const tr = document.createElement('tr');
        tr.className = zone;
        tr.innerHTML = `
            <td><span class="pos-badge ${pos}">${rank}</span></td>
            <td><div class="player-cell-name">${p.name}</div><div class="player-cell-username">${p.username}</div></td>
            <td>${p.played||0}</td><td>${p.wins||0}</td><td>${p.draws||0}</td><td>${p.losses||0}</td>
            <td>${p.gf||0}</td><td>${p.ga||0}</td><td>${gdStr}</td>
            <td class="pts-cell">${p.points||0}</td>
            <td><div class="form-badges">${form}</div></td>
        `;
        tbody.appendChild(tr);
    });
}

function sortedPlayers() {
    return [...players].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = (a.gf||0)-(a.ga||0), gdB = (b.gf||0)-(b.ga||0);
        if (gdB !== gdA) return gdB - gdA;
        return (b.gf||0) - (a.gf||0);
    });
}

function buildFormBadges(form) {
    return (form||[]).slice(-5).map(r =>
        r === 'W' ? `<span class="form-w">W</span>` :
        r === 'D' ? `<span class="form-d">D</span>` :
                    `<span class="form-l">L</span>`
    ).join('');
}

// ---- FIXTURES ----
function renderFixtures() {
    const grid = document.getElementById('fixtures-grid');
    grid.innerHTML = '';
    
    if (!fixtures.length) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-futbol"></i>No fixtures scheduled yet.<br>Use Admin to generate or add matches.</div>`;
        return;
    }
    
    fixtures.forEach(match => {
        const homePlayer  = players.find(p => p.username === match.home);
        const awayPlayer  = players.find(p => p.username === match.away);
        
        const homeDisplay  = homePlayer  ? `\( {homePlayer.name}<div class="username-small"> \){homePlayer.username}</div>`  : match.home;
        const awayDisplay  = awayPlayer  ? `\( {awayPlayer.name}<div class="username-small"> \){awayPlayer.username}</div>`  : match.away;
        
        const div = document.createElement('div');
        div.className = 'fixture-card';
        div.innerHTML = `
            <div class="fixture-player">${homeDisplay}</div>
            <div class="vs-badge">VS</div>
            <div class="fixture-player">${awayDisplay}</div>
            <div class="match-actions">
                <button class="btn-win-home"  onclick="resolveMatch('\( {match.id}','home')" title=" \){match.home} wins">🏆 ${truncate(match.home,8)}</button>
                <button class="btn-match-draw" onclick="resolveMatch('${match.id}','draw')">DRAW</button>
                <button class="btn-win-away"  onclick="resolveMatch('\( {match.id}','away')" title=" \){match.away} wins">🏆 ${truncate(match.away,8)}</button>
            </div>
        `;
        grid.appendChild(div);
    });
}

// ---- RESULTS ----
function renderResults() {
    const list = document.getElementById('results-list');
    list.innerHTML = '';
    if (!results.length) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-check-double"></i>No results recorded yet.</div>`;
        return;
    }
    [...results].reverse().forEach(r => {
        const homeWon = r.result === 'home', awayWon = r.result === 'away', isDraw = r.result === 'draw';
        const scoreDisplay = r.homeGoals !== undefined ? `${r.homeGoals} — ${r.awayGoals}` : (isDraw ? 'DRAW' : homeWon ? 'WIN' : 'WIN');
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <div class="result-home">
                <div class="result-player-name ${homeWon?'winner':''}">${r.home}</div>
                ${homeWon ? '<span class="result-badge badge-win">WIN</span>' : isDraw ? '<span class="result-badge badge-draw">DRAW</span>' : '<span class="result-badge badge-loss">LOSS</span>'}
            </div>
            <div class="score-box">${scoreDisplay}</div>
            <div class="result-away">
                <div class="result-player-name ${awayWon?'winner':''}">${r.away}</div>
                ${awayWon ? '<span class="result-badge badge-win">WIN</span>' : isDraw ? '<span class="result-badge badge-draw">DRAW</span>' : '<span class="result-badge badge-loss">LOSS</span>'}
            </div>
        `;
        list.appendChild(div);
    });
}

// ---- PLAYER MANAGEMENT ----
function renderPlayerManagement() {
    const tbody = document.getElementById('playerMgmtBody');
    tbody.innerHTML = '';
    players.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="pos-badge pos-n">${i+1}</span></td>
            <td><div class="player-cell-name">${p.name}</div></td>
            <td><div class="player-cell-username" style="color:var(--text)">${p.username}</div></td>
            <td style="color:var(--muted);font-size:0.85rem">${p.phone||'N/A'}</td>
            <td style="font-size:0.82rem;color:var(--muted)">P:${p.played||0} W:${p.wins||0} D:${p.draws||0} L:${p.losses||0}</td>
            <td><button onclick="deletePlayer(${i})" style="background:rgba(255,59,59,0.1);color:var(--red);border:1px solid rgba(255,59,59,0.2);padding:6px 12px;font-size:0.75rem;margin:0;width:auto;"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

// ---- EVIDENCE GRID (admin only) ----
function renderEvidenceGrid() {
    const grid = document.getElementById('evidence-grid');
    if (!grid) return;
    const withImages = results.filter(r => r.imageUrl);
    if (!withImages.length) {
        grid.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;">No evidence images yet.</p>`;
        return;
    }
    grid.innerHTML = '';
    [...withImages].reverse().forEach(r => {
        const card = document.createElement('div');
        card.className = 'evidence-card';
        card.innerHTML = `
            <img src="${r.imageUrl}" alt="Match screenshot" onclick="openLightbox('${r.imageUrl}','${r.home} vs ${r.away}')">
            <div class="evidence-label">${r.home} vs ${r.away}</div>
            <div class="evidence-score">${r.homeGoals !== undefined ? `${r.homeGoals}–${r.awayGoals}` : r.result.toUpperCase()}</div>
        `;
        grid.appendChild(card);
    });
}

// ---- LIGHTBOX ----
function openLightbox(src, caption) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('lightbox-caption').textContent = caption;
    document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
}

// ---- MATCH IMAGE PICK ----
function handleMatchImagePick(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        const dataUrl = ev.target.result;
        const base64  = dataUrl.split(',')[1];
        const ext     = file.name.split('.').pop() || 'png';
        const ts      = Date.now();
        const sel     = document.getElementById('scoreFixtureSelect');
        const matchLabel = sel.options[sel.selectedIndex]?.text?.replace(/\s+/g,'_') || 'match';
        const filename = `${matchLabel}_${ts}.${ext}`;

        pendingMatchImage = { base64, filename, previewUrl: dataUrl };

        // Show preview
        document.getElementById('match-image-preview').src = dataUrl;
        document.getElementById('match-image-preview-wrap').style.display = 'block';
        document.getElementById('matchImageLabel').innerHTML = `<i class="fas fa-check-circle" style="color:var(--green)"></i> Image attached`;
    };
    reader.readAsDataURL(file);
}

function clearMatchImage() {
    pendingMatchImage = null;
    document.getElementById('matchImageInput').value = '';
    document.getElementById('match-image-preview-wrap').style.display = 'none';
    document.getElementById('matchImageLabel').innerHTML = `<i class="fas fa-image"></i> Attach Screenshot (optional)`;
}

// ---- RESOLVE MATCH (quick, no score) ----
function resolveMatch(id, result) {
    const idx = fixtures.findIndex(f => String(f.id) === String(id));
    if (idx === -1) return;
    const match = fixtures[idx];
    const homeP = players.find(p => p.username === match.home);
    const awayP = players.find(p => p.username === match.away);
    if (!homeP || !awayP) return;

    homeP.played = (homeP.played||0)+1;
    awayP.played = (awayP.played||0)+1;

    if (result === 'draw') {
        homeP.draws=(homeP.draws||0)+1; homeP.points=(homeP.points||0)+1;
        awayP.draws=(awayP.draws||0)+1; awayP.points=(awayP.points||0)+1;
        addForm(homeP,'D'); addForm(awayP,'D');
    } else if (result === 'home') {
        homeP.wins=(homeP.wins||0)+1; homeP.points=(homeP.points||0)+3;
        awayP.losses=(awayP.losses||0)+1;
        addForm(homeP,'W'); addForm(awayP,'L');
    } else {
        awayP.wins=(awayP.wins||0)+1; awayP.points=(awayP.points||0)+3;
        homeP.losses=(homeP.losses||0)+1;
        addForm(homeP,'L'); addForm(awayP,'W');
    }

    results.push({ home: match.home, away: match.away, result, id: Date.now() });
    fixtures.splice(idx, 1);
    saveData();
    renderAll();
    toast(`Result logged: ${match.home} vs ${match.away}`, 'success');
}

// ---- LOG SCORE (with goals + optional image) ----
async function logScore() {
    const sel = document.getElementById('scoreFixtureSelect');
    const hg  = parseInt(document.getElementById('scoreHome').value);
    const ag  = parseInt(document.getElementById('scoreAway').value);
    const id  = sel.value;

    if (!id)               { toast('Select a fixture', 'error');       return; }
    if (isNaN(hg)||isNaN(ag)) { toast('Enter both scores', 'error'); return; }

    const idx = fixtures.findIndex(f => String(f.id) === String(id));
    if (idx === -1) return;
    const match = fixtures[idx];
    const homeP = players.find(p => p.username === match.home);
    const awayP = players.find(p => p.username === match.away);
    if (!homeP || !awayP) return;

    homeP.played=(homeP.played||0)+1; awayP.played=(awayP.played||0)+1;
    homeP.gf=(homeP.gf||0)+hg; homeP.ga=(homeP.ga||0)+ag;
    awayP.gf=(awayP.gf||0)+ag; awayP.ga=(awayP.ga||0)+hg;

    let result;
    if (hg > ag) {
        result='home'; homeP.wins=(homeP.wins||0)+1; homeP.points=(homeP.points||0)+3; awayP.losses=(awayP.losses||0)+1;
        addForm(homeP,'W'); addForm(awayP,'L');
    } else if (ag > hg) {
        result='away'; awayP.wins=(awayP.wins||0)+1; awayP.points=(awayP.points||0)+3; homeP.losses=(homeP.losses||0)+1;
        addForm(homeP,'L'); addForm(awayP,'W');
    } else {
        result='draw'; homeP.draws=(homeP.draws||0)+1; homeP.points=(homeP.points||0)+1;
        awayP.draws=(awayP.draws||0)+1; awayP.points=(awayP.points||0)+1;
        addForm(homeP,'D'); addForm(awayP,'D');
    }

    // Build result entry
    const entry = { home: match.home, away: match.away, result, homeGoals: hg, awayGoals: ag, id: Date.now() };

    // Upload image if attached
    if (pendingMatchImage) {
        toast('Uploading screenshot…', 'success');
        const imageUrl = await GH.uploadMatchImage(pendingMatchImage.base64, pendingMatchImage.filename);
        if (imageUrl) entry.imageUrl = imageUrl;
        // If not connected to GitHub, store the base64 locally as a fallback
        if (!imageUrl && pendingMatchImage) entry.imageDataUrl = pendingMatchImage.previewUrl;
    }

    results.push(entry);
    fixtures.splice(idx, 1);

    // Reset image state
    clearMatchImage();
    document.getElementById('scoreHome').value = '';
    document.getElementById('scoreAway').value = '';

    saveData();
    renderAll();
    toast(`Score logged: ${match.home} ${hg}–${ag} ${match.away}`, 'success');
}

function addForm(player, r) {
    if (!player.form) player.form = [];
    player.form.push(r);
    if (player.form.length > 10) player.form = player.form.slice(-10);
}

function updateScoreSelect() {
    const sel = document.getElementById('scoreFixtureSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select Fixture —</option>';
    fixtures.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.home} vs ${f.away}`;
        sel.appendChild(opt);
    });
}

// ---- IMPORT PLAYERS ----
function processImport() {
    const file = document.getElementById('playerImport').files[0];
    if (!file) { toast('Select a file first', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        let added = 0;
        e.target.result.split('\n').filter(l=>l.trim()).forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const username = parts[1].trim();
                if (!players.some(p => p.username === username)) {
                    players.push(mkPlayer(parts[0].trim(), username, parts[2]?.trim()||'N/A'));
                    added++;
                }
            }
        });
        saveData();
        renderAll();
        toast(`Imported ${added} players. Total: ${players.length}`, 'success');
    };
    reader.readAsText(file);
}

function addSinglePlayer() {
    const name     = document.getElementById('addName').value.trim();
    const username = document.getElementById('addUsername').value.trim();
    const phone    = document.getElementById('addPhone').value.trim();
    if (!name||!username) { toast('Name and username required','error'); return; }
    if (players.some(p=>p.username===username)) { toast('Username already exists','error'); return; }
    players.push(mkPlayer(name, username, phone||'N/A'));
    saveData(); renderAll();
    ['addName','addUsername','addPhone'].forEach(id => document.getElementById(id).value = '');
    toast(`${username} added!`, 'success');
}

function mkPlayer(name, username, phone) {
    return { name, username, phone, played:0, wins:0, draws:0, losses:0, points:0, gf:0, ga:0, form:[] };
}

function deletePlayer(index) {
    if (!confirm(`Remove ${players[index].username} from the league?`)) return;
    players.splice(index, 1);
    saveData(); renderAll();
    toast('Player removed', 'success');
}

// ---- GENERATE DRAW ----
function generateDraw() {
    if (players.length < 2) { toast('Not enough players!', 'error'); return; }
    const mode = document.getElementById('matchday-select').value;
    let newFixtures = [];

    if (mode === 'roundrobin') {
        for (let i = 0; i < players.length; i++) {
            for (let j = i+1; j < players.length; j++) {
                const exists = fixtures.some(f =>
                    (f.home===players[i].username&&f.away===players[j].username)||
                    (f.home===players[j].username&&f.away===players[i].username)
                );
                if (!exists) newFixtures.push({ home:players[i].username, away:players[j].username, id:Date.now()+Math.random() });
            }
        }
    } else {
        const shuffled = [...players].sort(()=>0.5-Math.random());
        for (let i=0; i<shuffled.length-1; i+=2)
            newFixtures.push({ home:shuffled[i].username, away:shuffled[i+1].username, id:Date.now()+i });
    }
    fixtures = [...fixtures, ...newFixtures];
    saveData(); renderAll(); switchTab('fixtures');
    toast(`Generated ${newFixtures.length} fixtures`, 'success');
}

function addManualMatch() {
    const p1 = document.getElementById('p1Input').value.trim();
    const p2 = document.getElementById('p2Input').value.trim();
    if (!p1||!p2)  { toast('Enter both usernames','error'); return; }
    if (p1===p2)   { toast('Players must be different','error'); return; }
    fixtures.push({ home:p1, away:p2, id:Date.now() });
    saveData(); renderAll();
    document.getElementById('p1Input').value = '';
    document.getElementById('p2Input').value = '';
    toast(`Fixture added: ${p1} vs ${p2}`, 'success');
}

function updatePlayerDatalist() {
    ['player-list-p1','player-list-p2'].forEach(id => {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = '';
        players.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.username;
            dl.appendChild(opt);
        });
    });
}

function updatePlayerCount() {
    const el = document.getElementById('player-count');
    if (el) el.textContent = players.length;
}

// ---- GITHUB CONFIG (called from Admin buttons) ----
async function saveGitHubConfig() {
    const owner  = document.getElementById('ghOwner').value.trim();
    const repo   = document.getElementById('ghRepo').value.trim();
    const branch = document.getElementById('ghBranch').value.trim() || 'main';
    const token  = document.getElementById('ghToken').value.trim();

    if (!owner||!repo||!token) { toast('Owner, repo, and token are required','error'); return; }

    const statusEl = document.getElementById('gh-connect-status');
    statusEl.textContent = 'Testing connection…';
    statusEl.className = 'gh-status-msg';

    GH.save(owner, repo, branch, token);
    const test = await GH.testConnection();

    if (!test.ok) {
        statusEl.textContent = '✗ ' + test.msg;
        statusEl.className = 'gh-status-msg gh-status-error';
        toast('Connection failed: ' + test.msg, 'error');
        return;
    }

    statusEl.textContent = '✓ Connected — checking for remote data…';
    statusEl.className = 'gh-status-msg gh-status-ok';

    // ALWAYS pull remote data first before doing anything.
    // This prevents a fresh device/browser (with empty memory) from
    // overwriting the real GitHub data with an empty commit.
    const remote = await GH.loadRemoteData();

    if (remote && (remote.players?.length || remote.fixtures?.length || remote.results?.length)) {
        // Remote has real data — load it, never overwrite
        if (remote.players)  players  = remote.players;
        if (remote.fixtures) fixtures = remote.fixtures;
        if (remote.results)  results  = remote.results;
        saveLocalOnly();
        renderAll();
        statusEl.textContent = '✓ Loaded ' + players.length + ' players from GitHub';
        toast('Connected & data loaded from GitHub!', 'success');
    } else {
        // Remote is empty or file doesn\'t exist yet — safe to push local data up
        await GH.syncData(players, fixtures, results);
        statusEl.textContent = '✓ Connected — local data pushed to GitHub';
        toast('Connected! Local data pushed to GitHub.', 'success');
    }

    GH.updateStatusUI();
}

function disconnectGitHub() {
    if (!confirm('Disconnect from GitHub? Data will still be saved locally.')) return;
    GH.disconnect();
    document.getElementById('gh-connect-status').textContent = '';
    document.getElementById('ghToken').value = '';
    toast('GitHub disconnected. Data stays local.', 'success');
}

async function forceSyncToGitHub() {
    if (!GH.isConnected()) { toast('Not connected to GitHub','error'); return; }
    await GH.syncData(players, fixtures, results);
}

// ---- DATA SAVE ----
// saveData: saves locally AND syncs to GitHub
async function saveData() {
    saveLocalOnly();
    if (GH.isConnected()) {
        await GH.syncData(players, fixtures, results);
    }
}

function saveLocalOnly() {
    localStorage.setItem('eafc_players',  JSON.stringify(players));
    localStorage.setItem('eafc_fixtures', JSON.stringify(fixtures));
    localStorage.setItem('eafc_results',  JSON.stringify(results));
}

function exportData() {
    const blob = new Blob([JSON.stringify({players,fixtures,results},null,2)], {type:'application/json'});
    const link = document.createElement('a');
    link.download = `Mettlestate_Backup_${dateStamp()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    toast('Backup exported!', 'success');
}

function clearData() {
    if (!confirm('⚠️ This will DELETE all players, fixtures, and results. Are you absolutely sure?')) return;
    localStorage.clear();
    players=[]; fixtures=[]; results=[];
    renderAll();
    toast('League reset.', 'success');
}

// ---- IMAGE EXPORT ----
function downloadFixtureImage() {
    if (!fixtures.length) { toast('No fixtures to export','error'); return; }
    
    const list = document.getElementById('poster-fixture-list');
    list.innerHTML = '';
    
    fixtures.forEach(f => {
        // Look up real names by username
        const homePlayer = players.find(p => p.username === f.home);
        const awayPlayer = players.find(p => p.username === f.away);
        
        const homeDisplay  = homePlayer  ? homePlayer.name  : f.home;
        const awayDisplay  = awayPlayer  ? awayPlayer.name  : f.away;
        
        const row = document.createElement('div');
        row.className = 'poster-match-row';
        row.innerHTML = `
            <div class="poster-match-home">${homeDisplay}</div>
            <div class="poster-match-vs">VS</div>
            <div class="poster-match-away">${awayDisplay}</div>
        `;
        list.appendChild(row);
    });
    
    captureElement('fixture-capture-area', `Mettlestate_Fixtures_${dateStamp()}.png`, 'Fixtures image downloaded!');
}

function downloadLeaderboardImage() {
    if (!players.length) { toast('No players to export','error'); return; }
    const sorted = sortedPlayers();
    const container = document.getElementById('poster-lb-table');
    container.innerHTML = '';
    
    const header = document.createElement('div');
    header.className = 'poster-lb-header';
    header.innerHTML = `<div>#</div><div>PLAYER</div><div>P</div><div>W</div><div>D</div><div>L</div><div>PTS</div>`;
    container.appendChild(header);
    
    sorted.forEach((p, i) => {
        const rank = i + 1;
        const posClass = rank === 1 ? 'poster-lb-pos-1' :
                        rank === 2 ? 'poster-lb-pos-2' :
                        rank === 3 ? 'poster-lb-pos-3' : '';
                        
        const row = document.createElement('div');
        row.className = 'poster-lb-row';
        row.innerHTML = `
            <div class="\( {posClass}"> \){rank}</div>
            <div>
                ${p.name}
                <div style="font-size:0.85em; color:#aaa; margin-top:2px;">${p.username}</div>
            </div>
            <div>${p.played||0}</div>
            <div>${p.wins||0}</div>
            <div>${p.draws||0}</div>
            <div>${p.losses||0}</div>
            <div class="poster-lb-pts">${p.points||0}</div>
        `;
        container.appendChild(row);
    });
    
    captureElement('lb-capture-area', `Mettlestate_Standings_${dateStamp()}.png`, 'Standings image downloaded!');
}

function downloadRulesImage() {
    const liveRules = document.getElementById('rules-content');
    document.getElementById('poster-rules-content').innerHTML = liveRules.innerHTML;
    captureElement('rules-capture-area', `Mettlestate_Rules_Season1.png`, 'Rules image downloaded!');
}

function captureElement(elementId, filename, successMsg) {
    const el = document.getElementById(elementId);
    el.style.position   = 'fixed';
    el.style.top        = '0';
    el.style.left       = '0';
    el.style.visibility = 'visible';
    el.style.zIndex     = '-1';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            html2canvas(el, {
                scale: 2, useCORS: true, allowTaint: true,
                backgroundColor: '#0A0A0C', logging: false,
                onclone: doc => {
                    const c = doc.getElementById(elementId);
                    if (c) { c.style.visibility='visible'; c.style.position='static'; c.style.left='0'; c.style.top='0'; c.style.zIndex='1'; }
                }
            }).then(canvas => {
                el.style.position='absolute'; el.style.top='0'; el.style.left='-9999px'; el.style.visibility='hidden'; el.style.zIndex='-1';
                const link = document.createElement('a');
                link.download = filename;
                link.href = canvas.toDataURL('image/png');
                link.click();
                toast(successMsg, 'success');
            }).catch(() => {
                el.style.position='absolute'; el.style.left='-9999px'; el.style.visibility='hidden';
                toast('Export failed. Try again.', 'error');
            });
        });
    });
}

// ---- MODAL ----
function openModal(html) { document.getElementById('modal-body').innerHTML=html; document.getElementById('modal-overlay').classList.add('open'); }
function closeModal()     { document.getElementById('modal-overlay').classList.remove('open'); }

// ---- TOAST ----
function toast(msg, type='success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast ${type} show`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

// ---- HELPERS ----
function truncate(str, n) { return str.length>n ? str.slice(0,n)+'…' : str; }
function dateStamp()      { return new Date().toLocaleDateString('en-ZA').replace(/\//g,'-'); }
