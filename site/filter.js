const buttons = document.querySelectorAll('[data-filter]');
const works = document.querySelectorAll('[data-kind]');
for (const button of buttons) {
  button.addEventListener('click', () => {
    const kind = button.dataset.filter;
    for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
    let visible = 0;
    for (const work of works) {
      work.hidden = kind !== 'all' && work.dataset.kind !== kind;
      if (!work.hidden) visible += 1;
    }
    document.querySelector('.filter-empty').hidden = visible !== 0;
    document.querySelector('#filter-status').textContent = `显示 ${visible} 件作品`;
  });
}
