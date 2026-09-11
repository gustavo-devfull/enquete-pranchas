const BUCKET = 'poll-images';
const config = window.POLL_CONFIG || {};
const hasConfig = config.supabaseUrl && config.supabaseKey && !config.supabaseUrl.includes('__SUPABASE');
const client = hasConfig ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;

const authCard = document.querySelector('#authCard');
const panel = document.querySelector('#panel');
const loginForm = document.querySelector('#loginForm');
const authError = document.querySelector('#authError');
const loginBtn = document.querySelector('#loginBtn');
const signupBtn = document.querySelector('#signupBtn');
const logoutBtn = document.querySelector('#logoutBtn');
const adminUser = document.querySelector('#adminUser');
const statusEl = document.querySelector('#status');
const addForm = document.querySelector('#addForm');
const addBtn = document.querySelector('#addBtn');
const listEl = document.querySelector('#boardList');

let boards = [];
let votes = {};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function setStatus(message, isError = false) {
  statusEl.innerHTML = isError ? `<span class="error">${escapeHtml(message)}</span>` : escapeHtml(message);
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle('is-loading', busy);
}

// ---------- Autenticação ----------
async function handleSession(session) {
  if (!session) {
    panel.hidden = true;
    authCard.hidden = false;
    logoutBtn.hidden = true;
    return;
  }
  const { data: isAdmin, error } = await client.rpc('is_admin');
  if (error || !isAdmin) {
    await client.auth.signOut();
    authError.textContent = 'Este e-mail não tem permissão para administrar a enquete.';
    return;
  }
  authError.textContent = '';
  authCard.hidden = true;
  panel.hidden = false;
  logoutBtn.hidden = false;
  adminUser.textContent = `Conectado como ${session.user.email}`;
  await loadBoards();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  authError.textContent = '';
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  if (!email || password.length < 6) { authError.textContent = 'Informe e-mail e senha (mínimo 6 caracteres).'; return; }
  setBusy(loginBtn, true);
  const { error } = await client.auth.signInWithPassword({ email, password });
  setBusy(loginBtn, false);
  if (error) authError.textContent = error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message;
});

signupBtn.addEventListener('click', async () => {
  authError.textContent = '';
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  if (!email || password.length < 6) { authError.textContent = 'Preencha e-mail e escolha uma senha com pelo menos 6 caracteres.'; return; }
  setBusy(signupBtn, true);
  const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.href } });
  setBusy(signupBtn, false);
  if (error) { authError.textContent = error.message; return; }
  if (!data.session) authError.textContent = 'Enviamos um e-mail de confirmação. Abra o link e depois clique em Entrar.';
});

logoutBtn.addEventListener('click', () => client.auth.signOut());

// ---------- Dados ----------
async function loadBoards() {
  setStatus('Carregando…');
  const [boardsRes, votesRes] = await Promise.all([
    client.from('boards').select('id,title,image_url,position,active').order('position').order('id'),
    client.from('board_votes').select('board_id')
  ]);
  if (boardsRes.error) { setStatus('Erro ao carregar tapetes.', true); console.error(boardsRes.error); return; }
  boards = boardsRes.data;
  votes = {};
  for (const row of votesRes.data || []) votes[row.board_id] = (votes[row.board_id] || 0) + 1;
  renderList();
  setStatus(`${boards.length} tapetes cadastrados, ${boards.filter(b => b.active).length} visíveis na enquete.`);
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
}

