const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playlistBtn = document.getElementById('playlistBtn');
const settingsBtn = document.getElementById('settingsBtn');
const progressBar = document.getElementById('progressBar');
const progressContainer = document.getElementById('progressContainer');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const lyricsEl = document.getElementById('lyrics');
const volumeSlider = document.getElementById('volumeSlider');
const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');
const nowPlayingEl = document.getElementById('nowPlaying');

const settingsDrawer = document.getElementById('settingsDrawer');
const playlistDrawer = document.getElementById('playlistDrawer');
const overlay = document.getElementById('overlay');
const playlistEl = document.getElementById('playlist');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closePlaylistBtn = document.getElementById('closePlaylistBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const currentFolderPathEl = document.getElementById('currentFolderPath');


let songs = [];
let currentSongIndex = 0;
let analyser, dataArray, animationId;
let audioContext = null;
let isPlaying = false;

// === 频谱设置状态 ===
let visualizerEnabled = true;
let visualizerColor = '#ffcc00'; // 默认琥珀色
let visualizerHeightRatio = 0.3; // 占屏幕高度的比例

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function getCleanName(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// 文件夹选择
const folderInput = document.createElement('input');
folderInput.type = 'file';
folderInput.webkitdirectory = true;
folderInput.directory = true;
folderInput.multiple = true;
folderInput.style.display = 'none';
document.body.appendChild(folderInput);

selectFolderBtn.addEventListener('click', () => {
  folderInput.click();
});

folderInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const audioFiles = files.filter(f => f.name.match(/\.(mp3|wav|flac|m4a)$/i));
  const baseToAudio = new Map();
  for (const file of audioFiles) {
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    baseToAudio.set(baseName, file);
  }

  const lrcPromises = [];
  for (const file of files) {
    if (file.name.endsWith('.lrc')) {
      const baseName = file.name.replace(/\.lrc$/i, '');
      const promise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ baseName, content: reader.result });
        reader.onerror = () => resolve({ baseName, content: null });
        reader.readAsText(file, 'utf-8');
      });
      lrcPromises.push(promise);
    }
  }

  const lrcResults = await Promise.all(lrcPromises);
  const lrcMap = new Map();
  for (const { baseName, content } of lrcResults) {
    lrcMap.set(baseName, content);
  }

  songs = [];
  for (const [baseName, audioFile] of baseToAudio.entries()) {
    songs.push({
      name: audioFile.name,
      audioFile: audioFile,
      lrcContent: lrcMap.get(baseName) || null
    });
  }

  if (songs.length === 0) {
    alert('该文件夹中没有找到音频文件！');
    return;
  }

  // 显示路径或文件数
  let folderPath = '未选择文件夹';
  if (files[0].webkitRelativePath) {
    const parts = files[0].webkitRelativePath.split('/');
    folderPath = '/' + parts.slice(0, -1).join('/');
  } else {
    folderPath = `已选择 ${audioFiles.length} 个音频文件`;
  }
  currentFolderPathEl.textContent = folderPath;

  currentSongIndex = 0;
  await loadSong(currentSongIndex);

  if (!audioContext) {
    initAudioContextOnce();
  }
});

async function loadSong(index) {
  cleanupCurrentSong();

  const song = songs[index];
  const url = URL.createObjectURL(song.audioFile);
  audio.src = url;
  nowPlayingEl.textContent = getCleanName(song.name);

  lyricsEl.innerHTML = '';
  if (song.lrcContent) {
    try {
      const lyrics = parseLRC(song.lrcContent);
      renderLyrics(lyrics);
    } catch (err) {
      console.error("歌词解析失败:", err);
      renderLyrics([{ time: 0, text: "⚠️ 歌词解析错误" }]);
    }
  } else {
    renderLyrics([{ time: 0, text: "🎵 无歌词文件" }]);
  }

  isPlaying = false;
  updatePlayButton();
  setTimeout(renderPlaylist, 50);
}

function parseLRC(lrc) {
  if (!lrc || typeof lrc !== 'string') return [{ time: 0, text: "歌词为空" }];
  const lines = lrc.split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    let text = line;
    matches.forEach(m => text = text.replace(m[0], '').trim());
    if (!text) continue;
    for (const match of matches) {
      const min = parseInt(match[1]) || 0;
      const sec = parseInt(match[2]) || 0;
      const msRaw = match[3] || '0';
      const ms = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10);
      const time = min * 60 + sec + ms / 1000;
      if (time >= 0) {
        result.push({ time, text });
      }
    }
  }
  const unique = Array.from(new Map(result.map(item => [item.time + '|' + item.text, item])).values());
  unique.sort((a, b) => a.time - b.time);
  return unique.length ? unique : [{ time: 0, text: "未找到有效歌词" }];
}

