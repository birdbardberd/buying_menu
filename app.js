// ============================================
//   おかいものリスト - アプリロジック
// ============================================

// ---- カテゴリ定義 ----
const CATEGORIES = [
  { id: 'vegetable',    label: '🥦 野菜',          cls: 'cat-vegetable' },
  { id: 'meat',         label: '🥩 肉',             cls: 'cat-meat' },
  { id: 'fish',         label: '🐟 魚',             cls: 'cat-fish' },
  { id: 'refrigerated', label: '🥚 肉・魚以外の冷蔵', cls: 'cat-refrigerated' },
  { id: 'pantry',       label: '🍱 常温保存',        cls: 'cat-pantry' },
  { id: 'other',        label: '🧴 その他',          cls: 'cat-other' },
];

// ---- データ管理 ----
let state = {
  menus: [],          // 献立マスター
  selectedMenuIds: [], // 今週選択した献立ID
  shoppingDone: {},   // { "材料名_献立ID": true } 購入済みフラグ
};

function loadState() {
  try {
    const saved = localStorage.getItem('shopping_app_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      state = { ...state, ...parsed };
    }
  } catch(e) {
    console.warn('データ読み込みエラー', e);
  }
  // サンプルデータ（初回のみ）
  if (state.menus.length === 0) {
    state.menus = [
      {
        id: uid(),
        name: '肉じゃが',
        ingredients: [
          { name: '牛肉', category: 'meat' },
          { name: 'じゃがいも', category: 'vegetable' },
          { name: '人参', category: 'vegetable' },
          { name: '玉ねぎ', category: 'vegetable' },
          { name: '醤油', category: 'pantry' },
        ]
      },
      {
        id: uid(),
        name: '鮭のムニエル',
        ingredients: [
          { name: '鮭の切り身', category: 'fish' },
          { name: 'バター', category: 'refrigerated' },
          { name: 'レモン', category: 'vegetable' },
        ]
      },
      {
        id: uid(),
        name: '親子丼',
        ingredients: [
          { name: '鶏もも肉', category: 'meat' },
          { name: '卵', category: 'refrigerated' },
          { name: '玉ねぎ', category: 'vegetable' },
          { name: 'めんつゆ', category: 'pantry' },
        ]
      },
    ];
    saveState();
  }
}

function saveState() {
  localStorage.setItem('shopping_app_v1', JSON.stringify(state));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---- タブ切り替え ----
function switchTab(screenId, btn) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + screenId).classList.add('active');
  btn.classList.add('active');

  if (screenId === 'shopping') renderShoppingList();
  if (screenId === 'settings') renderSettings();
}

