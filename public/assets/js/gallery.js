let galleryItems = [];

function mediaFileName(item) {
  return item.original_filename || `${item.id}.${item.media_type === 'video' ? 'mp4' : 'jpg'}`;
}

function createDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function getSelectedBoxes() {
  return Array.from(document.querySelectorAll('#gallery-grid input[type="checkbox"]:checked'));
}

function updateSelectionState() {
  const selected = getSelectedBoxes();
  const count = selected.length;
  const strip = document.getElementById('selection-strip');
  const countText = document.getElementById('selection-count');
  const btn = document.getElementById('download-selected-media');

  if (strip) strip.hidden = count === 0;
  if (countText) countText.textContent = count === 1 ? '1 item gekies' : `${count} items gekies`;
  if (btn) btn.disabled = count === 0;

  document.querySelectorAll('.media-card').forEach((card) => {
    const checkbox = card.querySelector('input[type="checkbox"]');
    card.classList.toggle('selected', Boolean(checkbox?.checked));
  });
}

function openUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked');
  setTimeout(() => document.getElementById('password')?.focus(), 50);
}

function closeUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('locked');
}

function openMediaModal(item) {
  const modal = document.getElementById('media-modal');
  const preview = document.getElementById('media-preview');
  const filename = document.getElementById('media-filename');
  const download = document.getElementById('media-download-link');
  if (!modal || !preview || !download) return;

  preview.innerHTML = '';
  let el;
  if (item.media_type === 'video') {
    el = document.createElement('video');
    el.src = item.url;
    el.controls = true;
    el.autoplay = false;
    el.playsInline = true;
  } else if ((item.mime_type || '').includes('heic')) {
    el = document.createElement('img');
    el.src = '/assets/images/gallery-placeholder.jpg';
    el.alt = 'HEIC foto voorskou nie beskikbaar nie';
  } else {
    el = document.createElement('img');
    el.src = item.url;
    el.alt = item.original_filename || 'Wedding foto';
  }
  preview.appendChild(el);

  const name = mediaFileName(item);
  if (filename) filename.textContent = name;
  download.href = item.downloadUrl;
  download.download = name;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked');
}

function closeMediaModal() {
  const modal = document.getElementById('media-modal');
  const preview = document.getElementById('media-preview');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (preview) preview.innerHTML = '';
  document.body.classList.remove('locked');
}

function renderGallery(items, options = {}) {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  if (!grid) return;

  grid.innerHTML = '';
  if (!items.length) {
    if (empty) empty.style.display = 'block';
    updateSelectionState();
    return;
  }
  if (empty) empty.style.display = 'none';

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.dataset.id = item.id;

    const mediaButton = document.createElement('button');
    mediaButton.type = 'button';
    mediaButton.className = 'media-preview-button';
    mediaButton.setAttribute('aria-label', `Maak ${mediaFileName(item)} oop`);
    mediaButton.addEventListener('click', () => openMediaModal(item));

    let mediaEl;
    if (item.media_type === 'video') {
      mediaEl = document.createElement('video');
      mediaEl.src = item.url;
      mediaEl.muted = true;
      mediaEl.playsInline = true;
      mediaEl.preload = 'metadata';
    } else if ((item.mime_type || '').includes('heic')) {
      mediaEl = document.createElement('img');
      mediaEl.src = '/assets/images/gallery-placeholder.jpg';
      mediaEl.alt = 'HEIC foto';
    } else {
      mediaEl = document.createElement('img');
      mediaEl.src = item.url;
      mediaEl.alt = item.original_filename || 'Wedding foto';
      mediaEl.loading = 'lazy';
    }
    mediaButton.appendChild(mediaEl);

    const selectPill = document.createElement('label');
    selectPill.className = 'select-pill';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    checkbox.dataset.downloadUrl = item.downloadUrl;
    checkbox.dataset.filename = mediaFileName(item);
    checkbox.addEventListener('change', updateSelectionState);
    selectPill.appendChild(checkbox);
    selectPill.append(' Kies');

    const footer = document.createElement('div');
    footer.className = 'media-footer';

    const openBtn = document.createElement('button');
    openBtn.className = 'download-link inline-button';
    openBtn.type = 'button';
    openBtn.textContent = 'Bekyk';
    openBtn.addEventListener('click', () => openMediaModal(item));

    const download = document.createElement('a');
    download.className = 'download-link';
    download.href = item.downloadUrl;
    download.download = mediaFileName(item);
    download.textContent = 'Laai af';

    if (options.selectable === false) selectPill.style.display = 'none';
    footer.appendChild(openBtn);
    footer.appendChild(download);

    card.appendChild(mediaButton);
    card.appendChild(selectPill);
    card.appendChild(footer);
    grid.appendChild(card);
  }
  updateSelectionState();
}

async function loadGallery(options = {}) {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  try {
    const response = await fetch('/api/gallery');
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Gallery kon nie gelaai word nie.');
    galleryItems = result.items || [];
    renderGallery(galleryItems, options);
  } catch (error) {
    const empty = document.getElementById('gallery-empty');
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = error.message || 'Gallery kon nie gelaai word nie.';
    }
  }
}

async function downloadSelectedItems() {
  const selected = getSelectedBoxes();
  if (!selected.length) {
    alert('Kies asseblief eers ten minste een item.');
    return;
  }
  for (const box of selected) {
    createDownload(box.dataset.downloadUrl, box.dataset.filename);
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
}

function initGalleryControls() {
  const selectAll = document.getElementById('select-all-media');
  const clearSelection = document.getElementById('clear-media-selection');
  const downloadSelected = document.getElementById('download-selected-media');
  const downloadSelectedStrip = document.getElementById('download-selected-media-strip');

  if (selectAll) {
    selectAll.addEventListener('click', () => {
      document.querySelectorAll('#gallery-grid input[type="checkbox"]').forEach((box) => { box.checked = true; });
      updateSelectionState();
    });
  }

  if (clearSelection) {
    clearSelection.addEventListener('click', () => {
      document.querySelectorAll('#gallery-grid input[type="checkbox"]').forEach((box) => { box.checked = false; });
      updateSelectionState();
    });
  }

  if (downloadSelected) downloadSelected.addEventListener('click', downloadSelectedItems);
  if (downloadSelectedStrip) downloadSelectedStrip.addEventListener('click', downloadSelectedItems);

  document.querySelectorAll('[data-open-upload]').forEach((btn) => btn.addEventListener('click', openUploadModal));
  document.querySelectorAll('[data-close-upload]').forEach((btn) => btn.addEventListener('click', closeUploadModal));
  document.querySelectorAll('[data-close-media]').forEach((btn) => btn.addEventListener('click', closeMediaModal));

  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      if (modal.id === 'upload-modal') closeUploadModal();
      if (modal.id === 'media-modal') closeMediaModal();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeUploadModal();
    closeMediaModal();
  });
}

window.afterSuccessfulUpload = async function afterSuccessfulUpload() {
  await loadGallery();
};

initGalleryControls();
loadGallery();