function renderLyrics(lyrics) {
  lyricsEl.innerHTML = '';
  lyrics.forEach(item => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.dataset.time = item.time;
    div.textContent = item.text;
    lyricsEl.appendChild(div);
  });
}

function renderPlaylist() {
  playlistEl.innerHTML = '';
  const drawerHeader = document.querySelector('#playlistDrawer .drawer-header h3');
  drawerHeader.textContent = `播放列表（${songs.length} 首）`;

  songs.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = 'playlist-item';
    if (index === currentSongIndex) {
      item.classList.add('active');
    }
    item.textContent = getCleanName(song.name);
    item.dataset.index = index;
    item.addEventListener('click', () => {
      const wasPlaying = isPlaying;
      currentSongIndex = index;
      loadSong(currentSongIndex).then(() => {
        if (wasPlaying) audio.play();
      });
    });
    playlistEl.appendChild(item);
  });
}

function togglePlay() {
  if (songs.length === 0) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play().catch(e => console.warn("播放失败:", e));
  }
}

function nextSong() {
  if (songs.length <= 1) return;
  const wasPlaying = isPlaying;
  currentSongIndex = (currentSongIndex + 1) % songs.length;
  loadSong(currentSongIndex).then(() => {
    if (wasPlaying) audio.play();
  });
}

function prevSong() {
  if (songs.length === 0) return;
  const wasPlaying = isPlaying;
  currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
  loadSong(currentSongIndex).then(() => {
    if (wasPlaying) audio.play();
  });
}

playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
playlistBtn.addEventListener('click', () => {
  playlistDrawer.classList.add('open');
  overlay.classList.add('active');
  renderPlaylist();
});

audio.addEventListener('play', () => {
  isPlaying = true;
  updatePlayButton();
});
audio.addEventListener('pause', () => {
  isPlaying = false;
  updatePlayButton();
});
audio.addEventListener('ended', nextSong);

function updatePlayButton() {
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  if (isPlaying) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'block';
  } else {
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
  }
}

audio.addEventListener('loadedmetadata', () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener('timeupdate', () => {
  if (audio.duration) {
    const percent = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = `${percent}%`;
  }
  currentTimeEl.textContent = formatTime(audio.currentTime);
  updateLyricsHighlight();
});

progressContainer.addEventListener('click', (e) => {
  const width = progressContainer.clientWidth;
  const clickX = e.offsetX;
  audio.currentTime = (clickX / width) * audio.duration;
});

function updateLyricsHighlight() {
  const currentTime = audio.currentTime;
  const lines = document.querySelectorAll('.lyric-line');
  let activeLine = null;

  lines.forEach(line => {
    const time = parseFloat(line.dataset.time);
    if (currentTime >= time) {
      activeLine = line;
    }
  });

  lines.forEach(line => line.classList.remove('active'));
  if (activeLine) {
    activeLine.classList.add('active');
    const container = document.querySelector('.lyrics-container');
    const offsetTop = activeLine.offsetTop - container.offsetHeight / 2 + activeLine.offsetHeight / 2;
    lyricsEl.style.transform = `translateY(${-offsetTop}px)`;
  }
}

volumeSlider.addEventListener('input', () => {
  audio.volume = volumeSlider.value;
});

// 频谱可视化
function initAudioContextOnce() {
  if (audioContext) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);
  animateVisualizer();
}

function animateVisualizer() {
  if (!analyser) return;
  animationId = requestAnimationFrame(animateVisualizer);
  analyser.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const barWidth = (canvas.width / dataArray.length) * 2;
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = (dataArray[i] / 255) * canvas.height * 0.5;
    const hue = 40 + (dataArray[i] / 255) * 20; // 金橙色渐变
    ctx.fillStyle = `hsla(${hue}, 90%, 65%, 0.85)`;
    ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
    x += barWidth;
  }
}
// function animateVisualizer() {
//   if (!analyser) return;
//   animationId = requestAnimationFrame(animateVisualizer);
//   analyser.getByteFrequencyData(dataArray);

//   // 渐隐残影：用半透明黑色覆盖，制造拖尾
//   ctx.fillStyle = 'rgba(10, 10, 15, 0.1)';
//   ctx.fillRect(0, 0, canvas.width, canvas.height);

//   const width = canvas.width;
//   const height = canvas.height;
//   const barCount = 128; // 减少柱数，更简洁
//   const sliceWidth = width / barCount;

