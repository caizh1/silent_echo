// 经典演练与剧情战役分开启动，避免两个渲染器及输入监听器并存。
if (new URLSearchParams(location.search).get('mode') === 'classic' || new URLSearchParams(location.search).has('check')) {
  void import('./classic');
} else {
  void import('./story-app');
}
