const uploadForm = document.getElementById('upload-form');
const progressList = document.getElementById('upload-progress');

function uploadStatus(message, type = 'info') {
  const status = document.getElementById('upload-status');
  if (!status) return;
  status.textContent = message;
  status.className = `status show ${type}`;
}

function addProgress(message) {
  if (!progressList) return;
  const item = document.createElement('div');
  item.className = 'progress-item';
  item.textContent = message;
  progressList.prepend(item);
}

function classifyFile(file) {
  const type = file.type || '';
  const name = file.name.toLowerCase();
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic)$/i.test(name)) return 'image';
  if (type.startsWith('video/') || /\.(mp4|mov)$/i.test(name)) return 'video';
  return 'other';
}

function validateBatch(files) {
  const imageFiles = files.filter((file) => classifyFile(file) === 'image');
  const videoFiles = files.filter((file) => classifyFile(file) === 'video');
  const invalidFiles = files.filter((file) => classifyFile(file) === 'other');

  if (invalidFiles.length) return 'Gebruik asseblief net foto’s of video’s: jpg, jpeg, png, webp, heic, mp4 of mov.';
  if (imageFiles.length > 20) return 'Laai asseblief maksimum 20 foto’s op een slag op.';
  if (videoFiles.length > 2) return 'Laai asseblief maksimum 2 video’s op een slag op.';

  for (const file of imageFiles) {
    if (file.size > 15 * 1024 * 1024) return `${file.name} is groter as 15 MB.`;
  }
  for (const file of videoFiles) {
    if (file.size > 50 * 1024 * 1024) return `${file.name} is groter as 50 MB.`;
  }
  return '';
}

if (uploadForm) {
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = uploadForm.querySelector('button[type="submit"]');
    const form = new FormData(uploadForm);
    const password = String(form.get('password') || '').trim();
    const uploaderName = String(form.get('uploaderName') || '').trim();
    const uploaderMessage = String(form.get('uploaderMessage') || '').trim();
    const files = Array.from(document.getElementById('media-files')?.files || []);

    if (!password) {
      uploadStatus('Vul asseblief die trou-password in.', 'error');
      return;
    }
    if (!files.length) {
      uploadStatus('Kies asseblief ten minste een foto of video.', 'error');
      return;
    }
    const validationError = validateBatch(files);
    if (validationError) {
      uploadStatus(validationError, 'error');
      return;
    }

    submitBtn.disabled = true;
    uploadStatus('Besig om op te laai...', 'info');

    let uploaded = 0;
    try {
      for (const file of files) {
        const itemForm = new FormData();
        itemForm.append('password', password);
        itemForm.append('uploaderName', uploaderName);
        itemForm.append('uploaderMessage', uploaderMessage);
        itemForm.append('file', file);
        addProgress(`Laai op: ${file.name}`);
        const response = await fetch('/api/upload', { method: 'POST', body: itemForm });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `${file.name} kon nie opgelaai word nie.`);
        uploaded += 1;
        addProgress(`Klaar: ${file.name}`);
      }
      uploadStatus(`Dankie! ${uploaded} item(s) is opgelaai.`, 'success');
      uploadForm.reset();
      if (typeof window.afterSuccessfulUpload === 'function') {
        await window.afterSuccessfulUpload();
      } else if (typeof loadGallery === 'function') {
        await loadGallery();
      }
    } catch (error) {
      uploadStatus(error.message || 'Jammer, iets het fout gegaan met die upload.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}
