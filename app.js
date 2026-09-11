const BOARDS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  title: `Tapete cozinha ${String(i + 1).padStart(2, '0')}`,
  image: `images/prancha-${String(i + 1).padStart(2, '0')}.jpg`
}));

const config = window.POLL_CONFIG || {};
const hasConfig = config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('__SUPABASE');
const client = hasConfig ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;

const state = { counts: {}, voted: new Set(), pending: new Set() };
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
const galleryEl = document.querySelector('#galleryBoards');
const galleryStatus = document.querySelector('#galleryStatus');
const closeDialog = document.querySelector('#closeDialog');

function renderCards() {
  boardsEl.innerHTML = BOARDS.map(board => `
    <div class="column is-half-tablet is-one-third-desktop">
    <article class="card board-card" data-board="${board.id}">
      <button type="button" class="card-image image-wrap" data-open="${board.id}" aria-label="Ampliar ${board.title}">
        <img src="${board.image}" alt="${board.title}" loading="${board.id <= 2 ? 'eager' : 'lazy'}" decoding="async" width="1055" height="1491" />
        <span class="tag is-primary badge">${String(board.id).padStart(2, '0')}</span>
        <span class="tag is-white zoom-hint" aria-hidden="true">Ampliar &#8599;</span>
      </button>
      <div class="card-content card-foot">
        <div class="board-title">${board.title}</div>
        <button class="button is-primary is-outlined like-btn" data-like="${board.id}" type="button" aria-label="Votar em ${board.title}" aria-pressed="false" ${hasConfig ? '' : 'disabled'}>
          <span class="heart" aria-hidden="true">&#9829;</span><span class="vote-label">Quero este</span>
          <span class="count">0</span>
        </button>
      </div>
    </article>
    </div>
  `).join('');

  galleryEl.innerHTML = BOARDS.map(board => `
    <article class="gallery-board" id="gallery-board-${board.id}" aria-labelledby="gallery-name-${board.id}">
      <div class="gallery-board-bar">
        <h3 id="gallery-name-${board.id}" class="board-title">${board.title} <span class="gallery-position">/ 14</span></h3>
        <button class="button is-primary is-outlined like-btn" data-like="${board.id}" type="button" aria-label="Votar em ${board.title}" aria-pressed="false" ${hasConfig ? '' : 'disabled'}>
          <span class="heart" aria-hidden="true">&#9829;</span><span class="vote-label">Quero este</span><span class="count">0</span>
        </button>
      </div>
      <img src="${board.image}" alt="Detalhes de ${board.title}" loading="lazy" decoding="async" width="1055" height="1491" />
    </article>
  `).join('');

  document.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => {
    dialog.showModal();
    const selected = document.querySelector(`#gallery-board-${el.dataset.open}`);
    galleryEl.scrollTo({ left: selected.offsetLeft, top: 0, behavior: 'instant' });
    selected.scrollTop = 0;
    updateGalleryNavigation();
    const likeButton = selected.querySelector('[data-like]');
    (likeButton.disabled ? galleryEl : likeButton).focus({ preventScroll: true });
  }));

  document.querySelectorAll('[data-like]').forEach(btn => btn.addEventListener('click', () => toggleVote(Number(btn.dataset.like), btn)));
}

function renderCounts() {
  let total = 0;
  BOARDS.forEach(board => {
    const count = state.counts[board.id] || 0;
    total += count;
    document.querySelectorAll(`[data-like="${board.id}"]`).forEach(btn => {
      btn.disabled = !client || state.pending.has(board.id);
      btn.setAttribute('aria-busy', state.pending.has(board.id) ? 'true' : 'false');
      btn.querySelector('.count').textContent = count;
      btn.classList.toggle('liked', state.voted.has(board.id));
      btn.classList.toggle('is-outlined', !state.voted.has(board.id));
      btn.querySelector('.vote-label').textContent = state.voted.has(board.id) ? 'Escolhida' : 'Quero este';
      btn.setAttribute('aria-label', `${state.voted.has(board.id) ? 'Remover voto de' : 'Votar em'} ${board.title}, ${count} votos`);
      btn.setAttribute('aria-pressed', state.voted.has(board.id) ? 'true' : 'false');
    });
  });
  totalEl.textContent = total;

  const sorted = [...BOARDS].sort((a, b) => (state.counts[b.id] || 0) - (state.counts[a.id] || 0) || a.id - b.id);
  rankingEl.innerHTML = sorted.map((board, index) => `
    <div class="panel-block rank-row">
      <div class="rank-pos">#${index + 1}</div>
      <div class="rank-name">${board.title}</div>
      <div class="tag is-primary is-light rank-votes">${state.counts[board.id] || 0} ♥</div>
    </div>
  `).join('');
}

async function loadVotes() {
  if (!client) {
    statusEl.innerHTML = '<span class="error">Enquete ainda não conectada ao banco de votos.</span>';
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
  if (!client || btn.disabled || state.pending.has(boardId)) return;
  state.pending.add(boardId);
  galleryStatus.textContent = '';
  renderCounts();
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
    galleryStatus.textContent = 'N\u00e3o foi poss\u00edvel registrar o voto. Tente novamente.';
    statusEl.innerHTML = '<span class="error">Não foi possível registrar o voto. Tente novamente.</span>';
  } finally {
    state.pending.delete(boardId);
    renderCounts();
  }
}

function updateGalleryNavigation() {
  const index = Math.round(galleryEl.scrollLeft / (galleryEl.clientWidth || 1));
  document.querySelector('#previousBoard').disabled = index <= 0;
  document.querySelector('#nextBoard').disabled = index >= BOARDS.length - 1;
}

function navigateGallery(direction) {
  const index = Math.round(galleryEl.scrollLeft / (galleryEl.clientWidth || 1));
  const next = Math.max(0, Math.min(BOARDS.length - 1, index + direction));
  const selected = document.querySelector(`#gallery-board-${next + 1}`);
  selected.scrollTop = 0;
  galleryEl.scrollTo({ left: selected.offsetLeft, behavior: 'instant' });
  updateGalleryNavigation();
}

galleryEl.addEventListener('scroll', updateGalleryNavigation, { passive: true });
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    navigateGallery(event.key === 'ArrowRight' ? 1 : -1);
  }
});
document.querySelector('#previousBoard').addEventListener('click', () => navigateGallery(-1));
document.querySelector('#nextBoard').addEventListener('click', () => navigateGallery(1));
refreshBtn.addEventListener('click', loadVotes);
closeDialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

renderCards();
loadVotes();
setInterval(loadVotes, 20000);