//   for (let i = 0; i < barCount; i++) {
//     const energy = dataArray[i] / 255; // 0~1
//     const barHeight = energy * height * 0.6;

//     // X 位置居中分布（只画中间部分，两边留黑）
//     const x = (width - barCount * sliceWidth) / 2 + i * sliceWidth;

//     // 创建垂直渐变：底部橙红 → 顶部金黄
//     const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
//     gradient.addColorStop(0, `hsla(30, 90%, 50%, ${0.7 * energy})`);   // 橙红底
//     gradient.addColorStop(0.6, `hsla(45, 95%, 65%, ${0.8 * energy})`); // 亮橙
//     gradient.addColorStop(1, `hsla(60, 100%, 80%, ${0.9 * energy})`);  // 金黄顶

//     ctx.fillStyle = gradient;
//     ctx.fillRect(x, height - barHeight, sliceWidth * 0.8, barHeight);

//     // ✨ 高频粒子效果（仅在能量高时触发）
//     if (energy > 0.7 && Math.random() > 0.7) {
//       const particleY = height - barHeight - Math.random() * 30;
//       const particleSize = 2 + Math.random() * 3;
//       const hue = 50 + Math.random() * 20;
//       ctx.fillStyle = `hsla(${hue}, 100%, 80%, ${0.6 + Math.random() * 0.4})`;
//       ctx.beginPath();
//       ctx.arc(x + sliceWidth * 0.4, particleY, particleSize, 0, Math.PI * 2);
//       ctx.fill();
//     }
//   }
// }
// let lastHeights = [];

// function animateVisualizer() {
//   if (!analyser) return;
//   animationId = requestAnimationFrame(animateVisualizer);
//   analyser.getByteFrequencyData(dataArray);

//   const width = canvas.width;
//   const height = canvas.height;

//   // 只绘制底部区域（例如 30% 高度）
//   const drawHeight = height * 0.3;
//   const startY = height - drawHeight;

//   // 清除整个画布（深空黑）
//   ctx.fillStyle = '#0a0a0f';
//   ctx.fillRect(0, 0, width, height);

//   const barCount = 64; // 更少柱子，更简洁
//   const gap = 4;
//   const barWidth = (width / barCount) - gap;

//   // 平滑处理：让柱子下降更自然
//   if (lastHeights.length !== barCount) {
//     lastHeights = new Array(barCount).fill(0);
//   }

//   for (let i = 0; i < barCount; i++) {
//     // 映射到低频更密集（人耳敏感区）
//     const dataIndex = Math.floor(i * dataArray.length / barCount);
//     let rawHeight = dataArray[dataIndex] / 255;

//     // 轻微放大动态范围
//     let targetHeight = Math.pow(rawHeight, 1.2) * drawHeight;

//     // 平滑衰减（模拟惯性）
//     let currentHeight = lastHeights[i];
//     if (targetHeight > currentHeight) {
//       currentHeight = targetHeight; // 上升瞬时
//     } else {
//       currentHeight *= 0.85; // 下降缓动
//     }
//     lastHeights[i] = currentHeight;

//     const x = i * (barWidth + gap) + gap / 2;
//     const y = startY + (drawHeight - currentHeight);

//     // 统一金橙色，带透明度
//     ctx.fillStyle = 'rgba(255, 204, 0, 0.65)';
//     ctx.fillRect(x, y, barWidth, currentHeight);

//     // 顶部加一点高光（可选）
//     if (currentHeight > 8) {
//       ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
//       ctx.fillRect(x, y, barWidth, 2);
//     }
//   }
// }
function cleanupCurrentSong() {
  if (audio.src) {
    URL.revokeObjectURL(audio.src);
    audio.src = '';
  }
}

// 抽屉控制
settingsBtn.addEventListener('click', () => {
  settingsDrawer.classList.add('open');
  overlay.classList.add('active');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsDrawer.classList.remove('open');
  overlay.classList.remove('active');
});

closePlaylistBtn.addEventListener('click', () => {
  playlistDrawer.classList.remove('open');
  overlay.classList.remove('active');
});

overlay.addEventListener('click', () => {
  settingsDrawer.classList.remove('open');
  playlistDrawer.classList.remove('open');
  overlay.classList.remove('active');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    settingsDrawer.classList.remove('open');
    playlistDrawer.classList.remove('open');
    overlay.classList.remove('active');
  }
});

window.addEventListener('beforeunload', () => {
  if (animationId) cancelAnimationFrame(animationId);
  if (audioContext) {
    audioContext.close().catch(console.warn);
  }
  cleanupCurrentSong();
});