// main.js —— 主播放器逻辑

document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素
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
  const nowPlayingEl = document.getElementById('nowPlaying');

  const settingsDrawer = document.getElementById('settingsDrawer');
  const playlistDrawer = document.getElementById('playlistDrawer');
  const overlay = document.getElementById('overlay');
  const playlistEl = document.getElementById('playlist');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const closePlaylistBtn = document.getElementById('closePlaylistBtn');
  const selectFolderBtn = document.getElementById('selectFolderBtn');
  const currentFolderPathEl = document.getElementById('currentFolderPath');

  // 状态变量
  let songs = [];
  let currentSongIndex = 0;
  let isPlaying = false;
  let lyricLines = [];

  // === 音频事件 ===
  audio.volume = parseFloat(volumeSlider.value);

  audio.addEventListener('loadedmetadata', () => {
    durationEl.textContent = formatTime(audio.duration);
    nowPlayingEl.textContent = songs[currentSongIndex]?.name || '未知歌曲';
  });

  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    currentTimeEl.textContent = formatTime(currentTime);
    updateProgressBar();
    highlightLyric(currentTime);
  });

  audio.addEventListener('ended', () => {
    playNext();
  });

  // === 控制按钮 ===
  playBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', playPrev);
  nextBtn.addEventListener('click', playNext);
  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value;
  });

  // 进度条点击拖拽
  progressContainer.addEventListener('click', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
  });

  // === 抽屉控制 ===
  settingsBtn.addEventListener('click', () => {
    settingsDrawer.classList.add('open');
    overlay.style.display = 'block';
  });

  playlistBtn.addEventListener('click', () => {
    playlistDrawer.classList.add('open');
    overlay.style.display = 'block';
  });

  [closeSettingsBtn, closePlaylistBtn, overlay].forEach(el => {
    el.addEventListener('click', () => {
      settingsDrawer.classList.remove('open');
      playlistDrawer.classList.remove('open');
      overlay.style.display = 'none';
    });
  });

  // === 文件夹选择（仅支持现代浏览器）===
  selectFolderBtn.addEventListener('click', async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      currentFolderPathEl.textContent = dirHandle.name;
      await loadSongsFromDirectory(dirHandle);
      renderPlaylist();
    } catch (err) {
      console.warn('用户取消选择或浏览器不支持:', err);
    }
  });

  // === 核心功能函数 ===

  function togglePlay() {
    if (songs.length === 0) return alert('请先选择音乐文件夹！');
    if (audio.paused) {
      audio.play().then(() => {
        isPlaying = true;
        playBtn.querySelector('#playIcon').style.display = 'none';
        playBtn.querySelector('#pauseIcon').style.display = 'block';
        initVisualizer(audio); // 启动频谱
      }).catch(err => {
        console.error('播放失败:', err);
        alert('无法播放当前歌曲，请检查文件格式或权限。');
      });
    } else {
      audio.pause();
      isPlaying = false;
      playBtn.querySelector('#playIcon').style.display = 'block';
      playBtn.querySelector('#pauseIcon').style.display = 'none';
    }
  }

  function playPrev() {
    if (songs.length === 0) return;
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(currentSongIndex);
  }

  function playNext() {
    if (songs.length === 0) return;
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    loadSong(currentSongIndex);
  }

  async function loadSong(index) {
    if (index < 0 || index >= songs.length) return;
    const song = songs[index];
    cleanupVisualizer(); // 清理旧频谱
    lyricLines = [];
    lyricsEl.innerHTML = '<div class="lyric-line">加载中...</div>';

    try {
      const url = URL.createObjectURL(song.file);
      audio.src = url;
      audio.load();
      await audio.play();
      isPlaying = true;
      playBtn.querySelector('#playIcon').style.display = 'none';
      playBtn.querySelector('#pauseIcon').style.display = 'block';

      // 尝试加载同名 .lrc 文件
      const lrcFile = songs.find(s => s.name === song.name && s.ext === '.lrc')?.file;
      if (lrcFile) {
        const lrcText = await lrcFile.text();
        lyricLines = parseLRC(lrcText);
      } else {
        lyricLines = [{ time: 0, text: "暂无歌词" }];
      }
      renderLyrics();
    } catch (err) {
      console.error('加载歌曲失败:', err);
      lyricsEl.innerHTML = '<div class="lyric-line">加载失败</div>';
    }
  }

  function updateProgressBar() {
    const percent = (audio.currentTime / (audio.duration || 1)) * 100;
    progressBar.style.width = `${percent}%`;
  }

  function highlightLyric(currentTime) {
    if (lyricLines.length === 0) return;
    let bestIndex = 0;
    for (let i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].time <= currentTime) {
        bestIndex = i;
      } else {
        break;
      }
    }
    const lines = lyricsEl.querySelectorAll('.lyric-line');
    lines.forEach((line, idx) => {
      if (idx === bestIndex) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    });
    // 滚动到当前歌词
    const activeLine = lines[bestIndex];
    if (activeLine) {
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function renderLyrics() {
    lyricsEl.innerHTML = lyricLines.map(line =>
      `<div class="lyric-line" data-time="${line.time}">${line.text}</div>`
    ).join('');
  }

  async function loadSongsFromDirectory(dirHandle) {
    const newSongs = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext)) {
          newSongs.push({ name: getCleanName(file.name), ext, file, type: 'audio' });
        } else if (ext === '.lrc') {
          newSongs.push({ name: getCleanName(file.name), ext, file, type: 'lrc' });
        }
      }
    }
    songs = newSongs;
  }

  function renderPlaylist() {
    const audioFiles = songs.filter(s => s.type === 'audio');
    playlistEl.innerHTML = audioFiles.map((song, idx) =>
      `<div class="playlist-item ${idx === currentSongIndex ? 'active' : ''}" data-index="${idx}">
        ${song.name}
      </div>`
    ).join('');

    document.querySelectorAll('.playlist-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        currentSongIndex = idx;
        loadSong(idx);
        playlistDrawer.classList.remove('open');
        overlay.style.display = 'none';
      });
    });

    document.querySelector('.drawer-header h3').textContent = `播放列表（${audioFiles.length} 首）`;
  }

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    cleanupVisualizer();
  });
});