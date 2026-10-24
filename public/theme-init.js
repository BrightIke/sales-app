(function () {
  try {
    var mode = localStorage.getItem('akanti-theme') || 'system'
    var dark =
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
    var tag = document.getElementById('theme-color')
    if (tag) tag.setAttribute('content', dark ? '#12171F' : '#FFFFFF')
  } catch (e) {}
})()
