// visualizer.js —— 频谱可视化（挂载到全局）

let canvas, ctx, analyser, dataArray, animationId, audioContext;
let lastHeights = [];

/**
 * 初始化音频可视化
 * @param {HTMLAudioElement} audioElement
 */
function initVisualizer(audioElement) {
  cleanupVisualizer(); // 先清理旧实例

  canvas = document.getElementById('visualizerCanvas');
  if (!canvas) return;

  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  const source = audioContext.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  animateVisualizer();
}

/**
 * 清理可视化资源
 */
function cleanupVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyser = null;
  }
  lastHeights = [];
}

/**
 * 调整 Canvas 大小
 */
function resizeCanvas() {
  const canvas = document.getElementById('visualizerCanvas');
  if (canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
}

/**
 * 动画循环
 */
function animateVisualizer() {
  if (!analyser || !ctx || !canvas) return;

  animationId = requestAnimationFrame(animateVisualizer);
  analyser.getByteFrequencyData(dataArray);

  const width = canvas.width;
  const height = canvas.height;
  const drawHeight = height * 0.3;
  const startY = height - drawHeight;

  // 清屏（深色背景）
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, width, height);

  const barCount = 64;
  const gap = 4;
  const barWidth = (width / barCount) - gap;

  if (lastHeights.length !== barCount) {
    lastHeights = new Array(barCount).fill(0);
  }

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor(i * dataArray.length / barCount);
    let rawHeight = dataArray[dataIndex] / 255;
    let targetHeight = Math.pow(rawHeight, 1.2) * drawHeight;

    let currentHeight = lastHeights[i];
    if (targetHeight > currentHeight) {
      currentHeight = targetHeight;
    } else {
      currentHeight *= 0.85; // 平滑衰减
    }
    lastHeights[i] = currentHeight;

    const x = i * (barWidth + gap) + gap / 2;
    const y = startY + (drawHeight - currentHeight);

    // 主体柱状图（琥珀色）
    ctx.fillStyle = 'rgba(255, 204, 0, 0.65)';
    ctx.fillRect(x, y, barWidth, currentHeight);

    // 顶部高光
    if (currentHeight > 8) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(x, y, barWidth, 2);
    }
  }
}

// 暴露到全局，供 main.js 调用
window.initVisualizer = initVisualizer;
window.cleanupVisualizer = cleanupVisualizer;