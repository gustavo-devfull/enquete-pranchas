// Lista usada apenas quando o backend não está configurado
const FALLBACK_BOARDS = Array.from({ length: 14 }, (_, i) => ({
  id: i + 1,
  title: `Tapete cozinha ${String(i + 1).padStart(2, '0')}`,
  image: `images/prancha-${String(i + 1).padStart(2, '0')}.jpg`
}));
let BOARDS = FALLBACK_BOARDS;

const config = window.POLL_CONFIG || {};
const hasConfig = config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('__SUPABASE');
const client = hasConfig ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;

const state = { counts: {}, voted: new Set(), selected: new Set(), ready: false, dirty: false, submitting: false, submitted: false, loading: false };
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
const submitBtn = document.querySelector('#submitVotes');
const submitStatus = document.querySelector('#submitStatus');
const resultsEl = document.querySelector('#results');
const dialog = document.querySelector('#imageDialog');
const galleryEl = document.querySelector('#galleryBoards');
const galleryStatus = document.querySelector('#galleryStatus');
const closeDialog = document.querySelector('#closeDialog');

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function loadBoards() {
  if (!client) return;
  const { data, error } = await client.from('boards').select('id,title,image_url,position').eq('active', true).order('position').order('id');
  if (error) { console.error(error); return; }
  if (data.length) BOARDS = data.map(row => ({ id: row.id, title: row.title, image: row.image_url }));
}

