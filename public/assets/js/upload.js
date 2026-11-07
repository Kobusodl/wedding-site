const uploadForm = document.getElementById('upload-form');
const progressList = document.getElementById('upload-progress');
const fileInput = document.getElementById('media-files');
const MAX_UPLOAD_PHOTOS = 200;
const MAX_UPLOAD_VIDEOS = 2;
let uploadBatch = null;

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
  if (imageFiles.length > MAX_UPLOAD_PHOTOS) return `Laai asseblief maksimum ${MAX_UPLOAD_PHOTOS} foto’s op een slag op.`;
  if (videoFiles.length > MAX_UPLOAD_VIDEOS) return `Laai asseblief maksimum ${MAX_UPLOAD_VIDEOS} video’s op een slag op.`;
  if (files.some((file) => file.size === 0)) return 'Die keuse bevat ’n leë lêer.';

  for (const file of imageFiles) {
    if (file.size > 10 * 1024 * 1024) return `${file.name} is groter as 10 MB.`;
  }
  for (const file of videoFiles) {
    if (file.size > 50 * 1024 * 1024) return `${file.name} is groter as 50 MB.`;
  }
  return '';
}

async function preflightBatch({ password, files }) {
  const batchManifest = files.map((file) => ({
    name: file.name,
    mediaType: classifyFile(file),
    size: file.size
  }));
  const preflightForm = new FormData();
  preflightForm.append('password', password);
  preflightForm.append('preflight', 'true');
  preflightForm.append('batchManifest', JSON.stringify(batchManifest));

  let response;
  try {
    response = await fetch('/api/upload', { method: 'POST', body: preflightForm });
  } catch {
    throw new Error('Die verbinding het onderbreek. Probeer asseblief weer.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || 'Die oplaai-batch kon nie aanvaar word nie.');
  }
}

function describeUploadBatch(batch) {
  const photos = batch.filter((entry) => entry.mediaType === 'image');
  const videos = batch.filter((entry) => entry.mediaType === 'video');
  const successes = (entries) => entries.filter((entry) => entry.state === 'done').length;
  return [
    photos.length && `${successes(photos)} van ${photos.length} foto’s opgelaai`,
    videos.length && `${successes(videos)} van ${videos.length} video’s opgelaai`
  ].filter(Boolean).join(' · ');
}

if (uploadForm && fileInput) {
  const submitBtn = uploadForm.querySelector('button[type="submit"]');
  fileInput.addEventListener('change', () => {
    uploadBatch = null;
    submitBtn.textContent = 'Laai op';
    progressList?.replaceChildren();
    const status = document.getElementById('upload-status');
    if (status) {
      status.textContent = '';
      status.className = 'status';
    }
  });

  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (window.galleryUploadInProgress || window.galleryUploadsAvailable === false) return;
    const form = new FormData(uploadForm);
    const password = String(form.get('password') || '').trim();
    const uploaderName = String(form.get('uploaderName') || '').trim();
    const uploaderMessage = String(form.get('uploaderMessage') || '').trim();
    const files = Array.from(fileInput.files || []);

    if (!password) {
      uploadStatus('Vul asseblief die trou-wagwoord in.', 'error');
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

    uploadBatch ||= files.map((file) => ({ file, mediaType: classifyFile(file), state: 'pending' }));
    const pending = uploadBatch.filter(({ state }) => state === 'pending' || state === 'failed');
    if (!pending.length) {
      uploadStatus('Kyk eers in die gallery vir die lêers waarvan die oplaai onseker is.', 'error');
      return;
    }

    window.galleryUploadInProgress = true;
    submitBtn.disabled = fileInput.disabled = true;
    uploadStatus('Kontroleer die oplaai-batch...', 'info');

    let uploaded = 0;
    let stopMessage = '';
    try {
      await preflightBatch({ password, files: pending.map(({ file }) => file) });

      for (const entry of pending) {
        const { file } = entry;
        uploadStatus(`${describeUploadBatch(uploadBatch)}. Besig met: ${file.name}`, 'info');
        const itemForm = new FormData();
        itemForm.append('password', password);
        itemForm.append('uploaderName', uploaderName);
        itemForm.append('uploaderMessage', uploaderMessage);
        itemForm.append('file', file);
        try {
          const response = await fetch('/api/upload', { method: 'POST', body: itemForm });
          const result = await response.json().catch(() => ({}));
          if (response.ok && result.ok === true) {
            entry.state = 'done';
            uploaded += 1;
          } else if ([400, 413, 415, 422].includes(response.status)) {
            entry.state = 'failed';
            entry.message = result.error || 'Die lêer is geweier.';
          } else if ([401, 403, 409, 429].includes(response.status)) {
            stopMessage = result.error || 'Oplaai is gestop. Probeer asseblief later weer.';
            break;
          } else {
            throw new Error('Upload result unknown');
          }
        } catch {
          // The server may have saved this file before the connection dropped.
          entry.state = 'unknown';
          stopMessage = 'Die oplaai kon nie bevestig word nie. Kyk eers in die gallery voordat jy dié lêer weer kies.';
          break;
        }
      }
    } catch (error) {
      stopMessage = error.message || 'Die oplaai-batch kon nie aanvaar word nie.';
    } finally {
      const failed = uploadBatch.filter(({ state }) => state === 'failed');
      const unknown = uploadBatch.filter(({ state }) => state === 'unknown');
      const remaining = uploadBatch.filter(({ state }) => state === 'pending').length;
      const complete = !failed.length && !unknown.length && !remaining;
      const summary = [
        describeUploadBatch(uploadBatch),
        failed.length && `${failed.length} misluk`,
        unknown.length && `${unknown.length} onbevestig`,
        remaining && `${remaining} nog nie opgelaai nie`
      ].filter(Boolean).join(' · ');
      progressList?.replaceChildren();
      failed.forEach(({ file, message }) => addProgress(`Misluk: ${file.name} — ${message}`));
      unknown.forEach(({ file }) => addProgress(`Onbevestig: ${file.name} — kyk eers in die gallery.`));
      uploadStatus(`${complete ? 'Dankie! ' : ''}${summary}.${stopMessage ? ` ${stopMessage}` : ''}`, complete ? 'success' : 'error');
      if (complete) {
        uploadForm.reset();
        uploadBatch = null;
      }
      submitBtn.textContent = failed.length || remaining ? 'Probeer oorblywende lêers weer' : 'Laai op';
      window.galleryUploadInProgress = false;
      submitBtn.disabled = fileInput.disabled = window.galleryUploadsAvailable === false;
    }
    if (uploaded) await window.afterSuccessfulUpload?.();
  });
}
