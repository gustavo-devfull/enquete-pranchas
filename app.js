const BOARDS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  title: `Prancha ${String(i + 1).padStart(2, '0')}`,
  image: `images/prancha-${String(i + 1).padStart(2, '0')}.png`
}));

const config = window.POLL_CONFIG || {};
const hasConfig = config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('__SUPABASE');
const client = hasConfig ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;

const state = { counts: {}, voted: new Set() };
const voterKey = 'pranchas_poll_voter_id';
let voterId = localStorage.getItem(voterKey);
if (!voterId) {
  voterId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(voterKey, voterId);
}

const boardsEl = document.querySelector('#boards');
const rankingEl = document.querySelector('#ranking');
const statusEl = document.querySelector('#status');
const totalEl = document.querySelector('#totalVotes');
const refreshBtn = document.querySelector('#refreshBtn');
const dialog = document.querySelector('#imageDialog');
const dialogImage = document.querySelector('#dialogImage');
const closeDialog = document.querySelector('#closeDialog');

function renderCards() {
  boardsEl.innerHTML = BOARDS.map(board => `
    <article class="card" data-board="${board.id}">
      <div class="image-wrap" data-open="${board.image}">
        <img src="${board.image}" alt="${board.title}" loading="lazy" />
        <span class="badge">${String(board.id).padStart(2, '0')}</span>
      </div>
      <div class="card-foot">
        <div class="board-title">${board.title}</div>
        <button class="like-btn" data-like="${board.id}" type="button" ${hasConfig ? '' : 'disabled'}>
          <span class="heart">♥</span>
          <span class="count">0</span>
        </button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => {
    dialogImage.src = el.dataset.open;
    dialog.showModal();
  }));

  document.querySelectorAll('[data-like]').forEach(btn => btn.addEventListener('click', () => toggleVote(Number(btn.dataset.like), btn)));
}

function renderCounts() {
  let total = 0;
  BOARDS.forEach(board => {
    const count = state.counts[board.id] || 0;
    total += count;
    const btn = document.querySelector(`[data-like="${board.id}"]`);
    if (btn) {
      btn.querySelector('.count').textContent = count;
      btn.classList.toggle('liked', state.voted.has(board.id));
      btn.setAttribute('aria-pressed', state.voted.has(board.id) ? 'true' : 'false');
    }
  });
  totalEl.textContent = total;

  const sorted = [...BOARDS].sort((a, b) => (state.counts[b.id] || 0) - (state.counts[a.id] || 0) || a.id - b.id);
  rankingEl.innerHTML = sorted.map((board, index) => `
    <div class="rank-row">
      <div class="rank-pos">#${index + 1}</div>
      <div class="rank-name">${board.title}</div>
      <div class="rank-votes">${state.counts[board.id] || 0} ♥</div>
    </div>
  `).join('');
}

async function loadVotes() {
  if (!client) {
    statusEl.innerHTML = '<span class="error">Backend ainda não configurado.</span>';
    renderCounts();
    return;
  }
  statusEl.textContent = 'Atualizando votos…';
  const { data, error } = await client.from('board_votes').select('board_id,voter_id');
  if (error) {
    statusEl.innerHTML = `<span class="error">Erro ao carregar votos.</span>`;
    console.error(error);
    return;
  }
  state.counts = {};
  state.voted.clear();
  for (const row of data) {
    state.counts[row.board_id] = (state.counts[row.board_id] || 0) + 1;
    if (row.voter_id === voterId) state.voted.add(row.board_id);
  }
  renderCounts();
  statusEl.textContent = 'Resultados atualizados agora.';
}

async function toggleVote(boardId, btn) {
  if (!client || btn.disabled) return;
  btn.disabled = true;
  const alreadyVoted = state.voted.has(boardId);
  try {
    if (alreadyVoted) {
      const { error } = await client.from('board_votes').delete().eq('board_id', boardId).eq('voter_id', voterId);
      if (error) throw error;
      state.voted.delete(boardId);
      state.counts[boardId] = Math.max(0, (state.counts[boardId] || 1) - 1);
    } else {
      const { error } = await client.from('board_votes').insert({ board_id: boardId, voter_id: voterId });
      if (error && error.code !== '23505') throw error;
      if (!error) {
        state.voted.add(boardId);
        state.counts[boardId] = (state.counts[boardId] || 0) + 1;
      }
    }
    renderCounts();
  } catch (err) {
    console.error(err);
    statusEl.innerHTML = '<span class="error">Não foi possível registrar o voto. Tente novamente.</span>';
  } finally {
    btn.disabled = false;
  }
}

refreshBtn.addEventListener('click', loadVotes);
closeDialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

renderCards();
loadVotes();
setInterval(loadVotes, 20000);