function renderCards() {
  boardsEl.innerHTML = BOARDS.map((board, index) => `
    <div class="column is-half-tablet is-one-third-desktop">
    <article class="card board-card" data-board="${board.id}">
      <button type="button" class="card-image image-wrap" data-open="${board.id}" aria-label="Ampliar ${escapeHtml(board.title)}">
        <img src="${escapeHtml(board.image)}" alt="${escapeHtml(board.title)}" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" width="1055" height="1491" />
        <span class="tag is-primary badge">${String(index + 1).padStart(2, '0')}</span>
        <span class="tag is-white zoom-hint" aria-hidden="true">Ampliar &#8599;</span>
      </button>
      <div class="card-content card-foot">
        <div class="board-title">${escapeHtml(board.title)}</div>
        <button class="button is-primary is-outlined like-btn" data-like="${board.id}" type="button" aria-label="Votar em ${escapeHtml(board.title)}" aria-pressed="false" ${hasConfig ? '' : 'disabled'}>
          <span class="heart" aria-hidden="true">&#9829;</span><span class="vote-label">Gosto</span>

        </button>
      </div>
    </article>
    </div>
  `).join('');

  galleryEl.innerHTML = BOARDS.map((board, index) => `
    <article class="gallery-board" id="gallery-board-${board.id}" aria-labelledby="gallery-name-${board.id}">
      <div class="gallery-board-bar">
        <h3 id="gallery-name-${board.id}" class="board-title">${escapeHtml(board.title)} <span class="gallery-position">${index + 1} / ${BOARDS.length}</span></h3>
        <button class="button is-primary is-outlined like-btn" data-like="${board.id}" type="button" aria-label="Votar em ${escapeHtml(board.title)}" aria-pressed="false" ${hasConfig ? '' : 'disabled'}>
          <span class="heart" aria-hidden="true">&#9829;</span><span class="vote-label">Gosto</span>
        </button>
      </div>
      <img src="${escapeHtml(board.image)}" alt="Detalhes de ${escapeHtml(board.title)}" loading="lazy" decoding="async" width="1055" height="1491" />
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
      btn.disabled = !client || !state.ready || state.submitting || state.submitted;
      btn.setAttribute('aria-busy', state.submitting ? 'true' : 'false');
      btn.classList.toggle('liked', state.selected.has(board.id));
      btn.classList.toggle('is-outlined', !state.selected.has(board.id));
      btn.querySelector('.vote-label').textContent = 'Gosto';
      btn.setAttribute('aria-label', `${state.selected.has(board.id) ? 'Desmarcar' : 'Marcar gosto em'} ${board.title}`);
      btn.setAttribute('aria-pressed', state.selected.has(board.id) ? 'true' : 'false');
    });
  });
  totalEl.textContent = total;
  submitBtn.disabled = !client || !state.ready || state.submitting || state.submitted || (!state.selected.size && !state.dirty);
  submitBtn.textContent = state.submitting ? 'Enviando votos...' : 'Enviar votos';
  submitBtn.setAttribute('aria-busy', String(state.submitting));
  refreshBtn.disabled = state.submitting || state.loading;

  const sorted = [...BOARDS].sort((a, b) => (state.counts[b.id] || 0) - (state.counts[a.id] || 0) || a.id - b.id);
  rankingEl.innerHTML = sorted.slice(0, 5).map((board, index) => `
    <div class="panel-block rank-row">
      <div class="rank-pos">#${index + 1}</div>
      <img class="rank-image" src="${escapeHtml(board.image)}" alt="${escapeHtml(board.title)}" loading="lazy" decoding="async" width="1055" height="1491" />
      <div class="rank-name">${escapeHtml(board.title)}</div>
      <div class="tag is-primary is-light rank-votes">${state.counts[board.id] || 0} ♥</div>
    </div>
  `).join('');
}

async function loadVotes({ afterSubmit = false } = {}) {
  if (state.loading || (state.submitting && !afterSubmit)) return false;
  if (!client) {
    statusEl.textContent = 'Enquete ainda não conectada ao banco de votos.';
    renderCounts();
    return false;
  }
  state.loading = true;
  renderCounts();
  try {
    const { data, error } = await client.from('board_votes').select('board_id,voter_id');
    if (error) throw error;
    state.counts = {};
    state.voted.clear();
    const knownIds = new Set(BOARDS.map(board => board.id));
    for (const row of data) {
      if (!knownIds.has(row.board_id)) continue;
      state.counts[row.board_id] = (state.counts[row.board_id] || 0) + 1;
      if (row.voter_id === voterId) state.voted.add(row.board_id);
    }
    if (!state.dirty && !state.submitting) state.selected = new Set(state.voted);
    state.ready = true;
    statusEl.textContent = state.submitted
      ? 'Votos enviados. Suas escolhas foram confirmadas.'
      : 'Marque os modelos de que gostou e envie seus votos no final.';
    return true;
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Erro ao carregar votos. Tente atualizar novamente.';
    return false;
  } finally {
    state.loading = false;
    renderCounts();
  }
}

function toggleVote(boardId, btn) {
  if (!client || !state.ready || state.submitting || state.submitted || btn.disabled) return;
  if (state.selected.has(boardId)) state.selected.delete(boardId);
  else state.selected.add(boardId);
  state.dirty = true;
  submitBtn.hidden = false;
  galleryStatus.textContent = '';
  submitStatus.textContent = 'Escolhas alteradas. Clique em Enviar votos para confirmar.';
  renderCounts();
}

async function submitVotes() {
  if (submitBtn.disabled || state.submitting || state.submitted) return;
  state.submitting = true;
  submitStatus.textContent = 'Enviando seus votos...';
  renderCounts();
  try {
    // Reload saved votes so retrying a partial submission does not duplicate votes.
    const { data, error } = await client.from('board_votes').select('board_id').eq('voter_id', voterId);
    if (error) throw error;
    const saved = new Set(data.map(row => row.board_id));
    for (const board of BOARDS) {
      if (state.selected.has(board.id) && !saved.has(board.id)) {
        const { error } = await client.from('board_votes').insert({ board_id: board.id, voter_id: voterId });
        if (error && error.code !== '23505') throw error;
      } else if (!state.selected.has(board.id) && saved.has(board.id)) {
        const { error } = await client.from('board_votes').delete().eq('board_id', board.id).eq('voter_id', voterId);
        if (error) throw error;
      }
    }
    state.voted = new Set(state.selected);
    state.dirty = false;
    state.submitted = true;
    submitBtn.hidden = true;
    while (state.loading) await new Promise(resolve => setTimeout(resolve, 50));
    const refreshed = await loadVotes({ afterSubmit: true });
    submitStatus.textContent = refreshed
      ? 'Votos enviados com sucesso! Confira os mais votados abaixo.'
      : 'Votos enviados. Não foi possível atualizar os resultados; clique em Atualizar resultados.';
    resultsEl.hidden = false;
    document.querySelector('#rankingTitle').focus({ preventScroll: true });
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error(error);
    submitStatus.textContent = 'Não foi possível concluir o envio. Suas escolhas foram mantidas; clique em Enviar votos para tentar novamente.';
  } finally {
    state.submitting = false;
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
  const selected = galleryEl.children[next];
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
refreshBtn.addEventListener('click', () => loadVotes());
submitBtn.addEventListener('click', submitVotes);
closeDialog.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

(async () => {
  await loadBoards();
  renderCards();
  loadVotes();
  setInterval(loadVotes, 20000);
})();