async function uploadImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `boards/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeImage(url) {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) console.warn('Imagem antiga não removida:', error.message);
}

function validateFile(file) {
  if (!file) return 'Selecione uma imagem.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use uma imagem JPG, PNG ou WebP.';
  if (file.size > 8 * 1024 * 1024) return 'A imagem precisa ter até 8 MB.';
  return null;
}

// ---------- Adicionar ----------
addForm.addEventListener('submit', async event => {
  event.preventDefault();
  const title = document.querySelector('#newTitle').value.trim();
  const file = document.querySelector('#newImage').files[0];
  if (!title) { setStatus('Informe o nome do tapete.', true); return; }
  const fileError = validateFile(file);
  if (fileError) { setStatus(fileError, true); return; }
  setBusy(addBtn, true);
  try {
    const image_url = await uploadImage(file);
    const position = boards.reduce((max, b) => Math.max(max, b.position), 0) + 1;
    const { error } = await client.from('boards').insert({ title, image_url, position });
    if (error) throw error;
    addForm.reset();
    await loadBoards();
    setStatus(`"${title}" adicionado à enquete.`);
  } catch (err) {
    console.error(err);
    setStatus(`Não foi possível adicionar: ${err.message}`, true);
  } finally {
    setBusy(addBtn, false);
  }
});

// ---------- Lista ----------
function renderList() {
  if (!boards.length) { listEl.innerHTML = '<p class="small">Nenhum tapete cadastrado ainda.</p>'; return; }
  listEl.innerHTML = boards.map((board, index) => `
    <article class="box board-row ${board.active ? '' : 'is-inactive'}" data-id="${board.id}">
      <div class="board-thumb">
        <img src="${escapeHtml(board.image_url)}" alt="" loading="lazy" decoding="async" />
        <span class="tag is-primary badge">${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="board-fields">
        <div class="field">
          <label class="label" for="title-${board.id}">Nome</label>
          <div class="control"><input class="input" id="title-${board.id}" data-title type="text" maxlength="80" value="${escapeHtml(board.title)}" /></div>
        </div>
        <div class="board-meta">
          <label class="checkbox"><input type="checkbox" data-active ${board.active ? 'checked' : ''} /> Visível na enquete</label>
          <span class="tag is-primary is-light">${votes[board.id] || 0} ♥ votos</span>
          <span class="small">ID ${board.id}</span>
        </div>
        <div class="buttons are-small board-actions">
          <button class="button is-primary" type="button" data-save>Salvar</button>
          <label class="button is-primary is-outlined">Trocar imagem<input type="file" data-image accept="image/jpeg,image/png,image/webp" hidden /></label>
          <button class="button is-light" type="button" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover para cima">&uarr;</button>
          <button class="button is-light" type="button" data-move="1" ${index === boards.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo">&darr;</button>
          <button class="button is-danger is-outlined" type="button" data-delete>Excluir</button>
        </div>
      </div>
    </article>
  `).join('');
}

listEl.addEventListener('click', async event => {
  const row = event.target.closest('.board-row');
  if (!row) return;
  const id = Number(row.dataset.id);
  const board = boards.find(b => b.id === id);
  if (!board) return;

  if (event.target.matches('[data-save]')) {
    const title = row.querySelector('[data-title]').value.trim();
    const active = row.querySelector('[data-active]').checked;
    if (!title) { setStatus('O nome não pode ficar vazio.', true); return; }
    setBusy(event.target, true);
    const { error } = await client.from('boards').update({ title, active }).eq('id', id);
    setBusy(event.target, false);
    if (error) { setStatus(`Erro ao salvar: ${error.message}`, true); return; }
    await loadBoards();
    setStatus(`"${title}" salvo.`);
  }

  if (event.target.matches('[data-move]')) {
    const direction = Number(event.target.dataset.move);
    const index = boards.indexOf(board);
    if (!boards[index + direction]) return;
    // Renumera todos para garantir posições distintas mesmo com empates herdados
    const order = boards.map(b => b.id);
    [order[index], order[index + direction]] = [order[index + direction], order[index]];
    const results = await Promise.all(order.map((boardId, i) => client.from('boards').update({ position: i + 1 }).eq('id', boardId)));
    const failed = results.find(r => r.error);
    if (failed) { setStatus(`Erro ao reordenar: ${failed.error.message}`, true); return; }
    await loadBoards();
  }

  if (event.target.matches('[data-delete]')) {
    const count = votes[id] || 0;
    const ok = confirm(`Excluir "${board.title}"?${count ? ` Isso apaga também ${count} voto(s).` : ''} Esta ação não pode ser desfeita.`);
    if (!ok) return;
    setBusy(event.target, true);
    const { error } = await client.from('boards').delete().eq('id', id);
    if (error) { setBusy(event.target, false); setStatus(`Erro ao excluir: ${error.message}`, true); return; }
    await removeImage(board.image_url);
    await loadBoards();
    setStatus(`"${board.title}" excluído.`);
  }
});

listEl.addEventListener('change', async event => {
  if (!event.target.matches('[data-image]')) return;
  const row = event.target.closest('.board-row');
  const id = Number(row.dataset.id);
  const board = boards.find(b => b.id === id);
  const file = event.target.files[0];
  const fileError = validateFile(file);
  if (fileError) { setStatus(fileError, true); event.target.value = ''; return; }
  const label = event.target.closest('label');
  label.classList.add('is-loading');
  try {
    const image_url = await uploadImage(file);
    const { error } = await client.from('boards').update({ image_url }).eq('id', id);
    if (error) throw error;
    await removeImage(board.image_url);
    await loadBoards();
    setStatus(`Imagem de "${board.title}" atualizada.`);
  } catch (err) {
    console.error(err);
    setStatus(`Não foi possível trocar a imagem: ${err.message}`, true);
  } finally {
    label.classList.remove('is-loading');
  }
});

// ---------- Início ----------
if (!client) {
  authError.textContent = 'Backend não configurado em config.js.';
  loginBtn.disabled = signupBtn.disabled = true;
} else {
  client.auth.onAuthStateChange((event, session) => {
    if (['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) handleSession(session);
  });
}