// ---- 献立一覧レンダリング (画面A) ----
function renderMenuList() {
  const container = document.getElementById('menu-list-container');
  if (state.menus.length === 0) {
    container.innerHTML = '<p class="empty-msg">献立がまだありません。<br>下の＋ボタンから追加してみましょう！</p>';
    return;
  }
  container.innerHTML = state.menus.map(menu => {
    const selected = state.selectedMenuIds.includes(menu.id);
    const tags = menu.ingredients.map(ing =>
      `<span class="ingredient-tag">${escHtml(ing.name)}</span>`
    ).join('');
    return `
      <div class="menu-card ${selected ? 'selected' : ''}" onclick="toggleMenuSelection('${menu.id}')">
        <div class="menu-card__checkbox">
          <span class="menu-card__check-mark">✓</span>
        </div>
        <div class="menu-card__body">
          <div class="menu-card__name">${escHtml(menu.name)}</div>
          <div class="menu-card__ingredients">${tags}</div>
        </div>
        <div class="menu-card__actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="openEditMenu('${menu.id}')">✏️</button>
          <button class="btn-icon delete" onclick="deleteMenu('${menu.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

function toggleMenuSelection(menuId) {
  const idx = state.selectedMenuIds.indexOf(menuId);
  if (idx === -1) {
    state.selectedMenuIds.push(menuId);
  } else {
    state.selectedMenuIds.splice(idx, 1);
  }
  saveState();
  renderMenuList();
}

function deleteMenu(menuId) {
  if (!confirm('この献立を削除しますか？')) return;
  state.menus = state.menus.filter(m => m.id !== menuId);
  state.selectedMenuIds = state.selectedMenuIds.filter(id => id !== menuId);
  saveState();
  renderMenuList();
  showToast('献立を削除しました');
}

// ---- 買い物リストレンダリング (画面B) ----
function renderShoppingList() {
  const container = document.getElementById('shopping-list-container');

  // 選択された献立から材料をまとめる
  // { categoryId: [{name, menuName, key}] }
  const byCategory = {};
  CATEGORIES.forEach(c => { byCategory[c.id] = []; });

  state.selectedMenuIds.forEach(menuId => {
    const menu = state.menus.find(m => m.id === menuId);
    if (!menu) return;
    menu.ingredients.forEach(ing => {
      const key = ing.name + '_' + menuId;
      const catId = CATEGORIES.find(c => c.id === ing.category) ? ing.category : 'other';
      byCategory[catId].push({ name: ing.name, menuName: menu.name, key });
    });
  });

  // 重複材料をまとめる（同名 → まとめて表示、由来献立をタグに）
  const merged = {}; // { name: { menuNames:[], key, category } }
  CATEGORIES.forEach(c => {
    byCategory[c.id].forEach(item => {
      if (!merged[c.id]) merged[c.id] = {};
      if (!merged[c.id][item.name]) {
        merged[c.id][item.name] = { menuNames: [], key: item.key, done: !!state.shoppingDone[item.key] };
      }
      merged[c.id][item.name].menuNames.push(item.menuName);
      // 複数献立にまたがる場合は最初のkeyを使用（done管理は名前ベースに統一）
    });
  });

  // 選択献立が0のとき
  const totalItems = Object.values(byCategory).flat().length;
  if (totalItems === 0) {
    container.innerHTML = '<p class="empty-msg">「献立」タブで今週の献立を<br>選んでください📝</p>';
    return;
  }

  let html = '';
  CATEGORIES.forEach(cat => {
    if (!merged[cat.id] || Object.keys(merged[cat.id]).length === 0) return;
    html += `<div class="category-section">
      <div class="category-header ${cat.cls}">${cat.label}</div>`;

    Object.entries(merged[cat.id]).forEach(([name, info]) => {
      // doneキーは材料名で統一（複数献立で同名材料は1つにまとめる）
      const doneKey = 'item_' + name;
      const done = !!state.shoppingDone[doneKey];
      const menuTag = info.menuNames.join('・');
      html += `
        <div class="shopping-item ${done ? 'done' : ''}" onclick="toggleShoppingItem('${escAttr(doneKey)}')">
          <div class="shopping-item__check">
            <span class="shopping-item__check-mark">✓</span>
          </div>
          <div class="shopping-item__name">${escHtml(name)}</div>
          <div class="shopping-item__menu-tag">${escHtml(menuTag)}</div>
        </div>`;
    });

    html += `</div>`;
  });

  container.innerHTML = html;
}

function toggleShoppingItem(doneKey) {
  state.shoppingDone[doneKey] = !state.shoppingDone[doneKey];
  saveState();
  renderShoppingList();
}

function clearCheckedItems() {
  if (!confirm('購入済みの項目を一覧から削除しますか？')) return;
  // 完了済みアイテムに対応する献立・材料を除去
  const doneNames = Object.keys(state.shoppingDone)
    .filter(k => state.shoppingDone[k] && k.startsWith('item_'))
    .map(k => k.replace('item_', ''));

  // 選択済み献立から、完了した材料を削除
  state.menus.forEach(menu => {
    menu.ingredients = menu.ingredients.filter(ing => !doneNames.includes(ing.name));
  });
  // 空になった献立の選択を外す
  state.selectedMenuIds = state.selectedMenuIds.filter(id => {
    const menu = state.menus.find(m => m.id === id);
    return menu && menu.ingredients.length > 0;
  });
  state.shoppingDone = {};
  saveState();
  renderShoppingList();
  showToast('完了済みを削除しました');
}

// ---- 献立追加モーダル ----
function openAddMenuModal() {
  document.getElementById('input-menu-name').value = '';
  document.getElementById('ingredient-list').innerHTML = '';
  addIngredientRow(); // 最初の1行を追加
  openModal('modal-add-menu');
  setTimeout(() => document.getElementById('input-menu-name').focus(), 300);
}

function addIngredientRow() {
  const list = document.getElementById('ingredient-list');
  const row = createIngredientRow();
  list.appendChild(row);
}

function addEditIngredientRow() {
  const list = document.getElementById('edit-ingredient-list');
  const row = createIngredientRow();
  list.appendChild(row);
}

function createIngredientRow(name = '', category = 'vegetable') {
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  const opts = CATEGORIES.map(c =>
    `<option value="${c.id}" ${c.id === category ? 'selected' : ''}>${c.label}</option>`
  ).join('');
  div.innerHTML = `
    <input type="text" class="form-input ing-name" placeholder="材料名" value="${escHtml(name)}" />
    <select class="ingredient-category-select ing-cat">${opts}</select>
    <button class="btn-remove-ing" onclick="this.parentElement.remove()">×</button>
  `;
  return div;
}

function getIngredientsFromRows(listId) {
  const rows = document.querySelectorAll(`#${listId} .ingredient-row`);
  const result = [];
  rows.forEach(row => {
    const name = row.querySelector('.ing-name').value.trim();
    const category = row.querySelector('.ing-cat').value;
    if (name) result.push({ name, category });
  });
  return result;
}

function saveMenu() {
  const name = document.getElementById('input-menu-name').value.trim();
  if (!name) { showToast('献立名を入力してください'); return; }
  const ingredients = getIngredientsFromRows('ingredient-list');
  if (ingredients.length === 0) { showToast('材料を1つ以上追加してください'); return; }

  state.menus.push({ id: uid(), name, ingredients });
  saveState();
  closeModal('modal-add-menu');
  renderMenuList();
  showToast('献立を追加しました！');
}

// ---- 献立編集モーダル ----
function openEditMenu(menuId) {
  const menu = state.menus.find(m => m.id === menuId);
  if (!menu) return;
  document.getElementById('edit-menu-id').value = menuId;
  document.getElementById('edit-menu-name').value = menu.name;
  const list = document.getElementById('edit-ingredient-list');
  list.innerHTML = '';
  menu.ingredients.forEach(ing => {
    list.appendChild(createIngredientRow(ing.name, ing.category));
  });
  openModal('modal-edit-menu');
}

function saveEditMenu() {
  const menuId = document.getElementById('edit-menu-id').value;
  const name = document.getElementById('edit-menu-name').value.trim();
  if (!name) { showToast('献立名を入力してください'); return; }
  const ingredients = getIngredientsFromRows('edit-ingredient-list');
  if (ingredients.length === 0) { showToast('材料を1つ以上追加してください'); return; }

  const menu = state.menus.find(m => m.id === menuId);
  if (menu) {
    menu.name = name;
    menu.ingredients = ingredients;
  }
  saveState();
  closeModal('modal-edit-menu');
  renderMenuList();
  showToast('献立を更新しました！');
}

// ---- 設定画面 ----
function renderSettings() {
  const container = document.getElementById('settings-container');
  container.innerHTML = `
    <div class="settings-section">
      <h3>データ管理</h3>
      <button class="settings-btn" onclick="exportData()">📤 データをエクスポート（JSON）</button>
      <button class="settings-btn" onclick="importDataPrompt()">📥 データをインポート</button>
      <input type="file" id="import-file" accept=".json" style="display:none" onchange="importData(event)" />
    </div>
    <div class="settings-section">
      <h3>リセット</h3>
      <button class="settings-btn danger" onclick="resetShoppingList()">🗑 買い物リストをリセット（選択解除）</button>
      <button class="settings-btn danger" onclick="resetAll()">⚠️ 全データを初期化</button>
    </div>
    <div class="settings-section">
      <h3>アプリについて</h3>
      <p style="font-size:13px;color:var(--color-text-light);line-height:1.7">
        おかいものリスト v1.0<br>
        献立を選ぶだけで、スーパーのカテゴリ別に<br>自動整列した買い物リストを生成します。
      </p>
    </div>
  `;
}

function exportData() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'shopping_app_backup.json';
  a.click();
}

function importDataPrompt() {
  document.getElementById('import-file').click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      state = data;
      saveState();
      renderMenuList();
      showToast('インポート完了！');
    } catch(err) {
      showToast('ファイルの形式が正しくありません');
    }
  };
  reader.readAsText(file);
}

function resetShoppingList() {
  if (!confirm('今週の選択と購入済み情報をリセットしますか？')) return;
  state.selectedMenuIds = [];
  state.shoppingDone = {};
  saveState();
  renderMenuList();
  showToast('買い物リストをリセットしました');
}

function resetAll() {
  if (!confirm('全データを初期化します。この操作は元に戻せません。よろしいですか？')) return;
  localStorage.removeItem('shopping_app_v1');
  location.reload();
}

// ---- モーダル開閉ユーティリティ ----
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function closeModalOnOverlay(event, id) {
  if (event.target.id === id) closeModal(id);
}

// ---- トースト通知 ----
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast') || createToast();
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function createToast() {
  const div = document.createElement('div');
  div.id = 'toast';
  document.body.appendChild(div);
  return div;
}

// ---- HTML エスケープ ----
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

// ---- 初期化 ----
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderMenuList();
});
