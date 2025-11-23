// utils.js —— 工具函数库

/**
 * 移除文件扩展名
 */
function getCleanName(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * 将秒数格式化为 mm:ss
 */
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

/**
 * 解析 LRC 歌词字符串，返回有序时间-文本数组
 */
function parseLRC(lrc) {
  if (!lrc || typeof lrc !== 'string') {
    return [{ time: 0, text: "歌词为空" }];
  }
  const lines = lrc.split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // 匹配所有 [mm:ss.xx] 时间标签
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!matches.length) continue;
    // 提取歌词文本（去掉所有时间标签）
    let text = line;
    matches.forEach(m => text = text.replace(m[0], '').trim());
    if (!text) continue;
    // 为每个时间标签生成一个条目
    for (const match of matches) {
      const min = parseInt(match[1], 10) || 0;
      const sec = parseInt(match[2], 10) || 0;
      const msRaw = match[3] || '0';
      const ms = parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10);
      const time = min * 60 + sec + ms / 1000;
      if (time >= 0) {
        result.push({ time, text });
      }
    }
  }
  // 去重并排序
  const unique = Array.from(
    new Map(result.map(item => [item.time + '|' + item.text, item])).values()
  );
  unique.sort((a, b) => a.time - b.time);
  return unique.length ? unique : [{ time: 0, text: "未找到有效歌词" }];
}