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

// === 频谱设置状态（从 localStorage 读取）===
let visualizerEnabled = localStorage.getItem('visualizerEnabled') !== 'false';
let visualizerColor = localStorage.getItem('visualizerColor') || '#ffcc00';
let visualizerHeightRatio = parseFloat(localStorage.getItem('visualizerHeightRatio') || '0.3');

// 新增：平滑参数
let riseSpeed = parseFloat(localStorage.getItem('riseSpeed') || '0.4');
let fallSpeed = parseFloat(localStorage.getItem('fallSpeed') || '0.1');


let songs = [];
let currentSongIndex = 0;
let analyser, dataArray, animationId;
let audioContext = null;
let isPlaying = false;
let lastHeights = []; // 用于平滑动画
let fftSize = 256; // 频谱分析大小

// 调整画布大小以适应窗口

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
      renderLyrics([{ time: 0, text: "歌词解析错误" }]);
    }
  } else {
    renderLyrics([{ time: 0, text: "无歌词文件" }]);
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

// === 频谱设置 UI 绑定 ===
{
  const visualizerToggle = document.getElementById('visualizerToggle');
  const visualizerColorInput = document.getElementById('visualizerColor');
  const visualizerHeightInput = document.getElementById('visualizerHeight');
  const visualizerHeightValue = document.getElementById('visualizerHeightValue');
  // === 新增：平滑参数 UI 绑定 ===
  const riseSpeedSlider = document.getElementById('riseSpeedSlider');
  const fallSpeedSlider = document.getElementById('fallSpeedSlider');
  const riseSpeedValue = document.getElementById('riseSpeedValue');
  const fallSpeedValue = document.getElementById('fallSpeedValue');

  // 初始化滑块和显示值
  riseSpeedSlider.value = riseSpeed;
  fallSpeedSlider.value = fallSpeed;
  riseSpeedValue.textContent = riseSpeed.toFixed(2);
  fallSpeedValue.textContent = fallSpeed.toFixed(2);

  // 通用保存函数（可复用）
  function saveVisualizerSetting(key, value) {
    localStorage.setItem(key, value);
  }

  // 上升速度
  riseSpeedSlider.addEventListener('input', () => {
    riseSpeed = parseFloat(riseSpeedSlider.value);
    riseSpeedValue.textContent = riseSpeed.toFixed(2);
    saveVisualizerSetting('riseSpeed', riseSpeed);
  });

  // 下降速度
  fallSpeedSlider.addEventListener('input', () => {
    fallSpeed = parseFloat(fallSpeedSlider.value);
    fallSpeedValue.textContent = fallSpeed.toFixed(2);
    saveVisualizerSetting('fallSpeed', fallSpeed);
  });

  // 初始化 UI
  visualizerToggle.checked = visualizerEnabled;
  visualizerColorInput.value = visualizerColor;
  visualizerHeightInput.value = visualizerHeightRatio;
  visualizerHeightValue.textContent = Math.round(visualizerHeightRatio * 100) + '%';

  // 保存并应用设置
  function saveAndApplyVisualizerSettings() {
    localStorage.setItem('visualizerEnabled', visualizerEnabled);
    localStorage.setItem('visualizerColor', visualizerColor);
    localStorage.setItem('visualizerHeightRatio', visualizerHeightRatio);

    if (visualizerEnabled && audioContext && !animationId) {
      animateVisualizer(); // 重新启动动画
    } else if (!visualizerEnabled) {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
      // 清屏
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  visualizerToggle.addEventListener('change', () => {
    visualizerEnabled = visualizerToggle.checked;
    saveAndApplyVisualizerSettings();
  });

  visualizerColorInput.addEventListener('input', () => {
    visualizerColor = visualizerColorInput.value;
    saveAndApplyVisualizerSettings();
  });

  visualizerHeightInput.addEventListener('input', () => {
    visualizerHeightRatio = parseFloat(visualizerHeightInput.value);
    visualizerHeightValue.textContent = Math.round(visualizerHeightRatio * 100) + '%';
    saveAndApplyVisualizerSettings();
  });
}

// 频谱可视化
function initAudioContextOnce() {
  if (audioContext) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  // 启动动画（根据设置决定是否真画）
  if (visualizerEnabled) {
    animateVisualizer();
  }
}

function animateVisualizer() {
  if (!analyser || !visualizerEnabled) {
    // 即使关闭，也保持 requestAnimationFrame 避免中断，但只清屏
    animationId = requestAnimationFrame(animateVisualizer);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  animationId = requestAnimationFrame(animateVisualizer);
  analyser.getByteFrequencyData(dataArray);

  const width = canvas.width;
  const height = canvas.height;
  const drawHeight = height * visualizerHeightRatio; // 使用设置的高度
  const startY = height - drawHeight;

  // 清除整个画布（深空黑）
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width, height);

  const barCount = 64;
  // const barCount = dataArray.length;
  const gap = 4;
  const barWidth = (width / barCount) - gap;

  // 初始化 lastHeights 数组

  if (lastHeights.length !== barCount) {
    lastHeights = new Array(barCount).fill(0);
  }

  // const riseSpeed = 0.3; // 上升速度
  // const fallSpeed = 0.15; // 下降速度
  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor(i * dataArray.length / barCount);
    let rawHeight = dataArray[dataIndex] / 255;
    let targetHeight = Math.pow(rawHeight, 1.2) * drawHeight;

    let currentHeight = lastHeights[i] || 0;

    if (targetHeight > currentHeight) {
      // 快速上升
      currentHeight += (targetHeight - currentHeight) * riseSpeed;
    } else {
      // 缓慢下降
      currentHeight += (targetHeight - currentHeight) * fallSpeed;
    }

    // 防止负值（理论上不会，但保险）
    const minHeight = 2; // 至少显示2像素高度
    currentHeight = Math.max(currentHeight, minHeight);
    // currentHeight = Math.max(0, currentHeight);

    lastHeights[i] = currentHeight;

    const x = i * (barWidth + gap) + gap / 2;
    const y = startY + (drawHeight - currentHeight);

    // 彩虹色
    // 1. 先根据位置 i 确定基础色相（H）
    const hue = (i / barCount) * 360; // 彩虹色
    // 2. 再根据能量调整饱和度 S 或亮度 L
    const energy = dataArray[dataIndex] / 255;
    const saturation = 80 + energy * 20; // 能量越大越鲜艳
    const lightness = 40 + energy * 30;  // 能量越大越亮

    ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.8)`;
    ctx.fillRect(x, y, barWidth, currentHeight);

    // // 使用用户选择的颜色
    // ctx.fillStyle = visualizerColor + 'ff'; // 添加透明度 aa = ~67%
    // ctx.fillRect(x, y, barWidth, currentHeight);
    // 顶部高光
    if (currentHeight > 8) {
      // ctx.fillStyle = '#ffffff6f';
      // ctx.fillRect(x, y, barWidth, 2);

      const gradient = ctx.createLinearGradient(x, y, x, y + 4);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, 4);
    }
  }
  // // 在绘制完所有柱子后
  // ctx.strokeStyle = 'red';
  // ctx.lineWidth = 1;
  // ctx.beginPath();
  // ctx.moveTo(width, 0);
  // ctx.lineTo(width, height);
  // ctx.stroke();
}

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